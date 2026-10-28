package archive

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"io"
	"strings"
	"testing"
)

// sevenZipTree is what testdata/make-7z-zip.sh puts in every 7z and 7-Zip-made ZIP.
var sevenZipTree = map[string]string{
	"docs/readme.txt":        "read me\n",
	"docs/file10.txt":        "ten",
	"docs/file2.txt":         "two",
	"deep/er/still/data.bin": strings.Repeat("\x00\x01\x02", 5000),
	"empty.txt":              "",
	"ünïcødé/文件.txt":         "unicode",
}

const sevenZipTreeModified = 1_700_000_000_000

func scanTestdata(t *testing.T, name string, limits Limits) (*Archive, error) {
	t.Helper()
	return scanBytes(t, readTestdata(t, name), name, limits)
}

// treeFiles returns sevenZipTree's files, optionally only the non-empty ones.
func treeFiles(nonEmpty bool) map[string]bool {
	files := map[string]bool{}
	for path, body := range sevenZipTree {
		if !nonEmpty || body != "" {
			files[path] = true
		}
	}
	return files
}

// checkTree lists and extracts an archive of sevenZipTree; the files in unreadable must be
// listed as unreadable (encrypted, unknown codec), all others must extract correctly.
func checkTree(t *testing.T, a *Archive, unreadable map[string]bool) {
	t.Helper()
	x := a.Index
	for _, folder := range []string{"docs", "deep", "deep/er", "deep/er/still", "emptydir", "ünïcødé"} {
		if entry := x.Get(folder); entry == nil || !entry.IsDir || !entry.Supported {
			t.Errorf("folder %q: %+v", folder, entry)
		}
	}
	if link := x.Get("link"); link == nil || link.IsDir || link.Supported {
		t.Errorf("symlink should be listed as unreadable: %+v", link)
	}
	if readme := x.Get("docs/readme.txt"); readme == nil || readme.Modified != sevenZipTreeModified {
		t.Errorf("readme: %+v", readme)
	}
	var files []*Entry
	for path, body := range sevenZipTree {
		entry := x.Get(path)
		if entry == nil || entry.IsDir || entry.Size != int64(len(body)) {
			t.Fatalf("%s: %+v", path, entry)
		}
		if entry.Supported == unreadable[path] {
			t.Errorf("%s: supported = %v", path, entry.Supported)
		}
		if entry.Supported {
			files = append(files, entry)
		}
	}
	contents := extractAll(t, a, files)
	for _, entry := range files {
		if contents[entry.Path] != sevenZipTree[entry.Path] {
			t.Errorf("%s: got %q", entry.Path, short(contents[entry.Path]))
		}
	}
}

func TestSevenZipCodecs(t *testing.T) {
	// an empty file has no data to decode, so it stays readable
	for _, c := range []struct {
		name       string
		unreadable map[string]bool
	}{
		{"sample-lzma2.7z", nil},
		{"sample-lzma.7z", nil},
		{"sample-ppmd.7z", nil},
		{"sample-bzip2.7z", nil},
		{"sample-deflate.7z", nil},
		{"sample-deflate64.7z", nil},
		{"sample-arm64.7z", nil},
		{"sample-ia64.7z", treeFiles(true)}, // a filter the library lacks
		{"sample-aes.7z", treeFiles(true)},  // encrypted data, readable listing
	} {
		t.Run(c.name, func(t *testing.T) {
			a, err := scanTestdata(t, c.name, generous)
			if err != nil {
				t.Fatal(err)
			}
			if a.Format != Format7z {
				t.Errorf("format = %s", a.Format)
			}
			checkTree(t, a, c.unreadable)
		})
	}
}

func TestSevenZipEncryptedHeader(t *testing.T) {
	if _, err := scanTestdata(t, "sample-aes-header.7z", generous); !errors.Is(err, ErrEncrypted) {
		t.Errorf("want ErrEncrypted, got %v", err)
	}
}

func TestSevenZipSolidStreamInOnePass(t *testing.T) {
	a, err := scanTestdata(t, "sample-lzma2.7z", generous)
	if err != nil {
		t.Fatal(err)
	}
	// partial reads must not disturb the files after them in the same solid stream
	got := map[string]string{}
	err = a.Extract(context.Background(), a.Index.FilesBelow(""), func(entry *Entry, r io.Reader) error {
		if entry.Path == "deep/er/still/data.bin" {
			io.CopyN(io.Discard, r, 10)
			return nil
		}
		data, err := io.ReadAll(r)
		got[entry.Path] = string(data)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	for path, body := range sevenZipTree {
		if path != "deep/er/still/data.bin" && got[path] != body {
			t.Errorf("%s: got %q", path, got[path])
		}
	}
}

func TestSevenZipEntryLimit(t *testing.T) {
	// the patched library refuses the header's file count before allocating for it
	if _, err := scanTestdata(t, "sample-lzma2.7z", Limits{MaxEntries: 5, MaxScanSize: 1 << 30}); !errors.Is(err, ErrTooComplex) {
		t.Errorf("want ErrTooComplex, got %v", err)
	}
}

// sevenZip builds a 7z from a stored header with no streams (signature header and CRCs set).
func sevenZip(header []byte, declaredSize uint64) []byte {
	start := make([]byte, 20)
	binary.LittleEndian.PutUint64(start[0:], 0) // the header follows at once
	binary.LittleEndian.PutUint64(start[8:], declaredSize)
	binary.LittleEndian.PutUint32(start[16:], crc32.ChecksumIEEE(header))
	signature := []byte{'7', 'z', 0xbc, 0xaf, 0x27, 0x1c, 0, 4}
	signature = binary.LittleEndian.AppendUint32(signature, crc32.ChecksumIEEE(start))
	return append(append(signature, start...), header...)
}

func TestSevenZipHeaderBombs(t *testing.T) {
	// kHeader, kFilesInfo, 2^32-1 files (0xF0 + 4 bytes), kEnd, kEnd: a few bytes declaring
	// billions of FileHeader structs, which upstream would allocate
	bomb := []byte{0x01, 0x05, 0xf0, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00}
	if _, err := scanBytes(t, sevenZip(bomb, uint64(len(bomb))), "bomb.7z", generous); !errors.Is(err, ErrTooComplex) ||
		!strings.Contains(err.Error(), "count 4294967295") {
		t.Errorf("file count: want ErrTooComplex for the count, got %v", err)
	}
	// a header declared larger than maxSevenZipHeaderSize is refused before it is read
	if _, err := scanBytes(t, sevenZip(bomb, 1<<30), "huge.7z", generous); !errors.Is(err, ErrTooComplex) ||
		!strings.Contains(err.Error(), "header too large") {
		t.Errorf("header size: want ErrTooComplex for the size, got %v", err)
	}
}

// patchCoder rewrites a coder's properties in a 7z with a stored header and fixes the CRCs.
func patchCoder(t *testing.T, data, coder, properties []byte) []byte {
	t.Helper()
	data = bytes.Clone(data)
	offset := int(binary.LittleEndian.Uint64(data[12:])) + 32
	size := int(binary.LittleEndian.Uint64(data[20:]))
	header := data[offset : offset+size]
	at := bytes.Index(header, coder)
	if at < 0 || bytes.Index(header[at+1:], coder) >= 0 {
		t.Fatalf("coder %x not found once in the header", coder)
	}
	copy(header[at+len(coder):], properties)
	binary.LittleEndian.PutUint32(data[28:], crc32.ChecksumIEEE(header))
	binary.LittleEndian.PutUint32(data[8:], crc32.ChecksumIEEE(data[12:32]))
	return data
}

func TestSevenZipRefusesHugeDecoderMemory(t *testing.T) {
	cases := []struct {
		name, file string
		coder      []byte
		properties []byte
		message    string
	}{
		// flags 0x21 (1-byte id, has properties), id 0x21, 1 byte: 40 = a 4 GiB dictionary
		{"lzma2 dictionary", "raw-header-lzma2.7z", []byte{0x21, 0x21, 0x01}, []byte{40}, "lzma2 dictionary too large"},
		// flags 0x23, id 03 04 01, 5 bytes: order 6, 1 GiB of model memory
		{"ppmd memory", "raw-header-ppmd.7z", []byte{0x23, 0x03, 0x04, 0x01, 0x05}, []byte{6, 0, 0, 0, 0x40}, "PPMd memory size too large"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			data := patchCoder(t, readTestdata(t, c.file), c.coder, c.properties)
			// listing reads only the header: the decoder is built (and refused) on the first read
			a, err := scanBytes(t, data, c.file, generous)
			if err != nil {
				t.Fatal(err)
			}
			entry := a.Index.Get("docs/readme.txt")
			err = a.Extract(context.Background(), []*Entry{entry}, func(_ *Entry, r io.Reader) error {
				_, err := io.ReadAll(r)
				return err
			})
			if !errors.Is(err, ErrTooComplex) || !strings.Contains(err.Error(), c.message) {
				t.Errorf("want ErrTooComplex (%s), got %v", c.message, err)
			}
		})
	}
}

func TestSevenZipDetectsDamage(t *testing.T) {
	data := readTestdata(t, "sample-lzma.7z")
	// the non-solid LZMA streams start right after the 32-byte signature header
	damaged := bytes.Clone(data)
	damaged[40] ^= 0xff
	a, err := scanBytes(t, damaged, "damaged.7z", generous)
	if err != nil {
		t.Fatal(err)
	}
	failed := false
	for _, entry := range a.Index.FilesBelow("") {
		err := a.Extract(context.Background(), []*Entry{entry}, func(_ *Entry, r io.Reader) error {
			_, err := io.ReadAll(r)
			return err
		})
		if err != nil {
			if !errors.Is(err, ErrCorrupt) {
				t.Errorf("%s: want ErrCorrupt, got %v", entry.Path, err)
			}
			failed = true
		}
	}
	if !failed {
		t.Error("damaged data was read without an error")
	}
	if _, err := scanBytes(t, data[:len(data)-10], "cut.7z", generous); !errors.Is(err, ErrCorrupt) {
		t.Errorf("truncated header: want ErrCorrupt, got %v", err)
	}
}

func TestSevenZipCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	path := writeFile(t, readTestdata(t, "sample-lzma2.7z"))
	if _, err := Scan(ctx, path, "s.7z", generous, nil); !errors.Is(err, context.Canceled) {
		t.Errorf("want context.Canceled, got %v", err)
	}
}
