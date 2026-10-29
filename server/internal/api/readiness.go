package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/session"
)

const (
	// readinessTTL: /health is asked once per opened archive; the checks run at most this often.
	readinessTTL = 30 * time.Second
	// readinessTimeout keeps /health well under the viewer's 5 s limit.
	readinessTimeout = 3 * time.Second
)

// Problem codes /health reports when the helper is running but can't do its job.
const (
	problemTempNotWritable      = "temp-not-writable"
	problemOpenCloudUnreachable = "opencloud-unreachable"
)

// readiness checks what the helper needs at runtime (the temp folder, OpenCloud), so the viewer
// can stay in browser mode when the helper is set up wrong. Results are cached for readinessTTL.
type readiness struct {
	dataDir      string
	openCloudURL string
	client       *http.Client
	now          func() time.Time

	mu       sync.Mutex
	checked  time.Time
	problems []string
}

func newReadiness(dataDir, openCloudURL string) *readiness {
	return &readiness{
		dataDir:      dataDir,
		openCloudURL: openCloudURL,
		client:       &http.Client{Timeout: readinessTimeout},
		now:          time.Now,
	}
}

// Problems returns the codes of the failed checks; empty when the helper is ready.
func (r *readiness) Problems(ctx context.Context) []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.checked.IsZero() && r.now().Sub(r.checked) < readinessTTL {
		return r.problems
	}
	problems := []string{}
	if err := session.CheckWritable(r.dataDir); err != nil {
		problems = append(problems, problemTempNotWritable)
	}
	if !r.openCloudReachable(ctx) {
		problems = append(problems, problemOpenCloudUnreachable)
	}
	// a /health caller that gave up mid-check proves nothing about OpenCloud: answer it, but let
	// the next request check again instead of caching a false "unreachable"
	if ctx.Err() != nil {
		return problems
	}
	r.problems, r.checked = problems, r.now()
	return problems
}

// openCloudReachable: OpenCloud's status.php must answer 200 with its status JSON
// (`"installed": true`, `"productname": "OpenCloud"`). A failed connection, an error status or
// another server's answer (a wrong ARCHIVE_HELPER_OPENCLOUD_URL, also a Nextcloud or ownCloud
// with the same status.php, OpenCloud down or still starting) count as unreachable.
func (r *readiness) openCloudReachable(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, readinessTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, r.openCloudURL+"/status.php", nil)
	if err != nil {
		return false
	}
	response, err := r.client.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return false
	}
	var status struct {
		Installed   bool   `json:"installed"`
		ProductName string `json:"productname"`
	}
	return json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&status) == nil &&
		status.Installed && strings.EqualFold(status.ProductName, "OpenCloud")
}
