package archive

import "io"

// XZ preprocessing filters, decode direction, as streaming readers. The conversions follow
// liblzma's simple filters (src/liblzma/simple/*.c and delta, public domain / 0BSD), the same
// source as the browser's src/engine/lzma/filters.ts. Each converter processes what it can and
// returns how many bytes are final; the rest (a partial instruction) waits for more data and is
// passed through unchanged at the end of the block, like liblzma.

// converter decodes buf in place; pos is the stream position of buf[0] (32-bit, wrapping).
type converter interface {
	convert(buf []byte, pos uint32) int
}

type x86Converter struct {
	prevMask uint32
	prevPos  uint32
}

func newX86() *x86Converter { return &x86Converter{prevPos: ^uint32(4)} } // -5

var (
	x86AllowedStatus = [8]bool{true, true, true, false, true, false, false, false}
	x86BitNumber     = [8]uint32{0, 1, 2, 2, 3, 3, 3, 3}
)

func isX86MSByte(b byte) bool { return b == 0x00 || b == 0xff }

func (c *x86Converter) convert(buf []byte, now uint32) int {
	if len(buf) < 5 {
		return 0
	}
	if now-c.prevPos > 5 {
		c.prevPos = now - 5
	}
	limit := len(buf) - 5
	i := 0
	for i <= limit {
		b := buf[i]
		if b != 0xe8 && b != 0xe9 {
			i++
			continue
		}
		offset := now + uint32(i) - c.prevPos
		c.prevPos = now + uint32(i)
		if offset > 5 {
			c.prevMask = 0
		} else {
			for k := uint32(0); k < offset; k++ {
				c.prevMask &= 0x77
				c.prevMask <<= 1
			}
		}
		b = buf[i+4]
		if isX86MSByte(b) && x86AllowedStatus[(c.prevMask>>1)&7] && c.prevMask>>1 < 0x10 {
			src := uint32(b)<<24 | uint32(buf[i+3])<<16 | uint32(buf[i+2])<<8 | uint32(buf[i+1])
			var dest uint32
			for {
				dest = src - (now + uint32(i) + 5)
				if c.prevMask == 0 {
					break
				}
				bit := x86BitNumber[c.prevMask>>1]
				if !isX86MSByte(byte(dest >> (24 - bit*8))) {
					break
				}
				src = dest ^ (1<<(32-bit*8) - 1)
			}
			buf[i+4] = ^byte((dest>>24)&1 - 1)
			buf[i+3] = byte(dest >> 16)
			buf[i+2] = byte(dest >> 8)
			buf[i+1] = byte(dest)
			i += 5
			c.prevMask = 0
		} else {
			i++
			c.prevMask |= 1
			if isX86MSByte(b) {
				c.prevMask |= 0x10
			}
		}
	}
	return i
}

type armConverter struct{}

func (armConverter) convert(buf []byte, pos uint32) int {
	i := 0
	for ; i+4 <= len(buf); i += 4 {
		if buf[i+3] == 0xeb {
			src := (uint32(buf[i+2])<<16 | uint32(buf[i+1])<<8 | uint32(buf[i])) << 2
			dest := (src - (pos + uint32(i) + 8)) >> 2
			buf[i+2] = byte(dest >> 16)
			buf[i+1] = byte(dest >> 8)
			buf[i] = byte(dest)
		}
	}
	return i
}

type armThumbConverter struct{}

func (armThumbConverter) convert(buf []byte, pos uint32) int {
	i := 0
	for ; i+4 <= len(buf); i += 2 {
		if buf[i+1]&0xf8 == 0xf0 && buf[i+3]&0xf8 == 0xf8 {
			src := (uint32(buf[i+1]&7)<<19 | uint32(buf[i])<<11 | uint32(buf[i+3]&7)<<8 | uint32(buf[i+2])) << 1
			dest := (src - (pos + uint32(i) + 4)) >> 1
			buf[i+1] = 0xf0 | byte((dest>>19)&7)
			buf[i] = byte(dest >> 11)
			buf[i+3] = 0xf8 | byte((dest>>8)&7)
			buf[i+2] = byte(dest)
			i += 2
		}
	}
	return i
}

type powerPCConverter struct{}

func (powerPCConverter) convert(buf []byte, pos uint32) int {
	i := 0
	for ; i+4 <= len(buf); i += 4 {
		if buf[i]>>2 == 0x12 && buf[i+3]&3 == 1 {
			src := uint32(buf[i]&3)<<24 | uint32(buf[i+1])<<16 | uint32(buf[i+2])<<8 | uint32(buf[i+3]&^3)
			dest := src - (pos + uint32(i))
			buf[i] = 0x48 | byte((dest>>24)&3)
			buf[i+1] = byte(dest >> 16)
			buf[i+2] = byte(dest >> 8)
			// like liblzma: keep the AA/LK bits and OR in the low byte of dest
			buf[i+3] = buf[i+3]&3 | byte(dest)
		}
	}
	return i
}

type sparcConverter struct{}

func (sparcConverter) convert(buf []byte, pos uint32) int {
	i := 0
	for ; i+4 <= len(buf); i += 4 {
		if (buf[i] == 0x40 && buf[i+1]&0xc0 == 0x00) || (buf[i] == 0x7f && buf[i+1]&0xc0 == 0xc0) {
			src := (uint32(buf[i])<<24 | uint32(buf[i+1])<<16 | uint32(buf[i+2])<<8 | uint32(buf[i+3])) << 2
			dest := (src - (pos + uint32(i))) >> 2
			dest = ((0-(dest>>22)&1)<<22)&0x3fffffff | dest&0x3fffff | 0x40000000
			buf[i] = byte(dest >> 24)
			buf[i+1] = byte(dest >> 16)
			buf[i+2] = byte(dest >> 8)
			buf[i+3] = byte(dest)
		}
	}
	return i
}

var ia64BranchTable = [32]uint32{
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 6, 6, 0, 0, 7, 7, 4, 4, 0, 0, 4, 4, 0, 0,
}

type ia64Converter struct{}

func (ia64Converter) convert(buf []byte, pos uint32) int {
	i := 0
	for ; i+16 <= len(buf); i += 16 {
		mask := ia64BranchTable[buf[i]&0x1f]
		for slot, bitPos := uint32(0), 5; slot < 3; slot, bitPos = slot+1, bitPos+41 {
			if (mask>>slot)&1 == 0 {
				continue
			}
			bytePos := bitPos >> 3
			bitRes := uint(bitPos & 7)
			var instruction uint64
			for j := 0; j < 6; j++ {
				instruction |= uint64(buf[i+j+bytePos]) << (8 * j)
			}
			normalized := instruction >> bitRes
			if (normalized>>37)&0xf == 0x5 && (normalized>>9)&0x7 == 0 {
				src := uint32((normalized >> 13) & 0xfffff)
				src |= uint32((normalized>>36)&1) << 20
				src <<= 4
				dest := (src - (pos + uint32(i))) >> 4
				normalized &^= uint64(0x8fffff) << 13
				normalized |= uint64(dest&0xfffff) << 13
				normalized |= uint64(dest&0x100000) << (36 - 20)
				instruction &= 1<<bitRes - 1
				instruction |= normalized << bitRes
				for j := 0; j < 6; j++ {
					buf[i+j+bytePos] = byte(instruction >> (8 * j))
				}
			}
		}
	}
	return i
}

// simpleReader applies a converter to a stream, keeping unconverted tail bytes for the next read.
type simpleReader struct {
	source    io.Reader
	converter converter
	pos       uint32
	buf       []byte
	ready     int // bytes at the front that are converted and not yet returned
	filled    int // bytes in buf
	eof       bool
}

func newSimpleReader(source io.Reader, c converter, start uint32) *simpleReader {
	return &simpleReader{source: source, converter: c, pos: start, buf: make([]byte, 64<<10)}
}

func (r *simpleReader) Read(p []byte) (int, error) {
	for r.ready == 0 {
		if r.eof && r.filled == 0 {
			return 0, io.EOF
		}
		if !r.eof {
			n, err := io.ReadAtLeast(r.source, r.buf[r.filled:], 1)
			r.filled += n
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				r.eof = true
			} else if err != nil {
				return 0, err
			}
		}
		converted := r.converter.convert(r.buf[:r.filled], r.pos)
		if r.eof {
			converted = r.filled // the partial tail passes through unchanged
		}
		r.pos += uint32(converted)
		r.ready = converted
	}
	n := copy(p, r.buf[:r.ready])
	copy(r.buf, r.buf[n:r.filled])
	r.ready -= n
	r.filled -= n
	return n, nil
}

// deltaReader undoes the delta filter: each byte was stored as the difference to the byte
// distance positions back.
type deltaReader struct {
	source   io.Reader
	distance int
	history  [256]byte
	pos      int
}

func (r *deltaReader) Read(p []byte) (int, error) {
	n, err := r.source.Read(p)
	for i := 0; i < n; i++ {
		p[i] += r.history[(r.pos-r.distance)&0xff]
		r.history[r.pos&0xff] = p[i]
		r.pos++
	}
	return n, err
}
