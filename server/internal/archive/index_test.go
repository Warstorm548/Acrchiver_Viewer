package archive

import (
	"errors"
	"strings"
	"testing"
)

func names(entries []*Entry) string {
	out := []string{}
	for _, e := range entries {
		out = append(out, e.Name)
	}
	return strings.Join(out, ",")
}

func TestNaturalSortFoldersFirstAndPaging(t *testing.T) {
	x := newIndex()
	for _, path := range []string{"b10.txt", "B2.txt", "a.txt", "file٣.txt", "file3.txt"} {
		x.add(&Entry{Path: path, Name: path, Size: int64(len(path)), Supported: true})
	}
	x.add(&Entry{Path: "zfolder", Name: "zfolder", IsDir: true, Supported: true})

	all, total := x.Children("", SortName, false, 0, 0)
	if total != 6 || names(all) != "zfolder,a.txt,B2.txt,b10.txt,file3.txt,file٣.txt" {
		t.Errorf("ascending = %s", names(all))
	}
	desc, _ := x.Children("", SortName, true, 0, 0)
	if names(desc) != "zfolder,file٣.txt,file3.txt,b10.txt,B2.txt,a.txt" {
		t.Errorf("descending = %s", names(desc))
	}
	bySize, _ := x.Children("", SortSize, false, 0, 0)
	if bySize[1].Name != "a.txt" {
		t.Errorf("by size = %s", names(bySize))
	}
	page, total := x.Children("", SortName, false, 2, 2)
	if total != 6 || names(page) != "B2.txt,b10.txt" {
		t.Errorf("page = %s (%d)", names(page), total)
	}
	if past, _ := x.Children("", SortName, false, 100, 10); len(past) != 0 {
		t.Error("offset past the end should be empty")
	}
}

func TestSearchAndFilesBelow(t *testing.T) {
	x := newIndex()
	for _, path := range []string{"docs/Report.pdf", "docs/sub/report-2.txt", "other/notes.txt"} {
		x.add(&Entry{Path: path, Name: baseName(path), Supported: true})
	}
	x.add(&Entry{Path: "docs/link", Name: "link"})
	matches, truncated := x.Search("REPORT", 10)
	if names(matches) != "Report.pdf,report-2.txt" || truncated {
		t.Errorf("search = %s %v", names(matches), truncated)
	}
	if matches, truncated := x.Search("t", 2); len(matches) != 2 || !truncated {
		t.Errorf("limited search = %s %v", names(matches), truncated)
	}
	if names(x.FilesBelow("docs")) != "Report.pdf,report-2.txt" {
		t.Errorf("files below docs = %s (unsupported entries are left out)", names(x.FilesBelow("docs")))
	}
	if len(x.FilesBelow("")) != 3 {
		t.Error("files below root")
	}
}

func TestFileAndFolderWithTheSamePathKeepTheFirst(t *testing.T) {
	x := newIndex()
	x.add(&Entry{Path: "a/b", Name: "b", Supported: true, Size: 1})
	x.add(&Entry{Path: "a/b", Name: "b", IsDir: true, Supported: true})
	if x.Get("a/b").IsDir {
		t.Error("the folder must not replace the earlier file")
	}
	// a real folder entry replaces the synthesized one in place
	x.add(&Entry{Path: "c/d.txt", Name: "d.txt", Supported: true})
	x.add(&Entry{Path: "c", Name: "c", IsDir: true, Supported: true, Modified: 42})
	if x.Get("c").Modified != 42 || len(x.children[""]) != 2 {
		t.Errorf("folder c = %+v, root children %d", x.Get("c"), len(x.children[""]))
	}
}

func TestDetect(t *testing.T) {
	ustar := make([]byte, 262)
	copy(ustar[257:], "ustar")
	gz := []byte{0x1f, 0x8b, 8}
	cases := []struct {
		name string
		head []byte
		want Format
		err  error
	}{
		{"a.tar.gz", gz, FormatTarGz, nil},
		{"a.TGZ", gz, FormatTarGz, nil},
		{"a.gz", gz, FormatGz, nil},
		{"a.bz2", gz, FormatGz, nil}, // content wins over a wrong extension
		{"a.tar.bz2", []byte("BZh9"), FormatTarBz2, nil},
		{"a.txz", []byte{0xfd, '7', 'z', 'X', 'Z', 0}, FormatTarXz, nil},
		{"a.zip", ustar, FormatTar, nil},
		{"old.tar", make([]byte, 262), FormatTar, nil},
		{"a.tar.lzma", append([]byte{0x5d}, make([]byte, 20)...), FormatLzma, nil},
		{"a.lzma", append([]byte{0xff}, make([]byte, 20)...), "", ErrUnsupported},
		{"a.zip", []byte("PK\x03\x04"), FormatZip, nil},
		{"a.tar.gz", []byte("PK\x05\x06"), FormatZip, nil}, // content wins
		{"a.7z", []byte("7z\xbc\xaf\x27\x1c"), Format7z, nil},
		{"a.zip", []byte("7z\xbc\xaf\x27\x1c"), Format7z, nil},
		{"a.7z", []byte("7z\xbc\xaf"), "", ErrUnsupported},    // signature cut short
		{"sfx.zip", []byte("MZ\x90\x00"), "", ErrUnsupported}, // as the browser: PK must come first
		{"a.rar", []byte("Rar!\x1a\x07\x01\x00"), "", ErrUnsupported},
	}
	for _, c := range cases {
		got, err := Detect(c.name, c.head)
		if got != c.want || !errors.Is(err, c.err) {
			t.Errorf("Detect(%q) = %q, %v; want %q, %v", c.name, got, err, c.want, c.err)
		}
	}
}

func TestSingleFileName(t *testing.T) {
	cases := map[[2]string]string{
		{"notes.txt.gz", ""}:             "notes.txt",
		{"x.gz", "dir/stored.txt"}:       "stored.txt",
		{"x.gz", `C:\dir\stored.txt`}:    "stored.txt",
		{"data.LZMA", ""}:                "data",
		{".gz", ""}:                      ".gz.out",
		{"archive-in-disguise.gz", "  "}: "archive-in-disguise",
		{"weird", ""}:                    "weird.out",
	}
	for input, want := range cases {
		if got := SingleFileName(input[0], input[1]); got != want {
			t.Errorf("SingleFileName(%q, %q) = %q, want %q", input[0], input[1], got, want)
		}
	}
}
