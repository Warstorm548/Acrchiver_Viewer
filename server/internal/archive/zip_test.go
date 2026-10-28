package archive

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"io/fs"
	"strings"
	"testing"
	"time"

	"github.com/klauspost/compress/zstd"
	"github.com/ulikunitz/xz"
)

func TestZipMethods(t *testing.T) {
	// 7-Zip stores the small files and uses the method for data.bin only; it encrypts every file
	dataBin := map[string]bool{"deep/er/still/data.bin": true}
	for _, c := range []struct {
		name       string
		method     uint16 // of data.bin
		unreadable map[string]bool
	}{
		{"sample-store.zip", zipStore, nil},
		{"sample-deflate.zip", zipDeflate, nil},
		{"sample-deflate64.zip", zipDeflate64, nil},
		{"sample-bzip2.zip", zipBzip2, nil},
		{"sample-lzma.zip", zipLzma, nil},
		{"sample-ppmd.zip", 0, dataBin}, // method 98, not decoded
		{"sample-zipcrypto.zip", 0, treeFiles(false)},
		{"sample-aes.zip", 0, treeFiles(false)},
	} {
		t.Run(c.name, func(t *testing.T) {
			a, err := scanTestdata(t, c.name, generous)
			if err != nil {
				t.Fatal(err)
			}
			if a.Format != FormatZip {
				t.Errorf("format = %s", a.Format)
			}
			if c.unreadable == nil {
				if data := a.Index.Get("deep/er/still/data.bin").zip; data == nil || data.method != c.method {
					t.Errorf("data.bin method: %+v", data)
				}
			}
			checkTree(t, a, c.unreadable)
		})
	}
}

func TestZipDeflate64Window(t *testing.T) {
	// 40,000 random bytes twice: the second half is copied from 40,000 bytes back, past
	// deflate's 32 KiB window
	a, err := scanTestdata(t, "deflate64-window.zip", generous)
	if err != nil {
		t.Fatal(err)
	}
	data := extractAll(t, a, a.Index.FilesBelow(""))["window.bin"]
	if len(data) != 80000 || data[:40000] != data[40000:] {
		t.Errorf("window.bin: %d bytes, halves equal = %v", len(data), len(data) == 80000 && data[:40000] == data[40000:])
	}
}

func TestZipPythonLzmaWithEndMarker(t *testing.T) {
	a, err := scanTestdata(t, "python-lzma.zip", generous)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range a.Index.FilesBelow("") {
		if entry.zip == nil || entry.zip.method != zipLzma || entry.zip.flags&zipFlagLzmaEndMarker == 0 {
			t.Errorf("%s: want LZMA with an end marker, got %+v", entry.Path, entry.zip)
		}
	}
	contents := extractAll(t, a, a.Index.FilesBelow(""))
	if contents["docs/readme.txt"] != "read me\n" || contents["deep/data.bin"] != strings.Repeat("\x00\x01\x02", 5000) {
		t.Errorf("contents: %v", contents)
	}
}

func TestZipCp437Names(t *testing.T) {
	a, err := scanTestdata(t, "cp437-names.zip", generous)
	if err != nil {
		t.Fatal(err)
	}
	// "café/naïve ½.txt" stored as CP437 without the UTF-8 flag, decoded like zip.js does
	if entry := a.Index.Get("café/naïve ½.txt"); entry == nil {
		t.Errorf("names: %v", names(a.Index.FilesBelow("")))
	}
}

type zipFile struct {
	header zip.FileHeader
	body   []byte
}

// bufferedCompressor compresses on Close: Go's zip.Writer writes the local header lazily, and
// xz.NewWriter would put its stream header in front of it.
type bufferedCompressor struct {
	bytes.Buffer
	out      io.Writer
	compress func(io.Writer) (io.WriteCloser, error)
}

func (b *bufferedCompressor) Close() error {
	w, err := b.compress(b.out)
	if err != nil {
		return err
	}
	if _, err := w.Write(b.Bytes()); err != nil {
		return err
	}
	return w.Close()
}

func compressor(compress func(io.Writer) (io.WriteCloser, error)) zip.Compressor {
	return func(out io.Writer) (io.WriteCloser, error) {
		return &bufferedCompressor{out: out, compress: compress}, nil
	}
}

// buildZip writes a ZIP with Go's writer, which can also use the extra methods registered here.
func buildZip(t *testing.T, files []zipFile) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	w.RegisterCompressor(zipZstd, compressor(func(out io.Writer) (io.WriteCloser, error) { return zstd.NewWriter(out) }))
	w.RegisterCompressor(zipXz, compressor(func(out io.Writer) (io.WriteCloser, error) { return xz.NewWriter(out) }))
	for _, f := range files {
		header := f.header
		fw, err := w.CreateHeader(&header)
		if err != nil {
			t.Fatal(err)
		}
		fw.Write(f.body)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestZipBuiltCases(t *testing.T) {
	modified := time.Unix(1_700_000_000, 0)
	text := []byte(strings.Repeat("zip helper text\n", 300))
	symlink := zip.FileHeader{Name: "link", Method: zip.Store}
	symlink.SetMode(fs.ModeSymlink | 0o777)
	msdosFolder := zip.FileHeader{Name: "windows-folder", CreatorVersion: 0, ExternalAttrs: 0x10}
	// a raw (non-UTF-8) name with an Info-ZIP Unicode Path field naming it properly
	rawName := []byte("old\xff.txt")
	unicodePath := binary.LittleEndian.AppendUint16(nil, 0x7075)
	unicodePath = binary.LittleEndian.AppendUint16(unicodePath, uint16(5+len("ünïcode.txt")))
	unicodePath = append(unicodePath, 1)
	unicodePath = binary.LittleEndian.AppendUint32(unicodePath, crc32.ChecksumIEEE(rawName))
	unicodePath = append(unicodePath, "ünïcode.txt"...)
	// DOS date only (no extended timestamp): 2023-11-14 22:13:20 as a wall-clock time
	dosOnly := zip.FileHeader{Name: "dos.txt", Method: zip.Store,
		ModifiedDate: uint16((2023-1980)<<9 | 11<<5 | 14), ModifiedTime: uint16(22<<11 | 13<<5 | 20/2)}

	data := buildZip(t, []zipFile{
		{zip.FileHeader{Name: "methods/zstd.txt", Method: zipZstd, Modified: modified}, text},
		{zip.FileHeader{Name: "methods/xz.txt", Method: zipXz, Modified: modified}, text},
		{zip.FileHeader{Name: "dup.txt", Method: zip.Deflate}, []byte("first")},
		{zip.FileHeader{Name: "dup.txt", Method: zip.Deflate}, []byte("second wins")},
		{symlink, []byte("dup.txt")},
		{msdosFolder, nil},
		{zip.FileHeader{Name: string(rawName), NonUTF8: true, Extra: unicodePath}, []byte("unicode path")},
		{dosOnly, []byte("dos")},
	})
	a, err := scanBytes(t, data, "built.zip", generous)
	if err != nil {
		t.Fatal(err)
	}
	x := a.Index
	if link := x.Get("link"); link == nil || link.Supported {
		t.Errorf("symlink: %+v", link)
	}
	if folder := x.Get("windows-folder"); folder == nil || !folder.IsDir {
		t.Errorf("MS-DOS folder attribute: %+v", folder)
	}
	if entry := x.Get("methods/zstd.txt"); entry == nil || entry.Modified != 1_700_000_000_000 || entry.LocalTime {
		t.Errorf("extended timestamp: %+v", entry)
	}
	if entry := x.Get("dos.txt"); entry == nil || entry.Modified != 1_700_000_000_000 || !entry.LocalTime {
		t.Errorf("DOS date: %+v", entry)
	}
	contents := extractAll(t, a, x.FilesBelow(""))
	want := map[string]string{
		"methods/zstd.txt": string(text), "methods/xz.txt": string(text), "dup.txt": "second wins",
		"ünïcode.txt": "unicode path", "dos.txt": "dos",
	}
	for path, body := range want {
		if contents[path] != body {
			t.Errorf("%s: got %q", path, short(contents[path]))
		}
	}
}

func TestZip64ManyEntries(t *testing.T) {
	// over 65,535 entries: the counts live in the ZIP64 end of central directory record
	files := make([]zipFile, 70000)
	for i := range files {
		files[i] = zipFile{zip.FileHeader{Name: fmt.Sprintf("d%d/f%d", i%100, i), Method: zip.Store}, []byte{byte(i)}}
	}
	data := buildZip(t, files)
	a, err := scanBytes(t, data, "many.zip", Limits{MaxEntries: 100000, MaxScanSize: 1 << 30})
	if err != nil {
		t.Fatal(err)
	}
	if got := len(a.Index.FilesBelow("")); got != 70000 {
		t.Errorf("files = %d", got)
	}
	if _, err := scanBytes(t, data, "many.zip", Limits{MaxEntries: 60000, MaxScanSize: 1 << 30}); !errors.Is(err, ErrTooComplex) {
		t.Errorf("want ErrTooComplex, got %v", err)
	}
}

func TestZipHostileDirectory(t *testing.T) {
	data := buildZip(t, []zipFile{
		{zip.FileHeader{Name: "a.txt", Method: zip.Store}, []byte("stored data")},
		{zip.FileHeader{Name: "b.txt", Method: zip.Deflate}, []byte("deflated data")},
	})
	end := bytes.LastIndex(data, []byte("PK\x05\x06"))
	central := bytes.Index(data, []byte("PK\x01\x02"))

	t.Run("declared count over the limit", func(t *testing.T) {
		// refused from the end record alone, before any header is read
		bad := bytes.Clone(data)
		binary.LittleEndian.PutUint16(bad[end+10:], 0xfff0)
		_, err := scanBytes(t, bad, "x.zip", generous)
		if !errors.Is(err, ErrTooComplex) {
			t.Errorf("want ErrTooComplex, got %v", err)
		}
	})
	t.Run("local header out of the file", func(t *testing.T) {
		bad := bytes.Clone(data)
		binary.LittleEndian.PutUint32(bad[central+42:], uint32(len(data)+100))
		if _, err := scanBytes(t, bad, "x.zip", generous); !errors.Is(err, ErrCorrupt) {
			t.Errorf("want ErrCorrupt, got %v", err)
		}
	})
	t.Run("directory out of the file", func(t *testing.T) {
		bad := bytes.Clone(data)
		binary.LittleEndian.PutUint32(bad[end+16:], uint32(len(data)))
		if _, err := scanBytes(t, bad, "x.zip", generous); !errors.Is(err, ErrCorrupt) {
			t.Errorf("want ErrCorrupt, got %v", err)
		}
	})
	t.Run("CRC mismatch", func(t *testing.T) {
		bad := bytes.Clone(data)
		at := bytes.Index(bad, []byte("stored data"))
		bad[at] = 'S'
		a, err := scanBytes(t, bad, "x.zip", generous)
		if err != nil {
			t.Fatal(err)
		}
		err = a.Extract(context.Background(), []*Entry{a.Index.Get("a.txt")}, func(_ *Entry, r io.Reader) error {
			_, err := io.ReadAll(r)
			return err
		})
		if !errors.Is(err, ErrCorrupt) {
			t.Errorf("want ErrCorrupt, got %v", err)
		}
	})
}

func TestZipRefusesHugeLzmaDictionary(t *testing.T) {
	data := bytes.Clone(readTestdata(t, "python-lzma.zip"))
	// each LZMA entry starts with version (2 bytes), properties size 5 (2 bytes), properties
	at := bytes.Index(data, []byte{0x05, 0x00, 0x5d})
	if at < 0 {
		t.Fatal("LZMA properties not found")
	}
	binary.LittleEndian.PutUint32(data[at+3:], 1<<30)
	a, err := scanBytes(t, data, "x.zip", generous)
	if err != nil {
		t.Fatal(err)
	}
	err = a.Extract(context.Background(), a.Index.FilesBelow(""), func(_ *Entry, r io.Reader) error {
		_, err := io.ReadAll(r)
		return err
	})
	if !errors.Is(err, ErrTooComplex) || !strings.Contains(err.Error(), "dictionary") {
		t.Errorf("want ErrTooComplex for the dictionary, got %v", err)
	}
}
