package archive

import (
	"bufio"
	"bytes"
	"compress/bzip2"
	"compress/flate"
	"context"
	"encoding/binary"
	"fmt"
	"hash"
	"hash/crc32"
	"io"
	"os"
	"strings"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/klauspost/compress/zstd"
	"github.com/ulikunitz/xz/lzma"

	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/deflate64"
)

// ZIP reading: the central directory is parsed here rather than by archive/zip, which keeps one
// File per header it finds whatever the declared count, so a crafted directory could exhaust
// memory; this parser stops at Limits.MaxEntries. Names, folders, symlinks and dates follow
// zip.js (src/engine/zip.ts), so the listing matches the browser's range mode.

// ZIP compression methods the helper decodes (the browser reads only store and deflate).
const (
	zipStore     = 0
	zipDeflate   = 8
	zipDeflate64 = 9
	zipBzip2     = 12
	zipLzma      = 14
	zipZstd      = 93
	zipXz        = 95
)

const (
	zipLocalHeaderSignature   = 0x04034b50
	zipCentralHeaderSignature = 0x02014b50
	zipEndSignature           = 0x06054b50
	zip64EndSignature         = 0x06064b50
	zip64LocatorSignature     = 0x07064b50
	zipEndLength              = 22
	zip64LocatorLength        = 20
	zip64EndLength            = 56
	zipCentralHeaderLength    = 46
	zipLocalHeaderLength      = 30
	zipFlagEncrypted          = 0x1
	zipFlagLzmaEndMarker      = 0x2
	zipFlagUTF8               = 0x800
)

// zipData is where a ZIP entry's data is and how to decode it.
type zipData struct {
	method     uint16
	flags      uint16
	crc        uint32
	compressed int64
	offset     int64 // of the local header until the scan resolves it to the data
}

func zipCorrupt(detail string) error { return fmt.Errorf("%w: zip: %s", ErrCorrupt, detail) }

func zipMethodSupported(method uint16) bool {
	switch method {
	case zipStore, zipDeflate, zipDeflate64, zipBzip2, zipLzma, zipZstd, zipXz:
		return true
	}
	return false
}

type zipDirectory struct {
	count, size, offset uint64
}

// findZipDirectory reads the end of central directory record (and the ZIP64 one when a field
// overflows), searching backwards from the end like archive/zip and zip.js.
func findZipDirectory(file io.ReaderAt, size int64) (zipDirectory, error) {
	tail := int64(zipEndLength + 0xffff)
	if tail > size {
		tail = size
	}
	buf := make([]byte, tail)
	if _, err := file.ReadAt(buf, size-tail); err != nil && err != io.EOF {
		return zipDirectory{}, corrupt(err)
	}
	end := -1
	for i := len(buf) - zipEndLength; i >= 0; i-- {
		if binary.LittleEndian.Uint32(buf[i:]) == zipEndSignature &&
			i+zipEndLength+int(binary.LittleEndian.Uint16(buf[i+20:])) <= len(buf) {
			end = i
			break
		}
	}
	if end < 0 {
		return zipDirectory{}, zipCorrupt("end of central directory not found")
	}
	record := buf[end:]
	directory := zipDirectory{
		count:  uint64(binary.LittleEndian.Uint16(record[10:])),
		size:   uint64(binary.LittleEndian.Uint32(record[12:])),
		offset: uint64(binary.LittleEndian.Uint32(record[16:])),
	}
	if directory.count != 0xffff && directory.size != 0xffffffff && directory.offset != 0xffffffff {
		return directory, nil
	}
	endOffset := size - tail + int64(end)
	if endOffset < zip64LocatorLength {
		return directory, nil
	}
	locator := make([]byte, zip64LocatorLength)
	if _, err := file.ReadAt(locator, endOffset-zip64LocatorLength); err != nil ||
		binary.LittleEndian.Uint32(locator) != zip64LocatorSignature {
		return directory, nil
	}
	recordOffset := binary.LittleEndian.Uint64(locator[8:])
	if recordOffset > uint64(size)-zip64EndLength {
		return zipDirectory{}, zipCorrupt("ZIP64 end of central directory out of range")
	}
	record64 := make([]byte, zip64EndLength)
	if _, err := file.ReadAt(record64, int64(recordOffset)); err != nil {
		return zipDirectory{}, corrupt(err)
	}
	if binary.LittleEndian.Uint32(record64) != zip64EndSignature {
		return zipDirectory{}, zipCorrupt("ZIP64 end of central directory not found")
	}
	return zipDirectory{
		count:  binary.LittleEndian.Uint64(record64[32:]),
		size:   binary.LittleEndian.Uint64(record64[40:]),
		offset: binary.LittleEndian.Uint64(record64[48:]),
	}, nil
}

// zipExtraFields splits an extra field into its blocks; a repeated id keeps the last (zip.js).
func zipExtraFields(extra []byte) map[uint16][]byte {
	fields := map[uint16][]byte{}
	for len(extra) >= 4 {
		id := binary.LittleEndian.Uint16(extra)
		length := int(binary.LittleEndian.Uint16(extra[2:]))
		if 4+length > len(extra) {
			break
		}
		fields[id] = extra[4 : 4+length]
		extra = extra[4+length:]
	}
	return fields
}

// cp437 is zip.js's table for names without the UTF-8 flag.
var cp437 = []rune("\x00☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !\"#$%&'()*+,-./0123456789:;<=>?" +
	"@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂" +
	"ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐" +
	"└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ")

// decodeZipName follows zip.js: UTF-8 when flagged or when the bytes are valid UTF-8 with
// something beyond ASCII, else CP437.
func decodeZipName(raw []byte, utf8Flag bool) string {
	if utf8Flag {
		return decodeUTF8(raw)
	}
	ascii := true
	for _, b := range raw {
		if b > 0x7f {
			ascii = false
			break
		}
	}
	if !ascii && utf8.Valid(raw) {
		return string(raw)
	}
	var name strings.Builder
	for _, b := range raw {
		name.WriteRune(cp437[b])
	}
	return name.String()
}

// decodeUTF8 replaces each invalid byte with U+FFFD, as the browser's TextDecoder does.
func decodeUTF8(raw []byte) string {
	if utf8.Valid(raw) {
		return string(raw)
	}
	var text strings.Builder
	for len(raw) > 0 {
		r, size := utf8.DecodeRune(raw)
		text.WriteRune(r)
		raw = raw[size:]
	}
	return text.String()
}

// zipModified is the entry's date in milliseconds, in zip.js's order of precedence (DOS date,
// PKWARE Unix, Info-ZIP Unix type 1, extended timestamp, NTFS). localTime is true when only the
// DOS date was found: it is a wall-clock time with no zone, sent as if UTC for the viewer to
// show in the user's own zone like the browser does.
func zipModified(dosTime, dosDate uint16, fields map[uint16][]byte) (modified int64, localTime bool) {
	modified = time.Date(int(dosDate>>9)+1980, time.Month(dosDate>>5&0xf), int(dosDate&0x1f),
		int(dosTime>>11), int(dosTime>>5&0x3f), int(dosTime&0x1f)*2, 0, time.UTC).UnixMilli()
	localTime = true
	unixSeconds := func(data []byte) int64 { return int64(int32(binary.LittleEndian.Uint32(data))) * 1000 }
	for _, id := range []uint16{0x000d, 0x5855} {
		if data := fields[id]; len(data) >= 8 {
			modified, localTime = unixSeconds(data[4:]), false
		}
	}
	// the central directory's extended timestamp holds only the modification time
	if data := fields[0x5455]; len(data) >= 5 {
		modified, localTime = unixSeconds(data[1:]), false
	}
	if data := fields[0x000a]; len(data) > 4 {
		for attributes := data[4:]; len(attributes) >= 4; {
			tag := binary.LittleEndian.Uint16(attributes)
			length := int(binary.LittleEndian.Uint16(attributes[2:]))
			if 4+length > len(attributes) {
				break
			}
			if tag == 0x0001 {
				if length == 24 {
					// 100 ns intervals since 1601
					ticks := binary.LittleEndian.Uint64(attributes[4:])
					modified, localTime = int64(ticks/10000)-11644473600000, false
				}
				break
			}
			attributes = attributes[4+length:]
		}
	}
	return modified, localTime
}

// scanZip lists a ZIP from its central directory.
func scanZip(ctx context.Context, file *os.File, size int64, limits Limits, progress *atomic.Int64) (*Index, error) {
	directory, err := findZipDirectory(file, size)
	if err != nil {
		return nil, err
	}
	if directory.count > uint64(limits.MaxEntries) {
		return nil, fmt.Errorf("%w: more than %d entries", ErrTooComplex, limits.MaxEntries)
	}
	if directory.offset > uint64(size) || directory.size > uint64(size)-directory.offset {
		return nil, zipCorrupt("central directory out of range")
	}
	section := io.NewSectionReader(file, int64(directory.offset), int64(directory.size))
	reader := bufio.NewReaderSize(&countReader{ctx: ctx, r: section, count: progress}, 256<<10)
	index := newIndex()
	nameBytes := 0
	header := make([]byte, zipCentralHeaderLength)
	local := make([]byte, zipLocalHeaderLength)
	for i := uint64(0); i < directory.count; i++ {
		if _, err := io.ReadFull(reader, header); err != nil {
			return nil, corrupt(err)
		}
		if binary.LittleEndian.Uint32(header) != zipCentralHeaderSignature {
			return nil, zipCorrupt("central directory header not found")
		}
		versionMadeBy := binary.LittleEndian.Uint16(header[4:])
		flags := binary.LittleEndian.Uint16(header[8:])
		method := binary.LittleEndian.Uint16(header[10:])
		dosTime := binary.LittleEndian.Uint16(header[12:])
		dosDate := binary.LittleEndian.Uint16(header[14:])
		data := &zipData{
			method:     method,
			flags:      flags,
			crc:        binary.LittleEndian.Uint32(header[16:]),
			compressed: int64(binary.LittleEndian.Uint32(header[20:])),
			offset:     int64(binary.LittleEndian.Uint32(header[42:])),
		}
		uncompressed := uint64(binary.LittleEndian.Uint32(header[24:]))
		nameLength := int(binary.LittleEndian.Uint16(header[28:]))
		extraLength := int(binary.LittleEndian.Uint16(header[30:]))
		commentLength := int(binary.LittleEndian.Uint16(header[32:]))
		external := binary.LittleEndian.Uint32(header[38:])
		variable := make([]byte, nameLength+extraLength+commentLength)
		if _, err := io.ReadFull(reader, variable); err != nil {
			return nil, corrupt(err)
		}
		rawName := variable[:nameLength]
		fields := zipExtraFields(variable[nameLength : nameLength+extraLength])

		// ZIP64: the fields that overflowed follow in this order
		if zip64 := fields[0x0001]; zip64 != nil {
			next := func(value *uint64) {
				if *value == 0xffffffff && len(zip64) >= 8 {
					*value = binary.LittleEndian.Uint64(zip64)
					zip64 = zip64[8:]
				}
			}
			compressed, offset := uint64(data.compressed), uint64(data.offset)
			next(&uncompressed)
			next(&compressed)
			next(&offset)
			if compressed > uint64(size) || offset > uint64(size) {
				return nil, zipCorrupt("entry out of range")
			}
			data.compressed, data.offset = int64(compressed), int64(offset)
		}

		utf8Flag := flags&zipFlagUTF8 != 0
		name := decodeZipName(rawName, utf8Flag)
		if unicodePath := fields[0x7075]; len(unicodePath) >= 5 && unicodePath[0] == 1 && !utf8Flag &&
			binary.LittleEndian.Uint32(unicodePath[1:]) == crc32.ChecksumIEEE(rawName) {
			name = decodeUTF8(unicodePath[5:])
		}

		path := NormalizePath(name)
		if path == "" {
			continue
		}
		nameBytes += 2 * len(path)
		if nameBytes > maxNameBytes {
			return nil, fmt.Errorf("%w: file names take more than %d MiB", ErrTooComplex, maxNameBytes>>20)
		}
		upper := external >> 16
		isDirectory := upper&0o170000 == 0o040000 ||
			(versionMadeBy>>8 == 0 && external&0x10 != 0) || strings.HasSuffix(name, "/")
		symlink := upper&0o170000 == 0o120000
		encrypted := flags&zipFlagEncrypted != 0
		modified, localTime := zipModified(dosTime, dosDate, fields)
		entry := &Entry{
			Path:      path,
			Name:      baseName(path),
			IsDir:     isDirectory,
			Supported: isDirectory || (!encrypted && !symlink && zipMethodSupported(method)),
			Modified:  modified,
			LocalTime: localTime,
		}
		if !isDirectory {
			if uncompressed > uint64(maxInt64) {
				return nil, zipCorrupt("entry size out of range")
			}
			entry.Size = int64(uncompressed)
			if entry.Supported {
				// the data follows the local header, whose name and extra field may differ in length
				if _, err := file.ReadAt(local, data.offset); err != nil ||
					binary.LittleEndian.Uint32(local) != zipLocalHeaderSignature {
					return nil, zipCorrupt("local file header not found")
				}
				data.offset += zipLocalHeaderLength + int64(binary.LittleEndian.Uint16(local[26:])) +
					int64(binary.LittleEndian.Uint16(local[28:]))
				if data.offset > size || data.compressed > size-data.offset {
					return nil, fmt.Errorf("%w: zip archive is truncated", ErrCorrupt)
				}
				entry.zip = data
				// Extract handles entries in this order
				entry.offset = data.offset
			}
		}
		index.add(entry)
		if index.Len() > limits.MaxEntries {
			return nil, fmt.Errorf("%w: more than %d entries", ErrTooComplex, limits.MaxEntries)
		}
	}
	return index, nil
}

const maxInt64 = 1<<63 - 1

// crcReader checks the CRC32 once the declared size has been read (ZIP and 7z).
type crcReader struct {
	r    io.Reader
	hash hash.Hash32
	left int64
	want uint32
}

func (c *crcReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.hash.Write(p[:n])
	c.left -= int64(n)
	if c.left == 0 && c.hash.Sum32() != c.want {
		return n, fmt.Errorf("%w: CRC mismatch", ErrCorrupt)
	}
	return n, err
}

// openZipEntry returns a reader of the entry's uncompressed data and a function closing it.
func openZipEntry(ctx context.Context, file *os.File, entry *Entry) (io.Reader, func(), error) {
	data := entry.zip
	compressed := bufio.NewReaderSize(&countReader{ctx: ctx,
		r: io.NewSectionReader(file, data.offset, data.compressed), count: new(atomic.Int64)}, 64<<10)
	var decoded io.Reader
	closeDecoder := func() {}
	switch data.method {
	case zipStore:
		decoded = compressed
	case zipDeflate:
		reader := flate.NewReader(compressed)
		decoded, closeDecoder = reader, func() { reader.Close() }
	case zipDeflate64:
		reader := deflate64.NewReader(compressed)
		decoded, closeDecoder = reader, func() { reader.Close() }
	case zipBzip2:
		decoded = bzip2.NewReader(compressed)
	case zipLzma:
		reader, err := newZipLzmaReader(compressed, data.flags, entry.Size)
		if err != nil {
			return nil, nil, err
		}
		decoded = reader
	case zipZstd:
		reader, err := zstd.NewReader(compressed, zstd.WithDecoderConcurrency(1),
			zstd.WithDecoderMaxWindow(MaxDictionarySize), zstd.WithDecoderLowmem(true))
		if err != nil {
			return nil, nil, corrupt(err)
		}
		decoded, closeDecoder = reader, reader.Close
	case zipXz:
		reader, err := newXzReader(compressed)
		if err != nil {
			return nil, nil, err
		}
		decoded = reader
	default:
		return nil, nil, fmt.Errorf("%w: zip compression method %d", ErrUnsupported, data.method)
	}
	return &crcReader{r: decoded, hash: crc32.NewIEEE(), left: entry.Size, want: data.crc}, closeDecoder, nil
}

// newZipLzmaReader reads ZIP's LZMA header (version, properties size, properties) and decodes
// with ulikunitz/xz, checking the dictionary before it is allocated.
func newZipLzmaReader(r *bufio.Reader, flags uint16, size int64) (io.Reader, error) {
	header := make([]byte, 4)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, corrupt(err)
	}
	if binary.LittleEndian.Uint16(header[2:]) != 5 {
		return nil, zipCorrupt("unexpected LZMA properties size")
	}
	properties := make([]byte, 5)
	if _, err := io.ReadFull(r, properties); err != nil {
		return nil, corrupt(err)
	}
	if binary.LittleEndian.Uint32(properties[1:]) > MaxDictionarySize {
		return nil, fmt.Errorf("%w: lzma dictionary too large", ErrTooComplex)
	}
	// the classic .lzma header: properties, then the size (-1 when an end marker is used)
	classic := make([]byte, 13)
	copy(classic, properties)
	unpacked := uint64(size)
	if flags&zipFlagLzmaEndMarker != 0 {
		unpacked = ^uint64(0)
	}
	binary.LittleEndian.PutUint64(classic[5:], unpacked)
	stream := bufio.NewReaderSize(io.MultiReader(bytes.NewReader(classic), r), 64<<10)
	reader, err := lzma.ReaderConfig{DictCap: MaxDictionarySize}.NewReader(stream)
	if err != nil {
		return nil, corrupt(err)
	}
	return reader, nil
}

// extractZip passes each entry's data to fn, reading each from its own place in the file.
func extractZip(ctx context.Context, file *os.File, entries []*Entry, fn func(entry *Entry, r io.Reader) error) error {
	for _, entry := range entries {
		if entry.zip == nil {
			return fmt.Errorf("%w: %q can't be read", ErrUnsupported, entry.Path)
		}
		decoded, closeDecoder, err := openZipEntry(ctx, file, entry)
		if err != nil {
			return err
		}
		err = fn(entry, &exactReader{r: decoded, left: entry.Size})
		closeDecoder()
		if err != nil {
			return err
		}
	}
	return nil
}
