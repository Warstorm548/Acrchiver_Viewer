package archive

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type tarFile struct {
	name     string
	body     string
	typeflag byte
	format   tar.Format
}

var sampleFiles = []tarFile{
	{name: "docs/", typeflag: tar.TypeDir},
	{name: "docs/readme.txt", body: "read me\n"},
	{name: "docs/file10.txt", body: "ten"},
	{name: "docs/file2.txt", body: "two"},
	// parent folders "deep" and "deep/er" are missing and must be synthesized
	{name: "deep/er/still/data.bin", body: strings.Repeat("\x00\x01\x02", 5000)},
	{name: "./dot/slash.txt", body: "normalized"},
	{name: "dup.txt", body: "first version"},
	{name: "empty.txt", body: ""},
	{name: "link", typeflag: tar.TypeSymlink},
	{name: strings.Repeat("long-name-", 20) + ".txt", body: "pax long name", format: tar.FormatPAX},
	{name: "gnu/" + strings.Repeat("g", 150) + ".txt", body: "gnu long name", format: tar.FormatGNU},
	{name: "ünïcødé/文件.txt", body: "unicode", format: tar.FormatPAX},
	{name: "dup.txt", body: "second version wins"},
}

func buildTar(t *testing.T, files []tarFile) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := tar.NewWriter(&buf)
	for _, f := range files {
		header := &tar.Header{
			Name:     f.name,
			Mode:     0o644,
			Size:     int64(len(f.body)),
			ModTime:  time.Unix(1_700_000_000, 0),
			Typeflag: f.typeflag,
			Format:   f.format,
		}
		if f.typeflag == 0 {
			header.Typeflag = tar.TypeReg
		}
		if f.typeflag == tar.TypeDir || f.typeflag == tar.TypeSymlink {
			header.Size = 0
			header.Linkname = map[byte]string{tar.TypeSymlink: "docs/readme.txt"}[f.typeflag]
		}
		if err := w.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		io.WriteString(w, f.body)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func gzipBytes(t *testing.T, data []byte, name string) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	w.Name = name
	w.ModTime = time.Unix(1_600_000_000, 0)
	w.Write(data)
	w.Close()
	return buf.Bytes()
}

// compressWith runs a system compressor (bzip2, xz, lzma), skipping the test if it is missing.
func compressWith(t *testing.T, tool string, data []byte) []byte {
	t.Helper()
	if _, err := exec.LookPath(tool); err != nil {
		t.Skipf("%s not installed", tool)
	}
	cmd := exec.Command(tool, "-c")
	cmd.Stdin = bytes.NewReader(data)
	out, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func writeFile(t *testing.T, data []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "ah-test.archive")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

var generous = Limits{MaxEntries: 1000, MaxScanSize: 1 << 30}

func scanBytes(t *testing.T, data []byte, name string, limits Limits) (*Archive, error) {
	t.Helper()
	return Scan(context.Background(), writeFile(t, data), name, limits, nil)
}

func extractAll(t *testing.T, a *Archive, entries []*Entry) map[string]string {
	t.Helper()
	contents := map[string]string{}
	err := a.Extract(context.Background(), entries, func(entry *Entry, r io.Reader) error {
		data, err := io.ReadAll(r)
		contents[entry.Path] = string(data)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return contents
}

func TestScanAndExtractEveryTarFormat(t *testing.T) {
	plain := buildTar(t, sampleFiles)
	cases := []struct {
		name   string
		data   func(*testing.T) []byte
		format Format
	}{
		{"sample.tar", func(*testing.T) []byte { return plain }, FormatTar},
		{"sample.tar.gz", func(t *testing.T) []byte { return gzipBytes(t, plain, "") }, FormatTarGz},
		{"sample.tgz", func(t *testing.T) []byte { return gzipBytes(t, plain, "") }, FormatTarGz},
		{"sample.tar.bz2", func(t *testing.T) []byte { return compressWith(t, "bzip2", plain) }, FormatTarBz2},
		{"sample.tar.xz", func(t *testing.T) []byte { return compressWith(t, "xz", plain) }, FormatTarXz},
		{"sample.tar.lzma", func(t *testing.T) []byte { return compressWith(t, "lzma", plain) }, FormatLzma},
		// a tarball named like a single file is still opened as a tar
		{"disguised.gz", func(t *testing.T) []byte { return gzipBytes(t, plain, "") }, FormatGz},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			a, err := scanBytes(t, c.data(t), c.name, generous)
			if err != nil {
				t.Fatal(err)
			}
			if a.Format != c.format {
				t.Errorf("format = %s, want %s", a.Format, c.format)
			}
			checkSampleIndex(t, a)
			files := a.Index.FilesBelow("")
			contents := extractAll(t, a, files)
			want := map[string]string{}
			for _, f := range sampleFiles {
				if f.typeflag == 0 {
					want[NormalizePath(f.name)] = f.body // later duplicates overwrite
				}
			}
			for path, body := range want {
				if contents[path] != body {
					t.Errorf("%s: got %q, want %q", path, short(contents[path]), short(body))
				}
			}
			if len(contents) != len(want) {
				t.Errorf("extracted %d files, want %d", len(contents), len(want))
			}
		})
	}
}

func short(s string) string {
	if len(s) > 40 {
		return s[:40] + "…"
	}
	return s
}

func checkSampleIndex(t *testing.T, a *Archive) {
	t.Helper()
	x := a.Index
	for _, folder := range []string{"docs", "deep", "deep/er", "deep/er/still", "dot", "gnu", "ünïcødé"} {
		if !x.IsFolder(folder) || x.Get(folder) == nil || !x.Get(folder).IsDir {
			t.Errorf("folder %q missing", folder)
		}
	}
	children, total := x.Children("docs", SortName, false, 0, 0)
	names := []string{}
	for _, c := range children {
		names = append(names, c.Name)
	}
	if total != 3 || strings.Join(names, ",") != "file2.txt,file10.txt,readme.txt" {
		t.Errorf("docs children = %v (%d)", names, total)
	}
	if dup := x.Get("dup.txt"); dup == nil || dup.Size != int64(len("second version wins")) {
		t.Errorf("duplicate should keep the last version: %+v", dup)
	}
	if link := x.Get("link"); link == nil || link.Supported || link.Size != 0 {
		t.Errorf("symlink should be listed as unsupported: %+v", link)
	}
	if long := x.Get(strings.Repeat("long-name-", 20) + ".txt"); long == nil {
		t.Error("pax long name missing")
	}
	if readme := x.Get("docs/readme.txt"); readme.Modified != 1_700_000_000_000 {
		t.Errorf("modified = %d", readme.Modified)
	}
	root, _ := x.Children("", SortName, false, 0, 0)
	if !root[0].IsDir {
		t.Error("folders must come first")
	}
}

func TestSingleCompressedFiles(t *testing.T) {
	text := []byte("Plain text inside a compressed file.\n")
	cases := []struct {
		name     string
		data     func(*testing.T) []byte
		wantName string
	}{
		{"notes.txt.gz", func(t *testing.T) []byte { return gzipBytes(t, text, "") }, "notes.txt"},
		{"renamed.gz", func(t *testing.T) []byte { return gzipBytes(t, text, "dir/original.txt") }, "original.txt"},
		{"notes.txt.bz2", func(t *testing.T) []byte { return compressWith(t, "bzip2", text) }, "notes.txt"},
		{"notes.txt.xz", func(t *testing.T) []byte { return compressWith(t, "xz", text) }, "notes.txt"},
		{"data.lzma", func(t *testing.T) []byte { return compressWith(t, "lzma", text) }, "data"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			a, err := scanBytes(t, c.data(t), c.name, generous)
			if err != nil {
				t.Fatal(err)
			}
			if a.Index.Len() != 1 {
				t.Fatalf("entries = %d", a.Index.Len())
			}
			entry := a.Index.Get(c.wantName)
			if entry == nil || entry.Size != int64(len(text)) {
				t.Fatalf("entry = %+v", entry)
			}
			if got := extractAll(t, a, []*Entry{entry})[c.wantName]; got != string(text) {
				t.Errorf("content = %q", got)
			}
		})
	}
}

func TestPartialReadsKeepTheStreamInStep(t *testing.T) {
	plain := buildTar(t, sampleFiles)
	a, err := scanBytes(t, gzipBytes(t, plain, ""), "s.tar.gz", generous)
	if err != nil {
		t.Fatal(err)
	}
	files := a.Index.FilesBelow("")
	got := map[string]string{}
	err = a.Extract(context.Background(), files, func(entry *Entry, r io.Reader) error {
		if entry.Path == "deep/er/still/data.bin" {
			io.CopyN(io.Discard, r, 10) // read a little only
			return nil
		}
		data, err := io.ReadAll(r)
		got[entry.Path] = string(data)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if got["empty.txt"] != "" || got["dup.txt"] != "second version wins" || got["docs/readme.txt"] != "read me\n" {
		t.Errorf("contents after a partial read: %v", got)
	}
}

func TestLimits(t *testing.T) {
	plain := buildTar(t, sampleFiles)
	if _, err := scanBytes(t, plain, "s.tar", Limits{MaxEntries: 5, MaxScanSize: 1 << 30}); !errors.Is(err, ErrTooComplex) {
		t.Errorf("entries: want ErrTooComplex, got %v", err)
	}
	// a gzip "bomb": 64 MiB of zeros in about 64 KiB
	bomb := gzipBytes(t, make([]byte, 64<<20), "")
	if _, err := scanBytes(t, bomb, "bomb.gz", Limits{MaxEntries: 10, MaxScanSize: 8 << 20}); !errors.Is(err, ErrTooComplex) {
		t.Errorf("bomb: want ErrTooComplex, got %v", err)
	}
	if _, err := scanBytes(t, gzipBytes(t, plain, ""), "s.tar.gz", Limits{MaxEntries: 1000, MaxScanSize: 1000}); !errors.Is(err, ErrTooComplex) {
		t.Errorf("scan size: want ErrTooComplex, got %v", err)
	}
}

func TestDamagedArchives(t *testing.T) {
	plain := buildTar(t, sampleFiles)
	compressed := gzipBytes(t, plain, "")
	if _, err := scanBytes(t, compressed[:len(compressed)/2], "half.tar.gz", generous); !errors.Is(err, ErrCorrupt) {
		t.Errorf("truncated gzip: want ErrCorrupt, got %v", err)
	}
	// cut inside deep/er/still/data.bin's 15000 bytes
	if _, err := scanBytes(t, plain[:len(plain)/2], "half.tar", generous); !errors.Is(err, ErrCorrupt) {
		t.Errorf("truncated tar: want ErrCorrupt, got %v", err)
	}
	bad := append([]byte{}, plain...)
	bad[100] ^= 0xff // header checksum no longer matches
	if _, err := scanBytes(t, bad, "bad.tar", generous); !errors.Is(err, ErrCorrupt) {
		t.Errorf("bad checksum: want ErrCorrupt, got %v", err)
	}
	if _, err := scanBytes(t, []byte("PK\x03\x04 a zip"), "x.zip", generous); !errors.Is(err, ErrUnsupported) {
		t.Errorf("zip: want ErrUnsupported, got %v", err)
	}
	if _, err := scanBytes(t, []byte("just text"), "x.txt", generous); !errors.Is(err, ErrUnsupported) {
		t.Errorf("text: want ErrUnsupported, got %v", err)
	}
}

func TestCancelStopsTheScan(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	path := writeFile(t, gzipBytes(t, buildTar(t, sampleFiles), ""))
	if _, err := Scan(ctx, path, "s.tar.gz", generous, nil); !errors.Is(err, context.Canceled) {
		t.Errorf("want context.Canceled, got %v", err)
	}
}

func TestProgressCountsArchiveBytes(t *testing.T) {
	data := gzipBytes(t, buildTar(t, sampleFiles), "")
	var progress atomic.Int64
	if _, err := Scan(context.Background(), writeFile(t, data), "s.tar.gz", generous, &progress); err != nil {
		t.Fatal(err)
	}
	if progress.Load() != int64(len(data)) {
		t.Errorf("progress = %d, file = %d", progress.Load(), len(data))
	}
}

// The shared fixtures next to the repository (../test-fixtures, made by make-fixtures.sh with
// Python's reference encoders; also used by the e2e suite) are opened the same way as in the
// browser, when they are present.
func TestSharedFixtures(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "..", "test-fixtures")
	if _, err := os.Stat(dir); err != nil {
		t.Skip("test-fixtures not found")
	}
	for _, name := range []string{
		"sample.tar", "sample.tar.gz", "sample.tgz", "sample.tar.bz2", "sample.tbz2", "sample.tar.xz",
		"sample.txz", "sample.tar.lzma", "archive-in-disguise.gz", "notes.txt.gz", "notes.txt.xz",
		"data.json.bz2", "data.json.lzma", "filters-x86.bin.xz", "large.tar.bz2", "large.tar.xz",
	} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(dir, name)
			a, err := Scan(context.Background(), path, name, Limits{MaxEntries: 100000, MaxScanSize: 4 << 30}, nil)
			if err != nil {
				t.Fatal(err)
			}
			files := a.Index.FilesBelow("")
			if len(files) == 0 {
				t.Fatal("no files listed")
			}
			total := int64(0)
			err = a.Extract(context.Background(), files, func(entry *Entry, r io.Reader) error {
				n, err := io.Copy(io.Discard, r)
				total += n
				if n != entry.Size {
					t.Errorf("%s: read %d of %d bytes", entry.Path, n, entry.Size)
				}
				return err
			})
			if err != nil {
				t.Fatal(err)
			}
		})
	}
}
