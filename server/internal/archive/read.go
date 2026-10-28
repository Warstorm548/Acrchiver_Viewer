package archive

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"sort"
	"sync/atomic"
)

// exactReader yields exactly size bytes, failing if the data ends early (the listing promised
// that size, e.g. in a download's Content-Length).
type exactReader struct {
	r    io.Reader
	left int64
}

func (e *exactReader) Read(p []byte) (int, error) {
	if e.left <= 0 {
		return 0, io.EOF
	}
	if int64(len(p)) > e.left {
		p = p[:e.left]
	}
	n, err := e.r.Read(p)
	e.left -= int64(n)
	if err == io.EOF && e.left > 0 {
		return n, fmt.Errorf("%w: data ends before the declared size", ErrCorrupt)
	}
	if err == io.EOF {
		return n, nil
	}
	// decoder failures surface as ErrCorrupt even when fn passes them on
	return n, corrupt(err)
}

// Extract passes each entry's data to fn, in archive order (so a whole selection is one pass
// through a compressed stream). fn may read all, part or none of r. Entries must be supported
// files of this archive.
func (a *Archive) Extract(ctx context.Context, entries []*Entry, fn func(entry *Entry, r io.Reader) error) error {
	sorted := make([]*Entry, len(entries))
	copy(sorted, entries)
	SortForExtract(sorted)

	file, err := os.Open(a.path)
	if err != nil {
		return err
	}
	defer file.Close()

	switch a.Format {
	case FormatZip:
		return extractZip(ctx, file, sorted, fn)
	case Format7z:
		return extract7z(ctx, file, a.size, a.limits, sorted, fn)
	case FormatTar:
		for _, entry := range sorted {
			section := io.NewSectionReader(file, entry.offset, entry.Size)
			reader := &exactReader{r: &countReader{ctx: ctx, r: section, count: new(atomic.Int64)}, left: entry.Size}
			if err := fn(entry, reader); err != nil {
				return err
			}
		}
		return nil
	}

	s, err := openStream(a.Format, &countReader{ctx: ctx, r: file, count: new(atomic.Int64)})
	if err != nil {
		return err
	}
	defer s.close()
	stream := bufio.NewReaderSize(s.reader, 64<<10)
	var position int64
	for _, entry := range sorted {
		if entry.offset < position {
			return fmt.Errorf("entry %q listed twice or overlapping", entry.Path)
		}
		if skip := entry.offset - position; skip > 0 {
			skipped, err := io.CopyN(io.Discard, stream, skip)
			position += skipped
			if err != nil {
				return corrupt(err)
			}
		}
		reader := &exactReader{r: stream, left: entry.Size}
		// errors from fn (e.g. the browser went away) are returned as they are
		if err := fn(entry, reader); err != nil {
			return err
		}
		// whatever fn left unread is still part of the stream
		position = entry.offset + entry.Size - reader.left
	}
	return nil
}

// SortForExtract orders entries the way Extract processes them (archive order), so callers can
// name or size things in the same order the data will arrive.
func SortForExtract(entries []*Entry) {
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].offset < entries[j].offset })
}
