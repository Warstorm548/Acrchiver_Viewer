package archive

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"hash"
	"hash/crc32"
	"hash/crc64"
	"io"

	"github.com/ulikunitz/xz/lzma"
)

// Streaming .xz container reader, written from "The .xz File Format" 1.x like the browser's
// src/engine/xz.ts: stream header/footer, blocks with filter chains, checks, index, stream
// padding and concatenated streams. LZMA2 data is decoded by ulikunitz/xz's lzma.Reader2 with the
// block's own dictionary size, which is checked against MaxDictionarySize before anything is
// allocated (ulikunitz/xz's own xz reader allocates whatever a file declares, up to 4 GiB).

// MaxDictionarySize: the largest LZMA/LZMA2 dictionary accepted (xz -9 uses 64 MiB).
const MaxDictionarySize = 256 << 20

var (
	xzHeaderMagic = []byte{0xfd, '7', 'z', 'X', 'Z', 0}
	xzFooterMagic = []byte{'Y', 'Z'}
	xzCheckSizes  = [16]int{0, 4, 4, 4, 8, 8, 8, 16, 16, 16, 32, 32, 32, 64, 64, 64}
	crc64Table    = crc64.MakeTable(crc64.ECMA)
)

const (
	xzCheckCRC32  = 1
	xzCheckCRC64  = 4
	xzCheckSHA256 = 10
	filterDelta   = 0x03
	filterLZMA2   = 0x21
)

func xzCorrupt(detail string) error { return fmt.Errorf("%w: xz: %s", ErrCorrupt, detail) }

// countingReader counts consumed bytes (for 4-byte alignment and block sizes).
type countingReader struct {
	r     *bufio.Reader
	count int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.count += int64(n)
	return n, err
}

func (c *countingReader) ReadByte() (byte, error) {
	b, err := c.r.ReadByte()
	if err == nil {
		c.count++
	}
	return b, err
}

func (c *countingReader) readFull(n int) ([]byte, error) {
	buf := make([]byte, n)
	if _, err := io.ReadFull(c, buf); err != nil {
		return nil, xzCorrupt("unexpected end of data")
	}
	return buf, nil
}

func readVarInt(data []byte, pos *int) (uint64, error) {
	var value uint64
	for i := 0; i < 9; i++ {
		if *pos >= len(data) {
			return 0, xzCorrupt("truncated integer")
		}
		b := data[*pos]
		*pos++
		value |= uint64(b&0x7f) << (7 * i)
		if b&0x80 == 0 {
			if i > 0 && b == 0 {
				return 0, xzCorrupt("non-minimal integer encoding")
			}
			return value, nil
		}
	}
	return 0, xzCorrupt("integer too long")
}

type xzBlock struct{ unpadded, uncompressed uint64 }

type xzReader struct {
	in          *countingReader
	streamStart int64
	checkType   byte
	blocks      []xzBlock
	block       io.Reader // decoded data of the current block, nil between blocks
	blockStart  int64
	dataStart   int64
	headerSizes [2]int64 // declared compressed / uncompressed size, -1 if absent
	written     uint64
	hash        hash.Hash
	done        bool
}

func newXzReader(r io.Reader) (*xzReader, error) {
	x := &xzReader{in: &countingReader{r: bufio.NewReaderSize(r, 256<<10)}}
	if err := x.readStreamHeader(); err != nil {
		return nil, err
	}
	return x, nil
}

func (x *xzReader) readStreamHeader() error {
	x.streamStart = x.in.count
	header, err := x.in.readFull(12)
	if err != nil {
		return err
	}
	if !bytes.Equal(header[:6], xzHeaderMagic) {
		return xzCorrupt("bad stream header")
	}
	if crc32.ChecksumIEEE(header[6:8]) != binary.LittleEndian.Uint32(header[8:]) {
		return xzCorrupt("stream header CRC mismatch")
	}
	if header[6] != 0 || header[7]&0xf0 != 0 {
		return xzCorrupt("unsupported stream flags")
	}
	x.checkType = header[7]
	x.blocks = x.blocks[:0]
	return nil
}

func (x *xzReader) Read(p []byte) (int, error) {
	for {
		if x.done {
			return 0, io.EOF
		}
		if x.block == nil {
			if err := x.next(); err != nil {
				return 0, err
			}
			continue
		}
		n, err := x.block.Read(p)
		if n > 0 {
			x.written += uint64(n)
			if x.hash != nil {
				x.hash.Write(p[:n])
			}
		}
		if err == io.EOF {
			if err := x.finishBlock(); err != nil {
				return n, err
			}
			if n > 0 {
				return n, nil
			}
			continue
		}
		if err != nil {
			return n, toCorrupt(err)
		}
		if n > 0 {
			return n, nil
		}
	}
}

func toCorrupt(err error) error {
	if err == io.ErrUnexpectedEOF {
		return xzCorrupt("unexpected end of data")
	}
	return fmt.Errorf("%w: %v", ErrCorrupt, err)
}

// next starts the next block, or reads the index and footer (and maybe the next stream).
func (x *xzReader) next() error {
	first, err := x.in.ReadByte()
	if err != nil {
		return xzCorrupt("unexpected end of data")
	}
	if first == 0 {
		return x.finishStream()
	}
	x.blockStart = x.in.count - 1
	headerSize := (int(first) + 1) * 4
	rest, err := x.in.readFull(headerSize - 1)
	if err != nil {
		return err
	}
	header := append([]byte{first}, rest...)
	if crc32.ChecksumIEEE(header[:headerSize-4]) != binary.LittleEndian.Uint32(header[headerSize-4:]) {
		return xzCorrupt("block header CRC mismatch")
	}
	flags := header[1]
	if flags&0x3c != 0 {
		return xzCorrupt("unsupported block flags")
	}
	body := header[:headerSize-4]
	pos := 2
	x.headerSizes = [2]int64{-1, -1}
	for i, bit := range []byte{0x40, 0x80} {
		if flags&bit != 0 {
			value, err := readVarInt(body, &pos)
			if err != nil {
				return err
			}
			x.headerSizes[i] = int64(value)
		}
	}
	type filter struct {
		id         uint64
		properties []byte
	}
	var filters []filter
	for i := 0; i <= int(flags&3); i++ {
		id, err := readVarInt(body, &pos)
		if err != nil {
			return err
		}
		size, err := readVarInt(body, &pos)
		if err != nil {
			return err
		}
		if uint64(pos)+size > uint64(len(body)) {
			return xzCorrupt("truncated filter properties")
		}
		filters = append(filters, filter{id, body[pos : pos+int(size)]})
		pos += int(size)
	}
	for _, b := range body[pos:] {
		if b != 0 {
			return xzCorrupt("non-zero block header padding")
		}
	}

	last := filters[len(filters)-1]
	if last.id != filterLZMA2 {
		return fmt.Errorf("%w: xz compression filter 0x%x", ErrUnsupported, last.id)
	}
	if len(last.properties) != 1 || last.properties[0]&0x3f > 40 {
		return xzCorrupt("bad LZMA2 properties")
	}
	dictionary := lzma2DictionarySize(last.properties[0])
	if dictionary > MaxDictionarySize {
		return fmt.Errorf("%w: xz dictionary of %d MiB", ErrTooComplex, dictionary>>20)
	}
	if dictionary < lzma.MinDictCap {
		dictionary = lzma.MinDictCap
	}
	x.dataStart = x.in.count
	var reader io.Reader
	reader, err = lzma.Reader2Config{DictCap: int(dictionary)}.NewReader2(x.in)
	if err != nil {
		return toCorrupt(err)
	}
	// undo the preprocessing filters in reverse order of encoding
	for i := len(filters) - 2; i >= 0; i-- {
		f := filters[i]
		switch f.id {
		case filterDelta:
			if len(f.properties) != 1 {
				return xzCorrupt("bad delta properties")
			}
			reader = &deltaReader{source: reader, distance: int(f.properties[0]) + 1}
		default:
			c := bcjConverter(f.id)
			if c == nil {
				return fmt.Errorf("%w: xz filter 0x%x", ErrUnsupported, f.id)
			}
			if len(f.properties) != 0 && len(f.properties) != 4 {
				return xzCorrupt("bad BCJ properties")
			}
			var start uint32
			if len(f.properties) == 4 {
				start = binary.LittleEndian.Uint32(f.properties)
			}
			reader = newSimpleReader(reader, c, start)
		}
	}
	x.block = reader
	x.written = 0
	switch x.checkType {
	case xzCheckCRC32:
		x.hash = crc32.NewIEEE()
	case xzCheckCRC64:
		x.hash = crc64.New(crc64Table)
	case xzCheckSHA256:
		x.hash = sha256.New()
	default:
		// other (reserved) check types can't be verified; like xz, the data is still decoded
		x.hash = nil
	}
	return nil
}

func bcjConverter(id uint64) converter {
	switch id {
	case 0x04:
		return newX86()
	case 0x05:
		return powerPCConverter{}
	case 0x06:
		return ia64Converter{}
	case 0x07:
		return armConverter{}
	case 0x08:
		return armThumbConverter{}
	case 0x09:
		return sparcConverter{}
	}
	return nil
}

func lzma2DictionarySize(properties byte) int64 {
	bits := int64(properties & 0x3f)
	if bits == 40 {
		return 0xffffffff
	}
	return (2 | bits&1) << (bits/2 + 11)
}

func (x *xzReader) finishBlock() error {
	compressed := x.in.count - x.dataStart
	if x.headerSizes[0] >= 0 && x.headerSizes[0] != compressed {
		return xzCorrupt("compressed size mismatch")
	}
	if x.headerSizes[1] >= 0 && uint64(x.headerSizes[1]) != x.written {
		return xzCorrupt("uncompressed size mismatch")
	}
	unpadded := x.in.count - x.blockStart
	for (x.in.count-x.streamStart)%4 != 0 {
		b, err := x.in.ReadByte()
		if err != nil || b != 0 {
			return xzCorrupt("bad block padding")
		}
	}
	checkSize := xzCheckSizes[x.checkType]
	stored, err := x.in.readFull(checkSize)
	if err != nil {
		return err
	}
	if x.hash != nil {
		actual := x.hash.Sum(nil)
		if x.checkType == xzCheckCRC32 || x.checkType == xzCheckCRC64 {
			// hash/crc32 and hash/crc64 sum big-endian; xz stores little-endian
			for i, j := 0, len(actual)-1; i < j; i, j = i+1, j-1 {
				actual[i], actual[j] = actual[j], actual[i]
			}
		}
		if !bytes.Equal(actual, stored) {
			return xzCorrupt("integrity check failed")
		}
	}
	x.blocks = append(x.blocks, xzBlock{uint64(unpadded) + uint64(checkSize), x.written})
	x.block = nil
	return nil
}

// finishStream reads the index (its indicator byte was already read) and the footer, then
// skips stream padding and starts the next stream if there is one.
func (x *xzReader) finishStream() error {
	indexStart := x.in.count - 1
	index := []byte{0}
	readVar := func() (uint64, error) {
		var raw []byte
		for i := 0; i < 9; i++ {
			b, err := x.in.ReadByte()
			if err != nil {
				return 0, xzCorrupt("truncated index")
			}
			raw = append(raw, b)
			if b&0x80 == 0 {
				break
			}
		}
		index = append(index, raw...)
		pos := 0
		return readVarInt(raw, &pos)
	}
	count, err := readVar()
	if err != nil {
		return err
	}
	if count != uint64(len(x.blocks)) {
		return xzCorrupt("index does not match blocks")
	}
	for _, block := range x.blocks {
		unpadded, err := readVar()
		if err != nil {
			return err
		}
		uncompressed, err := readVar()
		if err != nil {
			return err
		}
		if unpadded != block.unpadded || uncompressed != block.uncompressed {
			return xzCorrupt("index does not match blocks")
		}
	}
	for (x.in.count-indexStart)%4 != 0 {
		b, err := x.in.ReadByte()
		if err != nil || b != 0 {
			return xzCorrupt("bad index padding")
		}
		index = append(index, b)
	}
	stored, err := x.in.readFull(4)
	if err != nil {
		return err
	}
	if crc32.ChecksumIEEE(index) != binary.LittleEndian.Uint32(stored) {
		return xzCorrupt("index CRC mismatch")
	}
	footer, err := x.in.readFull(12)
	if err != nil {
		return err
	}
	if !bytes.Equal(footer[10:], xzFooterMagic) {
		return xzCorrupt("bad stream footer")
	}
	if crc32.ChecksumIEEE(footer[4:10]) != binary.LittleEndian.Uint32(footer) {
		return xzCorrupt("stream footer CRC mismatch")
	}
	if (int64(binary.LittleEndian.Uint32(footer[4:]))+1)*4 != int64(len(index))+4 {
		return xzCorrupt("backward size mismatch")
	}
	if footer[8] != 0 || footer[9] != x.checkType {
		return xzCorrupt("stream flags mismatch")
	}

	// stream padding (groups of four zero bytes), then maybe another stream
	for {
		peek, err := x.in.r.Peek(1)
		if err == io.EOF || len(peek) == 0 {
			x.done = true
			return nil
		}
		if err != nil {
			return err
		}
		if peek[0] != 0 {
			return x.readStreamHeader()
		}
		padding, err := x.in.readFull(4)
		if err != nil || !bytes.Equal(padding, []byte{0, 0, 0, 0}) {
			return xzCorrupt("bad stream padding")
		}
	}
}
