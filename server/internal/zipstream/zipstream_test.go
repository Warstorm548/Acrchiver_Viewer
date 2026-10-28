package zipstream

import (
	"archive/zip"
	"bytes"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var when = time.Date(2024, 5, 17, 13, 45, 30, 0, time.UTC)

func build(t *testing.T, names []string, contents []string) []byte {
	t.Helper()
	files := make([]File, len(names))
	for i := range names {
		files[i] = File{Name: names[i], Size: int64(len(contents[i])), Modified: when}
	}
	var buf bytes.Buffer
	z := NewWriter(&buf, files)
	for _, content := range contents {
		if err := z.Add(strings.NewReader(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	if int64(buf.Len()) != Size(files) {
		t.Fatalf("wrote %d bytes, Size() said %d", buf.Len(), Size(files))
	}
	return buf.Bytes()
}

func checkWithGo(t *testing.T, data []byte, names, contents []string) {
	t.Helper()
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	if len(r.File) != len(names) {
		t.Fatalf("%d files, want %d", len(r.File), len(names))
	}
	for i, f := range r.File {
		if f.Name != names[i] {
			t.Errorf("name %q, want %q", f.Name, names[i])
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		got, err := io.ReadAll(rc) // also verifies the CRC
		rc.Close()
		if err != nil || string(got) != contents[i] {
			t.Errorf("%s: %q, %v", f.Name, got, err)
		}
		if !f.Modified.Equal(when) {
			t.Errorf("%s: modified %v", f.Name, f.Modified)
		}
	}
}

// checkWithTools runs unzip -t and Python's zipfile when available.
func checkWithTools(t *testing.T, data []byte) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "x.zip")
	os.WriteFile(path, data, 0o600)
	if _, err := exec.LookPath("unzip"); err == nil {
		if out, err := exec.Command("unzip", "-t", path).CombinedOutput(); err != nil {
			t.Errorf("unzip -t: %v\n%s", err, out)
		}
	}
	if _, err := exec.LookPath("python3"); err == nil {
		script := "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); bad = z.testzip(); sys.exit(1 if bad else 0)"
		if out, err := exec.Command("python3", "-I", "-c", script, path).CombinedOutput(); err != nil {
			t.Errorf("python zipfile: %v\n%s", err, out)
		}
	}
}

func TestZip(t *testing.T) {
	names := []string{"a.txt", "dir/ünïcødé.txt", "empty", "dir/sub/big.bin"}
	contents := []string{"hello", "unicode name", "", strings.Repeat("0123456789", 10000)}
	data := build(t, names, contents)
	checkWithGo(t, data, names, contents)
	checkWithTools(t, data)
}

func TestZip64(t *testing.T) {
	zip64Threshold = 1000
	defer func() { zip64Threshold = max32 }()
	names := []string{"small.txt", "large.bin", "after.txt"}
	contents := []string{"x", strings.Repeat("z", 5000), "after the big one"}
	data := build(t, names, contents)
	if !bytes.Contains(data, []byte{0x50, 0x4b, 0x06, 0x06}) {
		t.Fatal("no ZIP64 end record")
	}
	checkWithGo(t, data, names, contents)
	checkWithTools(t, data)
}

func TestEmptySelection(t *testing.T) {
	data := build(t, nil, nil)
	if len(data) != endRecordLen {
		t.Errorf("empty zip has %d bytes", len(data))
	}
}

func TestShortDataIsAnError(t *testing.T) {
	var buf bytes.Buffer
	z := NewWriter(&buf, []File{{Name: "a", Size: 10}})
	if err := z.Add(strings.NewReader("short")); !errors.Is(err, ErrSizeMismatch) {
		t.Errorf("want ErrSizeMismatch, got %v", err)
	}
}

func TestNames(t *testing.T) {
	got := Names([]string{
		"docs/a.txt", "docs/a.txt", "../../etc/passwd", " .. /x", "dir/", "a\\b:c\x01.txt", "", "docs/a.txt", "noext", "noext",
	})
	want := []string{
		"docs/a.txt", "docs/a (2).txt", "etc/passwd", "x", "dir", "a_b:c_.txt", "download", "docs/a (3).txt", "noext", "noext (2)",
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("Names[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestSanitizeFileName(t *testing.T) {
	for input, want := range map[string]string{"a/b": "a_b", "  ": "download", "ok.txt": "ok.txt", "x\ny": "x_y"} {
		if got := SanitizeFileName(input); got != want {
			t.Errorf("SanitizeFileName(%q) = %q, want %q", input, got, want)
		}
	}
}
