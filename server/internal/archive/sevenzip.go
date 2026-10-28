package archive

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"io/fs"
	"os"

	"github.com/bodgit/sevenzip"
	"github.com/klauspost/compress/zstd"
	"github.com/stangelandcl/ppmd"
	"github.com/ulikunitz/xz/lzma"

	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/deflate64"
)

// 7z reading uses github.com/bodgit/sevenzip, patched in third_party/sevenzip to cap header
// counts and size. The decoders that allocate what a file declares are replaced here by ones
// that check it against MaxDictionarySize first (as xz.go does for xz), and AES decryption by one
// that refuses: password-protected archives aren't supported.

// maxSevenZipHeaderSize caps a 7z header (stored, or decoded when compressed).
const maxSevenZipHeaderSize = 512 << 20

//nolint:gochecknoinits
func init() {
	sevenzip.SetMaxHeaderSize(maxSevenZipHeaderSize)
	sevenzip.RegisterDecompressor([]byte{0x03, 0x01, 0x01}, lazyDecoder(newSevenZipLzma))
	sevenzip.RegisterDecompressor([]byte{0x21}, lazyDecoder(newSevenZipLzma2))
	sevenzip.RegisterDecompressor([]byte{0x03, 0x04, 0x01}, lazyDecoder(newSevenZipPpmd))
	sevenzip.RegisterDecompressor([]byte{0x04, 0xf7, 0x11, 0x01}, lazyDecoder(newSevenZipZstd))
	sevenzip.RegisterDecompressor([]byte{0x04, 0x01, 0x09}, lazyDecoder(newSevenZipDeflate64))
	sevenzip.RegisterDecompressor([]byte{0x06, 0xf1, 0x07, 0x01},
		func([]byte, uint64, []io.ReadCloser) (io.ReadCloser, error) { return nil, ErrEncrypted })
}

// decoderFunc builds a decoder over one input; the returned closer (may be nil) frees it.
type decoderFunc func(properties []byte, size uint64, input io.Reader) (io.Reader, func(), error)

// lazyDecoder builds the decoder on the first Read, so opening a file without reading it (the
// scan's check for encrypted streams) allocates nothing.
func lazyDecoder(build decoderFunc) sevenzip.Decompressor {
	return func(properties []byte, size uint64, inputs []io.ReadCloser) (io.ReadCloser, error) {
		if len(inputs) != 1 {
			return nil, fmt.Errorf("%w: 7z coder needs one input", ErrCorrupt)
		}
		return &lazyReader{build: build, properties: bytes.Clone(properties), size: size, input: inputs[0]}, nil
	}
}

type lazyReader struct {
	build      decoderFunc
	properties []byte
	size       uint64
	input      io.ReadCloser
	decoder    io.Reader
	free       func()
	err        error
}

func (l *lazyReader) Read(p []byte) (int, error) {
	if l.decoder == nil && l.err == nil {
		l.decoder, l.free, l.err = l.build(l.properties, l.size, l.input)
	}
	if l.err != nil {
		return 0, l.err
	}
	return l.decoder.Read(p)
}

func (l *lazyReader) Close() error {
	if l.free != nil {
		l.free()
		l.free = nil
	}
	return l.input.Close()
}

func dictionaryTooLarge(kind string) error {
	return fmt.Errorf("%w: %s dictionary too large", ErrTooComplex, kind)
}

func byteReader(r io.Reader) io.Reader {
	if _, ok := r.(io.ByteReader); ok {
		return r
	}
	return bufio.NewReaderSize(r, 64<<10)
}

func newSevenZipLzma(properties []byte, size uint64, input io.Reader) (io.Reader, func(), error) {
	if len(properties) != 5 {
		return nil, nil, fmt.Errorf("%w: 7z LZMA properties", ErrCorrupt)
	}
	if binary.LittleEndian.Uint32(properties[1:]) > MaxDictionarySize {
		return nil, nil, dictionaryTooLarge("lzma")
	}
	header := make([]byte, 13)
	copy(header, properties)
	binary.LittleEndian.PutUint64(header[5:], size)
	reader, err := lzma.ReaderConfig{DictCap: MaxDictionarySize}.NewReader(
		byteReader(io.MultiReader(bytes.NewReader(header), input)))
	if err != nil {
		return nil, nil, corrupt(err)
	}
	return reader, nil, nil
}

func newSevenZipLzma2(properties []byte, _ uint64, input io.Reader) (io.Reader, func(), error) {
	if len(properties) != 1 || properties[0] > 40 {
		return nil, nil, fmt.Errorf("%w: 7z LZMA2 properties", ErrCorrupt)
	}
	// the same formula as xz's LZMA2 filter properties (Lzma2Dec.c)
	dictionary := uint64(2|properties[0]&1) << (properties[0]/2 + 11)
	if properties[0] == 40 {
		dictionary = 0xffffffff
	}
	if dictionary > MaxDictionarySize {
		return nil, nil, dictionaryTooLarge("lzma2")
	}
	reader, err := lzma.Reader2Config{DictCap: int(dictionary)}.NewReader2(byteReader(input))
	if err != nil {
		return nil, nil, corrupt(err)
	}
	return reader, nil, nil
}

func newSevenZipPpmd(properties []byte, size uint64, input io.Reader) (io.Reader, func(), error) {
	if len(properties) != 5 {
		return nil, nil, fmt.Errorf("%w: 7z PPMd properties", ErrCorrupt)
	}
	memory := binary.LittleEndian.Uint32(properties[1:])
	if memory > MaxDictionarySize {
		return nil, nil, fmt.Errorf("%w: PPMd memory size too large", ErrTooComplex)
	}
	if size > maxInt64 {
		return nil, nil, fmt.Errorf("%w: 7z PPMd size", ErrCorrupt)
	}
	reader, err := ppmd.NewH7zReader(byteReader(input), int(properties[0]), int(memory), int(size))
	if err != nil {
		return nil, nil, corrupt(err)
	}
	return &reader, nil, nil
}

func newSevenZipZstd(_ []byte, _ uint64, input io.Reader) (io.Reader, func(), error) {
	reader, err := zstd.NewReader(input, zstd.WithDecoderConcurrency(1),
		zstd.WithDecoderMaxWindow(MaxDictionarySize), zstd.WithDecoderLowmem(true))
	if err != nil {
		return nil, nil, corrupt(err)
	}
	return reader, reader.Close, nil
}

func newSevenZipDeflate64(_ []byte, _ uint64, input io.Reader) (io.Reader, func(), error) {
	reader := deflate64.NewReader(byteReader(input))
	return reader, func() { reader.Close() }, nil
}

// contextReaderAt stops reads once the context is cancelled.
type contextReaderAt struct {
	ctx context.Context
	r   io.ReaderAt
}

func (c contextReaderAt) ReadAt(p []byte, offset int64) (int, error) {
	if err := c.ctx.Err(); err != nil {
		return 0, err
	}
	return c.r.ReadAt(p, offset)
}

// sevenZipError maps the library's errors onto the package's.
func sevenZipError(err error) error {
	var readError *sevenzip.ReadError
	switch {
	case err == nil:
		return nil
	case errors.Is(err, sevenzip.ErrLimit):
		return fmt.Errorf("%w: %v", ErrTooComplex, err)
	case errors.Is(err, ErrEncrypted), errors.As(err, &readError) && readError.Encrypted:
		return ErrEncrypted
	}
	return corrupt(err)
}

func openSevenZip(ctx context.Context, file *os.File, size int64, limits Limits) (*sevenzip.Reader, error) {
	sevenzip.SetMaxCount(uint64(limits.MaxEntries))
	reader, err := sevenzip.NewReader(contextReaderAt{ctx: ctx, r: file}, size)
	return reader, sevenZipError(err)
}

// scan7z lists a 7z from its header; only the header is read, whatever the archive's size.
func scan7z(ctx context.Context, file *os.File, size int64, limits Limits) (*Index, error) {
	reader, err := openSevenZip(ctx, file, size, limits)
	if err != nil {
		return nil, err
	}
	// Each compressed stream is opened once without reading: an encrypted one, or one using a
	// method the library doesn't know, fails here and its files are listed as unreadable.
	readable := map[int]bool{}
	for _, f := range reader.File {
		if f.UncompressedSize == 0 {
			continue
		}
		if _, checked := readable[f.Stream]; checked {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return nil, ctxErr
			}
			readable[f.Stream] = false
			continue
		}
		rc.Close()
		readable[f.Stream] = true
	}

	index := newIndex()
	nameBytes := 0
	for i, f := range reader.File {
		if len(f.Name) > maxPathLength {
			return nil, fmt.Errorf("%w: path longer than %d bytes", ErrTooComplex, maxPathLength)
		}
		path := NormalizePath(f.Name)
		if path == "" {
			continue
		}
		nameBytes += 2 * len(path)
		if nameBytes > maxNameBytes {
			return nil, fmt.Errorf("%w: file names take more than %d MiB", ErrTooComplex, maxNameBytes>>20)
		}
		info := f.FileInfo()
		isDirectory := info.IsDir()
		symlink := info.Mode()&fs.ModeSymlink != 0
		entry := &Entry{
			Path:      path,
			Name:      baseName(path),
			IsDir:     isDirectory,
			Supported: isDirectory || (!symlink && (f.UncompressedSize == 0 || readable[f.Stream])),
			offset:    int64(i),
		}
		if !isDirectory {
			if f.UncompressedSize > maxInt64 {
				return nil, fmt.Errorf("%w: 7z entry size out of range", ErrCorrupt)
			}
			entry.Size = int64(f.UncompressedSize)
		}
		if !f.Modified.IsZero() && f.Modified.Unix() > 0 {
			entry.Modified = f.Modified.UnixMilli()
		}
		index.add(entry)
		if index.Len() > limits.MaxEntries {
			return nil, fmt.Errorf("%w: more than %d entries", ErrTooComplex, limits.MaxEntries)
		}
	}
	return index, nil
}

// extract7z reads the files in archive order, closing each before opening the next so the
// library keeps decoding a solid stream where it left off.
func extract7z(ctx context.Context, file *os.File, size int64, limits Limits, entries []*Entry,
	fn func(entry *Entry, r io.Reader) error) error {
	reader, err := openSevenZip(ctx, file, size, limits)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.offset < 0 || entry.offset >= int64(len(reader.File)) ||
			NormalizePath(reader.File[entry.offset].Name) != entry.Path {
			return fmt.Errorf("%w: 7z entry %q not found", ErrCorrupt, entry.Path)
		}
		f := reader.File[entry.offset]
		rc, err := f.Open()
		if err != nil {
			return sevenZipError(err)
		}
		var data io.Reader = &sevenZipErrors{rc}
		if f.CRC32 != 0 {
			data = &crcReader{r: data, hash: crc32.NewIEEE(), left: entry.Size, want: f.CRC32}
		}
		err = fn(entry, &exactReader{r: data, left: entry.Size})
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

// sevenZipErrors maps the library's read errors (EOF passes through).
type sevenZipErrors struct{ r io.Reader }

func (s *sevenZipErrors) Read(p []byte) (int, error) {
	n, err := s.r.Read(p)
	if err != nil && err != io.EOF {
		err = sevenZipError(err)
	}
	return n, err
}
