// Package zipstream writes a store-only (uncompressed) ZIP while streaming, with a size that is
// known before the first byte is sent, so a download can carry an exact Content-Length. Files are
// stored, not deflated: their content is already in the archive the user opened, and storing
// keeps the server's CPU free and the output size predictable.
package zipstream

import (
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"strconv"
	"strings"
	"time"
)

// File describes one file of the ZIP; Name must already be a clean path (see Names).
type File struct {
	Name     string
	Size     int64
	Modified time.Time
}

const (
	localHeaderLen     = 30
	centralHeaderLen   = 46
	endRecordLen       = 22
	zip64EndRecordLen  = 56
	zip64LocatorLen    = 20
	descriptorLen      = 16 // signature, CRC, 32-bit sizes
	zip64DescriptorLen = 24 // signature, CRC, 64-bit sizes
	zip64LocalExtra    = 20 // id, length, uncompressed, compressed
	zip64CentralExtra  = 28 // id, length, uncompressed, compressed, local header offset

	flags     = 0x0808 // bit 3: sizes and CRC follow the data; bit 11: UTF-8 names
	max32     = 0xffffffff
	maxCount  = 0xffff
	version20 = 20
	version45 = 45 // ZIP64
)

// zip64Threshold is max32 outside tests (a test lowers it to exercise ZIP64 with small files).
var zip64Threshold int64 = max32

// needZip64 decides the layout for a whole ZIP from its files alone, so Size and the writer agree.
func needZip64(files []File) bool {
	if len(files) >= maxCount {
		return true
	}
	size := sizeOf(files, false)
	for _, f := range files {
		if f.Size >= zip64Threshold {
			return true
		}
	}
	return size >= zip64Threshold
}

func sizeOf(files []File, zip64 bool) int64 {
	var total int64
	for _, f := range files {
		name := int64(len(f.Name))
		if zip64 {
			total += localHeaderLen + name + zip64LocalExtra + f.Size + zip64DescriptorLen
			total += centralHeaderLen + name + zip64CentralExtra
		} else {
			total += localHeaderLen + name + f.Size + descriptorLen
			total += centralHeaderLen + name
		}
	}
	total += endRecordLen
	if zip64 {
		total += zip64EndRecordLen + zip64LocatorLen
	}
	return total
}

// Size is the exact number of bytes a Writer produces for these files.
func Size(files []File) int64 {
	return sizeOf(files, needZip64(files))
}

type Writer struct {
	w       io.Writer
	files   []File
	zip64   bool
	next    int
	offset  int64
	central []byte
}

// NewWriter writes the given files, in this order, as their data is passed to Add.
func NewWriter(w io.Writer, files []File) *Writer {
	return &Writer{w: w, files: files, zip64: needZip64(files)}
}

func (z *Writer) write(data []byte) error {
	n, err := z.w.Write(data)
	z.offset += int64(n)
	return err
}

// dosTime encodes t in MS-DOS format (local fields as UTC), clamped to 1980–2107.
func dosTime(t time.Time) (uint16, uint16) {
	t = t.UTC()
	if t.Year() < 1980 {
		t = time.Date(1980, 1, 1, 0, 0, 0, 0, time.UTC)
	} else if t.Year() > 2107 {
		t = time.Date(2107, 12, 31, 23, 59, 58, 0, time.UTC)
	}
	date := uint16(t.Day() + int(t.Month())<<5 + (t.Year()-1980)<<9)
	clock := uint16(t.Second()/2 + t.Minute()<<5 + t.Hour()<<11)
	return clock, date
}

var ErrSizeMismatch = errors.New("file data does not match its declared size")

// Add writes the next file, reading exactly its declared size from r.
func (z *Writer) Add(r io.Reader) error {
	if z.next >= len(z.files) {
		return errors.New("zipstream: more files than declared")
	}
	f := z.files[z.next]
	z.next++
	headerOffset := z.offset
	clock, date := dosTime(f.Modified)
	version := uint16(version20)
	if z.zip64 {
		version = version45
	}

	local := make([]byte, 0, localHeaderLen+len(f.Name)+zip64LocalExtra)
	local = binary.LittleEndian.AppendUint32(local, 0x04034b50)
	local = binary.LittleEndian.AppendUint16(local, version)
	local = binary.LittleEndian.AppendUint16(local, flags)
	local = binary.LittleEndian.AppendUint16(local, 0) // stored
	local = binary.LittleEndian.AppendUint16(local, clock)
	local = binary.LittleEndian.AppendUint16(local, date)
	local = binary.LittleEndian.AppendUint32(local, 0) // CRC: in the descriptor
	if z.zip64 {
		local = binary.LittleEndian.AppendUint32(local, max32)
		local = binary.LittleEndian.AppendUint32(local, max32)
	} else {
		local = binary.LittleEndian.AppendUint32(local, 0)
		local = binary.LittleEndian.AppendUint32(local, 0)
	}
	local = binary.LittleEndian.AppendUint16(local, uint16(len(f.Name)))
	if z.zip64 {
		local = binary.LittleEndian.AppendUint16(local, zip64LocalExtra)
	} else {
		local = binary.LittleEndian.AppendUint16(local, 0)
	}
	local = append(local, f.Name...)
	if z.zip64 {
		local = binary.LittleEndian.AppendUint16(local, 0x0001)
		local = binary.LittleEndian.AppendUint16(local, 16)
		local = binary.LittleEndian.AppendUint64(local, 0)
		local = binary.LittleEndian.AppendUint64(local, 0)
	}
	if err := z.write(local); err != nil {
		return err
	}

	crc := crc32.NewIEEE()
	copied, err := io.Copy(io.MultiWriter(writerFunc(z.write), crc), io.LimitReader(r, f.Size))
	if err != nil {
		return err
	}
	if copied != f.Size {
		return fmt.Errorf("%w: %q has %d of %d bytes", ErrSizeMismatch, f.Name, copied, f.Size)
	}

	descriptor := binary.LittleEndian.AppendUint32(nil, 0x08074b50)
	descriptor = binary.LittleEndian.AppendUint32(descriptor, crc.Sum32())
	if z.zip64 {
		descriptor = binary.LittleEndian.AppendUint64(descriptor, uint64(f.Size))
		descriptor = binary.LittleEndian.AppendUint64(descriptor, uint64(f.Size))
	} else {
		descriptor = binary.LittleEndian.AppendUint32(descriptor, uint32(f.Size))
		descriptor = binary.LittleEndian.AppendUint32(descriptor, uint32(f.Size))
	}
	if err := z.write(descriptor); err != nil {
		return err
	}

	c := binary.LittleEndian.AppendUint32(nil, 0x02014b50)
	c = binary.LittleEndian.AppendUint16(c, version|3<<8) // made by: Unix
	c = binary.LittleEndian.AppendUint16(c, version)
	c = binary.LittleEndian.AppendUint16(c, flags)
	c = binary.LittleEndian.AppendUint16(c, 0)
	c = binary.LittleEndian.AppendUint16(c, clock)
	c = binary.LittleEndian.AppendUint16(c, date)
	c = binary.LittleEndian.AppendUint32(c, crc.Sum32())
	if z.zip64 {
		c = binary.LittleEndian.AppendUint32(c, max32)
		c = binary.LittleEndian.AppendUint32(c, max32)
	} else {
		c = binary.LittleEndian.AppendUint32(c, uint32(f.Size))
		c = binary.LittleEndian.AppendUint32(c, uint32(f.Size))
	}
	c = binary.LittleEndian.AppendUint16(c, uint16(len(f.Name)))
	if z.zip64 {
		c = binary.LittleEndian.AppendUint16(c, zip64CentralExtra)
	} else {
		c = binary.LittleEndian.AppendUint16(c, 0)
	}
	c = binary.LittleEndian.AppendUint16(c, 0)            // comment
	c = binary.LittleEndian.AppendUint16(c, 0)            // disk
	c = binary.LittleEndian.AppendUint16(c, 0)            // internal attributes
	c = binary.LittleEndian.AppendUint32(c, 0o100644<<16) // regular file, rw-r--r--
	if z.zip64 {
		c = binary.LittleEndian.AppendUint32(c, max32)
	} else {
		c = binary.LittleEndian.AppendUint32(c, uint32(headerOffset))
	}
	c = append(c, f.Name...)
	if z.zip64 {
		c = binary.LittleEndian.AppendUint16(c, 0x0001)
		c = binary.LittleEndian.AppendUint16(c, 24)
		c = binary.LittleEndian.AppendUint64(c, uint64(f.Size))
		c = binary.LittleEndian.AppendUint64(c, uint64(f.Size))
		c = binary.LittleEndian.AppendUint64(c, uint64(headerOffset))
	}
	z.central = append(z.central, c...)
	return nil
}

type writerFunc func([]byte) error

func (f writerFunc) Write(p []byte) (int, error) {
	if err := f(p); err != nil {
		return 0, err
	}
	return len(p), nil
}

// Close writes the central directory and end records.
func (z *Writer) Close() error {
	if z.next != len(z.files) {
		return fmt.Errorf("zipstream: %d of %d files written", z.next, len(z.files))
	}
	centralOffset := z.offset
	if err := z.write(z.central); err != nil {
		return err
	}
	centralSize := int64(len(z.central))
	count := len(z.files)
	if z.zip64 {
		recordOffset := z.offset
		r := binary.LittleEndian.AppendUint32(nil, 0x06064b50)
		r = binary.LittleEndian.AppendUint64(r, zip64EndRecordLen-12)
		r = binary.LittleEndian.AppendUint16(r, version45|3<<8)
		r = binary.LittleEndian.AppendUint16(r, version45)
		r = binary.LittleEndian.AppendUint32(r, 0)
		r = binary.LittleEndian.AppendUint32(r, 0)
		r = binary.LittleEndian.AppendUint64(r, uint64(count))
		r = binary.LittleEndian.AppendUint64(r, uint64(count))
		r = binary.LittleEndian.AppendUint64(r, uint64(centralSize))
		r = binary.LittleEndian.AppendUint64(r, uint64(centralOffset))
		r = binary.LittleEndian.AppendUint32(r, 0x07064b50)
		r = binary.LittleEndian.AppendUint32(r, 0)
		r = binary.LittleEndian.AppendUint64(r, uint64(recordOffset))
		r = binary.LittleEndian.AppendUint32(r, 1)
		if err := z.write(r); err != nil {
			return err
		}
	}
	e := binary.LittleEndian.AppendUint32(nil, 0x06054b50)
	e = binary.LittleEndian.AppendUint16(e, 0)
	e = binary.LittleEndian.AppendUint16(e, 0)
	if z.zip64 {
		e = binary.LittleEndian.AppendUint16(e, maxCount)
		e = binary.LittleEndian.AppendUint16(e, maxCount)
		e = binary.LittleEndian.AppendUint32(e, max32)
		e = binary.LittleEndian.AppendUint32(e, max32)
	} else {
		e = binary.LittleEndian.AppendUint16(e, uint16(count))
		e = binary.LittleEndian.AppendUint16(e, uint16(count))
		e = binary.LittleEndian.AppendUint32(e, uint32(centralSize))
		e = binary.LittleEndian.AppendUint32(e, uint32(centralOffset))
	}
	e = binary.LittleEndian.AppendUint16(e, 0)
	return z.write(e)
}

// SanitizeFileName removes path separators and control characters (names come from untrusted
// archives); a port of the browser's sanitizeFileName.
func SanitizeFileName(name string) string {
	var b strings.Builder
	for _, r := range name {
		if r == '/' || r == '\\' || r < 0x20 || r == 0x7f {
			b.WriteByte('_')
		} else {
			b.WriteRune(r)
		}
	}
	if cleaned := strings.TrimSpace(b.String()); cleaned != "" {
		return cleaned
	}
	return "download"
}

// Names turns archive paths into safe, unique ZIP paths (a port of the browser's selectionPath):
// "", "." and ".." segments are dropped so the ZIP can't write outside its folder when extracted
// ("zip slip"), and clashes get a " (n)" suffix.
func Names(paths []string) []string {
	used := map[string]bool{}
	names := make([]string, len(paths))
	for i, path := range paths {
		var segments []string
		for _, segment := range strings.Split(path, "/") {
			segment = strings.TrimSpace(segment)
			if segment != "" && segment != "." && segment != ".." {
				segments = append(segments, SanitizeFileName(segment))
			}
		}
		base := strings.Join(segments, "/")
		if base == "" {
			base = "download"
		}
		candidate := base
		for n := 2; used[candidate]; n++ {
			dot := strings.LastIndex(base, ".")
			suffix := " (" + strconv.Itoa(n) + ")"
			if dot > strings.LastIndex(base, "/")+1 {
				candidate = base[:dot] + suffix + base[dot:]
			} else {
				candidate = base + suffix
			}
		}
		used[candidate] = true
		names[i] = candidate
	}
	return names
}
