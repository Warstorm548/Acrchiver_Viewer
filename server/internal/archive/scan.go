package archive

import (
	"archive/tar"
	"bufio"
	"compress/bzip2"
	"compress/gzip"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync/atomic"

	"github.com/ulikunitz/xz/lzma"
)

// Limits guard the scan against archives built to exhaust the server.
type Limits struct {
	// MaxEntries caps files + folders in the listing.
	MaxEntries int
	// MaxScanSize caps the decompressed bytes read while listing (decompression bombs).
	MaxScanSize int64
}

const (
	// maxPathLength: longer paths are refused (Linux allows 4096; real archives stay far below).
	maxPathLength = 64 << 10
	// maxNameBytes caps the memory the listing's paths may take.
	maxNameBytes = 256 << 20
)

// Archive is a scanned archive in the temp folder.
type Archive struct {
	Format Format
	Index  *Index
	path   string
	single bool
}

// countReader counts bytes passing through and stops on a cancelled context.
type countReader struct {
	ctx   context.Context
	r     io.Reader
	count *atomic.Int64
	limit int64 // 0 = none; exceeding it fails with ErrTooComplex
}

func (c *countReader) Read(p []byte) (int, error) {
	if err := c.ctx.Err(); err != nil {
		return 0, err
	}
	n, err := c.r.Read(p)
	total := c.count.Add(int64(n))
	if c.limit > 0 && total > c.limit {
		// the chunk that crosses the limit is withheld, so nothing past it is ever used
		return 0, fmt.Errorf("%w: more than %d bytes decompressed", ErrTooComplex, c.limit)
	}
	return n, err
}

// seekCounter reads a plain tar from the file; tar.Reader seeks past file data instead of reading it.
type seekCounter struct {
	ctx  context.Context
	file *os.File
	pos  *atomic.Int64
}

func (s *seekCounter) Read(p []byte) (int, error) {
	if err := s.ctx.Err(); err != nil {
		return 0, err
	}
	n, err := s.file.Read(p)
	s.pos.Add(int64(n))
	return n, err
}

func (s *seekCounter) Seek(offset int64, whence int) (int64, error) {
	pos, err := s.file.Seek(offset, whence)
	if err == nil {
		s.pos.Store(pos)
	}
	return pos, err
}

// stream opens the decompressor for a format; gzipHeader is set for gzip.
type stream struct {
	reader     io.Reader
	gzipHeader *gzip.Header
	close      func()
}

func openStream(format Format, source io.Reader) (*stream, error) {
	buffered := bufio.NewReaderSize(source, 256<<10)
	switch format.compression() {
	case gzipCompression:
		gz, err := gzip.NewReader(buffered)
		if err != nil {
			return nil, corrupt(err)
		}
		return &stream{reader: gz, gzipHeader: &gz.Header, close: func() { gz.Close() }}, nil
	case bzip2Compression:
		return &stream{reader: bzip2.NewReader(buffered), close: func() {}}, nil
	case xzCompression:
		x, err := newXzReader(buffered)
		if err != nil {
			return nil, err
		}
		return &stream{reader: x, close: func() {}}, nil
	case lzmaCompression:
		header, err := buffered.Peek(13)
		if err != nil {
			return nil, corrupt(err)
		}
		if binary.LittleEndian.Uint32(header[1:5]) > MaxDictionarySize {
			return nil, fmt.Errorf("%w: lzma dictionary too large", ErrTooComplex)
		}
		// DictCap only refuses larger headers: since ulikunitz/xz v0.5.14 the reader allocates the
		// header's own dictionary size, not DictCap (the "use the larger" line is disabled there)
		l, err := lzma.ReaderConfig{DictCap: MaxDictionarySize}.NewReader(buffered)
		if err != nil {
			return nil, corrupt(err)
		}
		return &stream{reader: l, close: func() {}}, nil
	}
	return &stream{reader: buffered, close: func() {}}, nil
}

// corrupt maps decoder errors to ErrCorrupt, keeping cancellation and limit errors as they are.
func corrupt(err error) error {
	if err == nil || errors.Is(err, ErrCorrupt) || errors.Is(err, ErrTooComplex) ||
		errors.Is(err, ErrUnsupported) || errors.Is(err, context.Canceled) ||
		errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	return fmt.Errorf("%w: %v", ErrCorrupt, err)
}

// Scan detects the format of the archive at path (named name in OpenCloud) and lists it. The
// number of archive bytes read so far is kept in progress (polled by the viewer's status calls).
func Scan(ctx context.Context, path, name string, limits Limits, progress *atomic.Int64) (*Archive, error) {
	if progress == nil {
		progress = new(atomic.Int64)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	head := make([]byte, SignatureLength)
	n, _ := file.ReadAt(head, 0)
	format, err := Detect(name, head[:n])
	if err != nil {
		return nil, err
	}
	archive := &Archive{Format: format, path: path}

	if format == FormatTar {
		info, err := file.Stat()
		if err != nil {
			return nil, err
		}
		source := &seekCounter{ctx: ctx, file: file, pos: progress}
		index, err := scanTar(source, progress.Load, info.Size(), limits)
		if err != nil {
			return nil, err
		}
		archive.Index = index
		return archive, nil
	}

	s, err := openStream(format, &countReader{ctx: ctx, r: file, count: progress})
	if err != nil {
		return nil, err
	}
	defer s.close()
	decompressed := &countReader{ctx: ctx, r: s.reader, count: new(atomic.Int64), limit: limits.MaxScanSize}
	buffered := bufio.NewReaderSize(decompressed, 64<<10)
	position := func() int64 { return decompressed.count.Load() - int64(buffered.Buffered()) }

	isTar := format.isTarFormat()
	if !isTar {
		peek, err := buffered.Peek(SignatureLength)
		if err != nil && err != io.EOF && err != bufio.ErrBufferFull {
			return nil, corrupt(err)
		}
		isTar = looksLikeTar(peek)
	}
	if isTar {
		index, err := scanTar(buffered, position, -1, limits)
		if err != nil {
			return nil, err
		}
		archive.Index = index
		return archive, nil
	}

	// a single compressed file: its size is only known once it is decompressed
	size, err := io.Copy(io.Discard, buffered)
	if err != nil {
		return nil, corrupt(err)
	}
	stored := ""
	var modified int64
	if s.gzipHeader != nil {
		stored = s.gzipHeader.Name
		if !s.gzipHeader.ModTime.IsZero() {
			modified = s.gzipHeader.ModTime.UnixMilli()
		}
	}
	fileName := SingleFileName(name, stored)
	archive.single = true
	archive.Index = newIndex()
	archive.Index.add(&Entry{Path: fileName, Name: fileName, Size: size, Modified: modified, Supported: true})
	return archive, nil
}

// scanTar walks the tar headers; position reports where the stream is (for data offsets). For a
// plain tar, size is the file size: tar.Reader seeks past file data, and a seek past the end of a
// truncated file doesn't fail, so each entry's data is checked against it (-1 = a stream, where a
// short read fails instead).
func scanTar(source io.Reader, position func() int64, size int64, limits Limits) (*Index, error) {
	reader := tar.NewReader(source)
	index := newIndex()
	nameBytes := 0
	for {
		header, err := reader.Next()
		if err == io.EOF {
			return index, nil
		}
		if err != nil && !errors.Is(err, tar.ErrInsecurePath) {
			return nil, corrupt(err)
		}
		switch header.Typeflag {
		case tar.TypeXGlobalHeader, tar.TypeGNULongName, tar.TypeGNULongLink:
			continue
		}
		if len(header.Name) > maxPathLength {
			return nil, fmt.Errorf("%w: path longer than %d bytes", ErrTooComplex, maxPathLength)
		}
		path := NormalizePath(header.Name)
		if path == "" {
			continue
		}
		nameBytes += 2 * len(path)
		if nameBytes > maxNameBytes {
			return nil, fmt.Errorf("%w: file names take more than %d MiB", ErrTooComplex, maxNameBytes>>20)
		}
		sparse := header.Typeflag == tar.TypeGNUSparse || hasSparseRecords(header.PAXRecords)
		isDirectory := header.Typeflag == tar.TypeDir || strings.HasSuffix(header.Name, "/")
		isFile := !sparse && !isDirectory &&
			(header.Typeflag == tar.TypeReg || header.Typeflag == '\x00' || header.Typeflag == tar.TypeCont)
		entry := &Entry{
			Path:      path,
			Name:      baseName(path),
			IsDir:     isDirectory,
			Supported: isDirectory || isFile,
			offset:    position(),
		}
		if isFile {
			entry.Size = header.Size
		}
		if size >= 0 && entry.offset+header.Size > size {
			return nil, fmt.Errorf("%w: tar archive is truncated", ErrCorrupt)
		}
		if !header.ModTime.IsZero() && header.ModTime.Unix() > 0 {
			entry.Modified = header.ModTime.UnixMilli()
		}
		index.add(entry)
		if index.Len() > limits.MaxEntries {
			return nil, fmt.Errorf("%w: more than %d entries", ErrTooComplex, limits.MaxEntries)
		}
	}
}

func hasSparseRecords(records map[string]string) bool {
	for key := range records {
		if strings.HasPrefix(key, "GNU.sparse.") {
			return true
		}
	}
	return false
}
