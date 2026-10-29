package api

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/archive"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/config"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/opencloud"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/session"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/storage"
)

const filePath = "/spaces/s1$p1/big archive.tar.gz"

var archiveFiles = []struct{ name, body string }{
	{"docs/readme.txt", "read me"},
	{"docs/file2.txt", "two"},
	{"docs/file10.txt", "ten"},
	{"photos/a.jpg", strings.Repeat("J", 3000)},
	{"top.txt", "top level"},
}

func buildArchive(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for _, f := range archiveFiles {
		tw.WriteHeader(&tar.Header{Name: f.name, Mode: 0o644, Size: int64(len(f.body)), Typeflag: tar.TypeReg, ModTime: time.Unix(1_700_000_000, 0)})
		io.WriteString(tw, f.body)
	}
	tw.Close()
	gz.Close()
	return buf.Bytes()
}

type env struct {
	t      *testing.T
	server *httptest.Server
	cfg    config.Config
}

func newEnv(t *testing.T, change func(*config.Config)) *env {
	t.Helper()
	data := buildArchive(t)
	oc := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/status.php" {
			fmt.Fprint(w, `{"installed":true,"productname":"OpenCloud"}`)
			return
		}
		if r.Header.Get("Authorization") != "Bearer token" || r.URL.Path != "/dav"+filePath {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.Method == "PROPFIND" {
			w.WriteHeader(http.StatusMultiStatus)
			fmt.Fprintf(w, `<d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><d:getcontentlength>%d</d:getcontentlength>`+
				`<d:getetag>"e"</d:getetag><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`, len(data))
			return
		}
		w.Header().Set("ETag", `"e"`)
		w.Write(data)
	}))
	t.Cleanup(oc.Close)
	cfg, _ := config.Load(func(string) (string, bool) { return "", false })
	cfg.DataDir = t.TempDir()
	cfg.OpenCloudURL = oc.URL
	if change != nil {
		change(&cfg)
	}
	manager := session.NewManager(session.Config{
		Dir: cfg.DataDir, Timeout: cfg.SessionTimeout, ScanTimeout: cfg.ScanTimeout,
		Limits: archive.Limits{MaxEntries: cfg.MaxEntries, MaxScanSize: cfg.MaxScanSize},
	}, storage.NewLedger(cfg.MaxStorage, cfg.MaxStoragePerUser, nil), opencloud.NewClient(oc.URL, nil))
	server := httptest.NewServer(New(cfg, manager).Handler())
	t.Cleanup(server.Close)
	// runs before the temp folder is removed (cleanups run last-registered first)
	t.Cleanup(manager.CloseAll)
	return &env{t: t, server: server, cfg: cfg}
}

// call sends a request as user ("" = no X-Remote-User, like an unauthenticated route).
func (e *env) call(method, path, user string, body any) (int, map[string]any, []byte) {
	e.t.Helper()
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	request, _ := http.NewRequest(method, e.server.URL+path, reader)
	if user != "" {
		request.Header.Set("X-Remote-User", user)
		request.Header.Set("Authorization", "Bearer token")
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		e.t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	var decoded map[string]any
	if strings.HasPrefix(response.Header.Get("Content-Type"), "application/json") {
		json.Unmarshal(raw, &decoded)
	}
	return response.StatusCode, decoded, raw
}

func (e *env) openReady(user string) string {
	e.t.Helper()
	status, body, _ := e.call("POST", "/archive-api/sessions", user, map[string]string{"webDavPath": filePath})
	if status != http.StatusAccepted {
		e.t.Fatalf("open: %d %v", status, body)
	}
	id := body["id"].(string)
	for i := 0; i < 500; i++ {
		_, body, _ = e.call("GET", "/archive-api/sessions/"+id, user, nil)
		if body["state"] == "ready" {
			return id
		}
		if body["state"] == "error" {
			e.t.Fatalf("session failed: %v", body)
		}
		time.Sleep(5 * time.Millisecond)
	}
	e.t.Fatal("session not ready")
	return ""
}

func names(body map[string]any) string {
	var out []string
	for _, entry := range body["entries"].([]any) {
		out = append(out, entry.(map[string]any)["name"].(string))
	}
	return strings.Join(out, ",")
}

func TestBrowseAndDownload(t *testing.T) {
	e := newEnv(t, nil)
	id := e.openReady("alice")
	base := "/archive-api/sessions/" + id

	_, root, _ := e.call("GET", base+"/children?path=", "alice", nil)
	if names(root) != "docs,photos,top.txt" || root["total"].(float64) != 3 {
		t.Errorf("root = %v", root)
	}
	_, docs, _ := e.call("GET", base+"/children?path=docs&sort=name&dir=desc&limit=2", "alice", nil)
	if names(docs) != "readme.txt,file10.txt" || docs["total"].(float64) != 3 {
		t.Errorf("docs page = %v", docs)
	}
	if status, _, _ := e.call("GET", base+"/children?path=nope", "alice", nil); status != http.StatusNotFound {
		t.Errorf("missing folder: %d", status)
	}
	_, found, _ := e.call("GET", base+"/search?q=FILE", "alice", nil)
	if names(found) != "file2.txt,file10.txt" || found["truncated"] != false {
		t.Errorf("search = %v", found)
	}
	if _, _, raw := e.call("GET", base+"/entry?path=docs/readme.txt", "alice", nil); string(raw) != "read me" {
		t.Errorf("preview = %q", raw)
	}

	// a selection: check first (no link), then issue
	status, check, _ := e.call("POST", base+"/downloads", "alice", map[string]any{"paths": []string{"docs", "top.txt"}})
	if status != http.StatusOK || check["url"] != nil || check["files"].(float64) != 4 || check["fileName"] != "big archive-selection.zip" {
		t.Fatalf("check = %d %v", status, check)
	}
	_, issued, _ := e.call("POST", base+"/downloads", "alice", map[string]any{"paths": []string{"docs", "top.txt"}, "issue": true})
	url := issued["url"].(string)

	// the download route needs no login; a forged user header changes nothing
	request, _ := http.NewRequest("GET", e.server.URL+url, nil)
	request.Header.Set("X-Remote-User", "mallory")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != http.StatusOK || int64(len(data)) != int64(issued["size"].(float64)) ||
		response.Header.Get("Content-Length") != fmt.Sprint(len(data)) {
		t.Fatalf("download: %d, %d bytes, length header %s", response.StatusCode, len(data), response.Header.Get("Content-Length"))
	}
	if !strings.Contains(response.Header.Get("Content-Disposition"), `filename*=UTF-8''big%20archive-selection.zip`) {
		t.Errorf("disposition = %s", response.Header.Get("Content-Disposition"))
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, f := range zr.File {
		rc, _ := f.Open()
		body, _ := io.ReadAll(rc)
		rc.Close()
		got[f.Name] = string(body)
	}
	if len(got) != 4 || got["docs/file10.txt"] != "ten" || got["top.txt"] != "top level" {
		t.Errorf("zip contents = %v", got)
	}

	// single use
	if status, body, _ := e.call("GET", url, "", nil); status != http.StatusGone || body["code"] != "link-expired" {
		t.Errorf("reused link: %d %v", status, body)
	}

	// one file is sent as-is
	_, single, _ := e.call("POST", base+"/downloads", "alice", map[string]any{"paths": []string{"photos/a.jpg"}, "issue": true})
	if _, _, raw := e.call("GET", single["url"].(string), "", nil); len(raw) != 3000 {
		t.Errorf("single file: %d bytes", len(raw))
	}

	if status, _, _ := e.call("DELETE", base, "alice", nil); status != http.StatusNoContent {
		t.Errorf("close: %d", status)
	}
	if status, _, _ := e.call("GET", base, "alice", nil); status != http.StatusNotFound {
		t.Errorf("after close: %d", status)
	}
}

func TestAccessRules(t *testing.T) {
	e := newEnv(t, nil)
	id := e.openReady("alice")
	base := "/archive-api/sessions/" + id
	for _, path := range []string{"/archive-api/health", base, base + "/children?path="} {
		if status, _, _ := e.call("GET", path, "", nil); status != http.StatusUnauthorized {
			t.Errorf("%s without user: %d", path, status)
		}
	}
	for _, request := range [][2]string{{"GET", base}, {"GET", base + "/children?path="}, {"DELETE", base}, {"POST", base + "/heartbeat"}} {
		if status, body, _ := e.call(request[0], request[1], "mallory", nil); status != http.StatusNotFound || body["code"] != "session-not-found" {
			t.Errorf("%s %s as another user: %d %v", request[0], request[1], status, body)
		}
	}
	if status, body, _ := e.call("POST", "/archive-api/sessions", "alice", map[string]string{"webDavPath": "/spaces/x/../etc"}); status != http.StatusBadRequest || body["code"] != "invalid-path" {
		t.Errorf("bad path: %d %v", status, body)
	}
	if status, _, _ := e.call("GET", "/archive-api/download/not-a-ticket", "", nil); status != http.StatusGone {
		t.Errorf("unknown ticket: %d", status)
	}
}

func TestCapsAreReported(t *testing.T) {
	e := newEnv(t, func(c *config.Config) {
		c.MaxDownloadSize = 100
		c.MaxSelectionSize = 1000
		c.ConfirmDownloadSize = 10
		c.MaxDownloadsPerUser = 1
		c.MaxStoragePerUser = 1 << 20
	})
	id := e.openReady("alice")
	base := "/archive-api/sessions/" + id

	status, body, _ := e.call("POST", base+"/downloads", "alice", map[string]any{"paths": []string{"photos/a.jpg"}})
	if status != http.StatusRequestEntityTooLarge || body["code"] != "download-too-large" || body["size"].(float64) != 3000 || body["limit"].(float64) != 100 {
		t.Errorf("file cap: %d %v", status, body)
	}
	status, body, _ = e.call("POST", base+"/downloads", "alice", map[string]any{"paths": []string{""}})
	if status != http.StatusRequestEntityTooLarge || body["limit"].(float64) != 1000 {
		t.Errorf("selection cap: %d %v", status, body)
	}
	_, body, _ = e.call("POST", base+"/downloads", "alice", map[string]any{"paths": []string{"docs/readme.txt"}, "issue": true})
	if body["confirm"] != false {
		t.Errorf("7 bytes need no confirmation: %v", body)
	}
	status, body, _ = e.call("POST", base+"/downloads", "alice", map[string]any{"paths": []string{"docs"}, "issue": true})
	if status != http.StatusTooManyRequests || body["code"] != "too-many-downloads" {
		t.Errorf("second download at once: %d %v", status, body)
	}
	// a second copy still fits in alice's 1 MiB storage cap
	status, body, _ = e.call("POST", "/archive-api/sessions", "alice", map[string]string{"webDavPath": filePath})
	if status != http.StatusAccepted {
		t.Fatalf("second open within the cap: %d %v", status, body)
	}
}

func TestStorageCapMessages(t *testing.T) {
	size := int64(len(buildArchive(t)))
	e := newEnv(t, func(c *config.Config) {
		c.MaxStorage = 2*size - 1
		c.MaxStoragePerUser = size
	})
	e.openReady("alice")
	status, body, _ := e.call("POST", "/archive-api/sessions", "alice", map[string]string{"webDavPath": filePath})
	if status != http.StatusInsufficientStorage || body["code"] != "user-quota" {
		t.Errorf("alice again: %d %v", status, body)
	}
	status, body, _ = e.call("POST", "/archive-api/sessions", "bob", map[string]string{"webDavPath": filePath})
	if status != http.StatusInsufficientStorage || body["code"] != "server-busy" {
		t.Errorf("bob: %d %v", status, body)
	}

	small := newEnv(t, func(c *config.Config) { c.MaxStoragePerUser = size - 1 })
	status, body, _ = small.call("POST", "/archive-api/sessions", "alice", map[string]string{"webDavPath": filePath})
	if status != http.StatusRequestEntityTooLarge || body["code"] != "archive-too-large" || body["limit"].(float64) != float64(size-1) {
		t.Errorf("archive over the cap: %d %v", status, body)
	}
}

func TestHealth(t *testing.T) {
	e := newEnv(t, nil)
	status, body, _ := e.call("GET", "/archive-api/health", "alice", nil)
	if status != http.StatusOK || body["version"] != Version || body["confirmDownloadSize"].(float64) != 1e9 || body["heartbeatSeconds"].(float64) != 30 {
		t.Errorf("health = %d %v", status, body)
	}
	features, _ := body["features"].([]any)
	if body["ready"] != true || len(body["problems"].([]any)) != 0 || len(features) != len(Features) || features[1] != "format:7z" {
		t.Errorf("health readiness/features = %v %v %v", body["ready"], body["problems"], features)
	}
}

func TestHealthNotReady(t *testing.T) {
	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()
	e := newEnv(t, func(c *config.Config) { c.OpenCloudURL = closed.URL })
	if err := os.Chmod(e.cfg.DataDir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chmod(e.cfg.DataDir, 0o700) })
	_, body, _ := e.call("GET", "/archive-api/health", "alice", nil)
	problems := fmt.Sprint(body["problems"])
	if body["ready"] != false || !strings.Contains(problems, problemTempNotWritable) || !strings.Contains(problems, problemOpenCloudUnreachable) {
		t.Errorf("health = %v %v", body["ready"], body["problems"])
	}
}

func TestReadinessNeedsOpenCloudStatus(t *testing.T) {
	answers := map[string]func(http.ResponseWriter){
		"404 (another server)": func(w http.ResponseWriter) { http.NotFound(w, nil) },
		"200 without status":   func(w http.ResponseWriter) { fmt.Fprint(w, "<html>hello</html>") },
		"not installed":        func(w http.ResponseWriter) { fmt.Fprint(w, `{"installed":false}`) },
		"503 (starting)":       func(w http.ResponseWriter) { w.WriteHeader(http.StatusServiceUnavailable) },
	}
	for name, answer := range answers {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { answer(w) }))
		r := newReadiness(t.TempDir(), server.URL)
		if p := r.Problems(context.Background()); len(p) != 1 || p[0] != problemOpenCloudUnreachable {
			t.Errorf("%s: problems = %v, want opencloud-unreachable", name, p)
		}
		server.Close()
	}
}

func TestReadinessDoesNotCacheACanceledCheck(t *testing.T) {
	healthy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `{"installed":true}`)
	}))
	t.Cleanup(healthy.Close)
	r := newReadiness(t.TempDir(), healthy.URL)
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if p := r.Problems(canceled); len(p) != 1 {
		t.Fatalf("a canceled check can't reach OpenCloud, got %v", p)
	}
	if p := r.Problems(context.Background()); len(p) != 0 {
		t.Errorf("the next check must run again instead of using the canceled result, got %v", p)
	}
}

func TestReadinessIsCached(t *testing.T) {
	dir := t.TempDir()
	r := newReadiness(dir, "http://127.0.0.1:1")
	now := time.Unix(1_700_000_000, 0)
	r.now = func() time.Time { return now }
	if p := r.Problems(context.Background()); len(p) != 1 || p[0] != problemOpenCloudUnreachable {
		t.Fatalf("first check = %v", p)
	}
	os.Chmod(dir, 0o500)
	t.Cleanup(func() { os.Chmod(dir, 0o700) })
	if p := r.Problems(context.Background()); len(p) != 1 {
		t.Errorf("within the TTL the cached result is used, got %v", p)
	}
	now = now.Add(readinessTTL)
	if p := r.Problems(context.Background()); len(p) != 2 {
		t.Errorf("after the TTL the checks run again, got %v", p)
	}
}

func TestContentDisposition(t *testing.T) {
	got := contentDisposition(`naïve "quote".zip`)
	if !strings.HasPrefix(got, `attachment; filename="na_ve _quote_.zip"`) || !strings.HasSuffix(got, `filename*=UTF-8''na%C3%AFve%20%22quote%22.zip`) {
		t.Errorf("contentDisposition = %s", got)
	}
}
