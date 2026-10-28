package session

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/archive"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/opencloud"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/storage"
)

const space = "/spaces/s1$p1"

type fakeFile struct {
	data     []byte
	etag     string
	getETag  string // ETag sent with GET, if different (file replaced meanwhile)
	propSize int    // size reported by PROPFIND, if different
}

type fakeOpenCloud struct {
	mu    sync.Mutex
	files map[string]*fakeFile
}

func (f *fakeOpenCloud) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer ok" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	f.mu.Lock()
	file := f.files[strings.TrimPrefix(r.URL.Path, "/dav")]
	f.mu.Unlock()
	if file == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	switch r.Method {
	case "PROPFIND":
		size := len(file.data)
		if file.propSize != 0 {
			size = file.propSize
		}
		w.WriteHeader(http.StatusMultiStatus)
		fmt.Fprintf(w, `<d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><d:getcontentlength>%d</d:getcontentlength>`+
			`<d:getetag>%s</d:getetag><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`, size, file.etag)
	case http.MethodGet:
		etag := file.etag
		if file.getETag != "" {
			etag = file.getETag
		}
		w.Header().Set("ETag", etag)
		w.Write(file.data)
	}
}

func tarGz(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for _, name := range sortedKeys(files) {
		tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(files[name])), Typeflag: tar.TypeReg})
		io.WriteString(tw, files[name])
	}
	tw.Close()
	gz.Close()
	return buf.Bytes()
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	for i := range keys {
		for j := i + 1; j < len(keys); j++ {
			if keys[j] < keys[i] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	return keys
}

type fixture struct {
	manager *Manager
	ledger  *storage.Ledger
	oc      *fakeOpenCloud
	dir     string
	clock   time.Time
}

func newFixture(t *testing.T, total, perUser int64) *fixture {
	t.Helper()
	oc := &fakeOpenCloud{files: map[string]*fakeFile{}}
	server := httptest.NewServer(oc)
	t.Cleanup(server.Close)
	dir := t.TempDir()
	ledger := storage.NewLedger(total, perUser, nil)
	f := &fixture{oc: oc, dir: dir, ledger: ledger, clock: time.Unix(1_000_000, 0)}
	f.manager = NewManager(Config{
		Dir: dir, Timeout: 10 * time.Minute, ScanTimeout: time.Minute,
		Limits: archive.Limits{MaxEntries: 1000, MaxScanSize: 1 << 30},
	}, ledger, opencloud.NewClient(server.URL, nil))
	f.manager.now = func() time.Time { return f.clock }
	t.Cleanup(f.manager.CloseAll)
	return f
}

func (f *fixture) add(name string, file *fakeFile) string {
	f.oc.files[space+"/"+name] = file
	return space + "/" + name
}

func waitDone(t *testing.T, s *Session) Status {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		status := s.Status()
		if status.State == Ready || status.State == Failed {
			return status
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("session did not finish")
	return Status{}
}

func (f *fixture) tempFiles(t *testing.T) []string {
	t.Helper()
	entries, _ := os.ReadDir(f.dir)
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return names
}

func TestOpenListAndClose(t *testing.T) {
	f := newFixture(t, 1<<20, 1<<20)
	data := tarGz(t, map[string]string{"a/one.txt": "one", "b.txt": "bee"})
	path := f.add("x.tar.gz", &fakeFile{data: data, etag: `"1"`})

	s, err := f.manager.Open(context.Background(), "alice", "Bearer ok", path)
	if err != nil {
		t.Fatal(err)
	}
	status := waitDone(t, s)
	if status.State != Ready || status.Entries != 3 || status.Copied != int64(len(data)) || status.Scanned != int64(len(data)) {
		t.Fatalf("status = %+v", status)
	}
	if total, mine := f.ledger.Usage("alice"); total != int64(len(data)) || mine != int64(len(data)) {
		t.Errorf("reserved %d / %d", total, mine)
	}
	if files := f.tempFiles(t); len(files) != 1 || !strings.HasSuffix(files[0], ".archive") {
		t.Errorf("temp files = %v", files)
	}
	if _, err := f.manager.Get(s.ID, "mallory"); !errors.Is(err, ErrNotFound) {
		t.Error("another user must not see the session")
	}
	if err := f.manager.Close(s.ID, "mallory"); !errors.Is(err, ErrNotFound) {
		t.Error("another user must not close the session")
	}
	if err := f.manager.Close(s.ID, "alice"); err != nil {
		t.Fatal(err)
	}
	if files := f.tempFiles(t); len(files) != 0 {
		t.Errorf("temp files after close = %v", files)
	}
	if total, _ := f.ledger.Usage("alice"); total != 0 {
		t.Errorf("reservation not released: %d", total)
	}
}

func TestOpenErrors(t *testing.T) {
	data := tarGz(t, map[string]string{"a.txt": "a"})
	size := int64(len(data))
	// alice may hold one archive; together the server holds less than two
	f := newFixture(t, 2*size-1, size+10)
	small := f.add("small.tar.gz", &fakeFile{data: data, etag: `"s"`})
	big := f.add("big.tar.gz", &fakeFile{data: make([]byte, size+11), etag: `"b"`})
	ctx := context.Background()

	if _, err := f.manager.Open(ctx, "alice", "Bearer bad", small); !errors.Is(err, opencloud.ErrForbidden) {
		t.Errorf("bad token: %v", err)
	}
	if _, err := f.manager.Open(ctx, "alice", "Bearer ok", space+"/missing.tar"); !errors.Is(err, opencloud.ErrNotFound) {
		t.Errorf("missing: %v", err)
	}
	if _, err := f.manager.Open(ctx, "alice", "Bearer ok", big); !errors.Is(err, storage.ErrArchiveTooLarge) {
		t.Errorf("over the per-user cap: %v", err)
	}
	first, err := f.manager.Open(ctx, "alice", "Bearer ok", small)
	if err != nil {
		t.Fatal(err)
	}
	waitDone(t, first) // a ready archive keeps its reservation
	if _, err := f.manager.Open(ctx, "alice", "Bearer ok", small); !errors.Is(err, storage.ErrUserQuota) {
		t.Errorf("second for alice: %v", err)
	}
	if _, err := f.manager.Open(ctx, "bob", "Bearer ok", small); !errors.Is(err, storage.ErrServerBusy) {
		t.Errorf("bob while alice's archive fills the server: %v", err)
	}
	f.manager.Close(first.ID, "alice")
	if _, err := f.manager.Open(ctx, "bob", "Bearer ok", small); err != nil {
		t.Errorf("bob after alice closed: %v", err)
	}
}

func TestFailuresFreeTheirSpace(t *testing.T) {
	f := newFixture(t, 1<<20, 1<<20)
	good := tarGz(t, map[string]string{"a.txt": "a"})
	cases := map[string]struct {
		file *fakeFile
		code string
	}{
		"replaced.tar.gz": {&fakeFile{data: good, etag: `"1"`, getETag: `"2"`}, CodeChanged},
		"grew.tar.gz":     {&fakeFile{data: good, etag: `"1"`, propSize: 10}, CodeChanged},
		"shrank.tar.gz":   {&fakeFile{data: good, etag: `"1"`, propSize: len(good) + 10}, CodeChanged},
		"broken.tar.gz":   {&fakeFile{data: good[:len(good)/2], etag: `"1"`}, CodeCorrupt},
		"text.zip":        {&fakeFile{data: []byte("PK\x03\x04..."), etag: `"1"`}, CodeUnsupported},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			s, err := f.manager.Open(context.Background(), "alice", "Bearer ok", f.add(name, c.file))
			if err != nil {
				t.Fatal(err)
			}
			status := waitDone(t, s)
			if status.State != Failed || status.Error != c.code {
				t.Fatalf("status = %+v, want code %s", status, c.code)
			}
			if files := f.tempFiles(t); len(files) != 0 {
				t.Errorf("temp files left: %v", files)
			}
			if total, _ := f.ledger.Usage("alice"); total != 0 {
				t.Errorf("space still reserved: %d", total)
			}
			f.manager.Close(s.ID, "alice")
		})
	}
}

func TestTimeoutClosesIdleSessions(t *testing.T) {
	f := newFixture(t, 1<<20, 1<<20)
	path := f.add("x.tar.gz", &fakeFile{data: tarGz(t, map[string]string{"a": "a"}), etag: `"1"`})
	s, _ := f.manager.Open(context.Background(), "alice", "Bearer ok", path)
	waitDone(t, s)

	f.clock = f.clock.Add(9 * time.Minute)
	f.manager.Get(s.ID, "alice") // a heartbeat
	f.clock = f.clock.Add(9 * time.Minute)
	f.manager.Sweep()
	if _, err := f.manager.Get(s.ID, "alice"); err != nil {
		t.Fatal("session closed although it was seen 9 minutes ago")
	}
	f.clock = f.clock.Add(11 * time.Minute)
	f.manager.Sweep()
	if _, err := f.manager.Get(s.ID, "alice"); !errors.Is(err, ErrNotFound) {
		t.Fatal("idle session still open")
	}
	if files := f.tempFiles(t); len(files) != 0 {
		t.Errorf("temp files after timeout: %v", files)
	}
}

func TestDownloadsKeepTheFileAndCountAgainstTheLimit(t *testing.T) {
	f := newFixture(t, 1<<20, 1<<20)
	path := f.add("x.tar.gz", &fakeFile{data: tarGz(t, map[string]string{"a/1.txt": "11", "a/2.txt": "222", "b.txt": "b"}), etag: `"1"`})
	s, _ := f.manager.Open(context.Background(), "alice", "Bearer ok", path)
	waitDone(t, s)
	a, _ := s.Archive()
	limits := DownloadLimits{MaxFile: 100, MaxSelection: 100, MaxPerUser: 2}

	d, err := PrepareDownload(a, "x.tar.gz", []string{"a", "b.txt", "a/1.txt"}, limits)
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Files) != 3 || d.ContentSize != 6 || d.FileName != "x-selection.zip" || len(d.ZipFiles) != 3 {
		t.Errorf("download = %+v", d)
	}
	single, _ := PrepareDownload(a, "x.tar.gz", []string{"a/2.txt"}, limits)
	if single.FileName != "2.txt" || single.Size != 3 || single.ZipFiles != nil {
		t.Errorf("single = %+v", single)
	}
	var tooLarge *TooLargeError
	if _, err := PrepareDownload(a, "x.tar.gz", []string{"a"}, DownloadLimits{MaxFile: 100, MaxSelection: 4}); !errors.As(err, &tooLarge) || tooLarge.Size != 5 {
		t.Errorf("selection cap: %v", err)
	}
	if _, err := PrepareDownload(a, "x.tar.gz", []string{"a/2.txt"}, DownloadLimits{MaxFile: 2, MaxSelection: 100}); !errors.As(err, &tooLarge) {
		t.Errorf("file cap: %v", err)
	}
	if _, err := PrepareDownload(a, "x.tar.gz", []string{"nothing"}, limits); !errors.Is(err, ErrNothingToDownload) {
		t.Errorf("empty: %v", err)
	}

	first, err := f.manager.IssueTicket(s, d, 2)
	if err != nil {
		t.Fatal(err)
	}
	second, _ := f.manager.IssueTicket(s, single, 2)
	if _, err := f.manager.IssueTicket(s, single, 2); !errors.Is(err, ErrTooManyDownloads) {
		t.Errorf("third download: %v", err)
	}

	// the viewer is closed while the first download runs: the file stays until it ends
	_, done, err := f.manager.Redeem(first.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.manager.Redeem(first.ID); !errors.Is(err, ErrTicketInvalid) {
		t.Error("a ticket must work only once")
	}
	f.manager.Close(s.ID, "alice")
	if files := f.tempFiles(t); len(files) != 1 {
		t.Fatalf("temp file removed during a download: %v", files)
	}
	done()
	if files := f.tempFiles(t); len(files) != 1 {
		t.Fatal("the unused second ticket still holds the file")
	}
	// the second ticket expires unused
	f.clock = f.clock.Add(TicketLifetime + time.Second)
	f.manager.Sweep()
	if _, _, err := f.manager.Redeem(second.ID); !errors.Is(err, ErrTicketInvalid) {
		t.Error("expired ticket accepted")
	}
	if files := f.tempFiles(t); len(files) != 0 {
		t.Errorf("temp files after all downloads ended: %v", files)
	}
	if total, _ := f.ledger.Usage("alice"); total != 0 {
		t.Errorf("space still reserved: %d", total)
	}
	if f.manager.downloads["alice"] != 0 {
		t.Errorf("download count = %d", f.manager.downloads["alice"])
	}
}

func TestRemoveOrphansTouchesOnlyHelperFiles(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"ah-1.part", "ah-2.archive", "docker-compose.yml", "ah-notes.txt", ".env"} {
		os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600)
	}
	os.Mkdir(filepath.Join(dir, "ah-dir.archive"), 0o700)
	removed, err := RemoveOrphans(dir)
	if err != nil || removed != 2 {
		t.Fatalf("removed %d, %v", removed, err)
	}
	left, _ := os.ReadDir(dir)
	if len(left) != 4 {
		t.Errorf("left = %v", left)
	}
}

func TestCheckWritable(t *testing.T) {
	dir := t.TempDir()
	if err := CheckWritable(dir); err != nil {
		t.Fatal(err)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Error("probe file left behind")
	}
	if os.Getuid() == 0 {
		t.Skip("root can write anywhere")
	}
	os.Chmod(dir, 0o500)
	defer os.Chmod(dir, 0o700)
	if err := CheckWritable(dir); err == nil || !strings.Contains(err.Error(), "sudo chown") {
		t.Errorf("want a chown hint, got %v", err)
	}
	if err := CheckWritable(filepath.Join(dir, "missing")); err == nil {
		t.Error("missing folder accepted")
	}
}
