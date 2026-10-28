// Package session keeps the archives users have open: each session copies an archive from
// OpenCloud into the temp folder (within a storage reservation), lists it, serves reads, and
// deletes everything when it is closed or times out.
package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/archive"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/opencloud"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/storage"
)

type State string

const (
	Copying  State = "copying"
	Scanning State = "scanning"
	Ready    State = "ready"
	Failed   State = "error"
)

// Error codes of a failed session, shown to the viewer (which translates them).
const (
	CodeUnsupported = "unsupported-format"
	CodeCorrupt     = "corrupt"
	CodeTooComplex  = "too-complex"
	CodeEncrypted   = "encrypted"
	CodeChanged     = "changed"
	CodeDownload    = "download-failed"
	CodeStorage     = "storage-error"
)

var (
	ErrNotFound = errors.New("session not found")
	ErrNotReady = errors.New("archive is not ready")
)

// filePrefix marks the helper's temp files: startup cleanup deletes only files named like this.
const filePrefix = "ah-"

type Config struct {
	Dir         string
	Timeout     time.Duration
	Limits      archive.Limits
	ScanTimeout time.Duration
}

type Session struct {
	ID    string
	Owner string
	Name  string
	Size  int64

	copied  atomic.Int64
	scanned atomic.Int64

	mu          sync.Mutex
	state       State
	code        string
	archive     *archive.Archive
	lastSeen    time.Time
	closed      bool
	jobDone     bool
	readers     int
	cleaned     bool
	cancel      context.CancelFunc
	reservation *storage.Reservation
	path        string
}

// Status is what the viewer polls while an archive is being prepared.
type Status struct {
	ID      string `json:"id"`
	State   State  `json:"state"`
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Copied  int64  `json:"copied"`
	Scanned int64  `json:"scanned"`
	Entries int    `json:"entries"`
	Error   string `json:"error,omitempty"`
}

func (s *Session) Status() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	status := Status{
		ID: s.ID, State: s.state, Name: s.Name, Size: s.Size,
		Copied: s.copied.Load(), Scanned: s.scanned.Load(), Error: s.code,
	}
	if s.archive != nil {
		status.Entries = s.archive.Index.Len()
	}
	return status
}

// Archive returns the listing, or ErrNotReady while copying/scanning or after a failure.
func (s *Session) Archive() (*archive.Archive, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state != Ready || s.closed {
		return nil, ErrNotReady
	}
	return s.archive, nil
}

// Acquire keeps the temp file while a download or preview reads it, even if the session is
// closed meanwhile (e.g. the tab is closed while a download continues); call release when done.
func (s *Session) Acquire() (a *archive.Archive, release func(), err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state != Ready || s.closed {
		return nil, nil, ErrNotReady
	}
	s.readers++
	var once sync.Once
	return s.archive, func() {
		once.Do(func() {
			s.mu.Lock()
			s.readers--
			s.mu.Unlock()
			s.cleanupIfIdle()
		})
	}, nil
}

// cleanupIfIdle deletes the temp file and frees the reservation once the session is closed, its
// job has stopped and no reader is left.
func (s *Session) cleanupIfIdle() {
	s.mu.Lock()
	if !s.closed || !s.jobDone || s.readers > 0 || s.cleaned {
		s.mu.Unlock()
		return
	}
	s.cleaned = true
	path := s.path
	s.mu.Unlock()
	removeFiles(path)
	s.reservation.Release()
}

func removeFiles(path string) {
	for _, file := range []string{path + ".part", path + ".archive"} {
		if err := os.Remove(file); err != nil && !errors.Is(err, os.ErrNotExist) {
			slog.Error("removing temp file failed", "file", filepath.Base(file), "error", err)
		}
	}
}

type Manager struct {
	cfg       Config
	ledger    *storage.Ledger
	openCloud *opencloud.Client
	now       func() time.Time

	// jobs counts running copy/scan jobs, so CloseAll can wait for them
	jobs sync.WaitGroup

	mu       sync.Mutex
	sessions map[string]*Session
	tickets  map[string]*Ticket
	// downloads counts each user's issued tickets plus running downloads
	downloads map[string]int
}

func NewManager(cfg Config, ledger *storage.Ledger, openCloud *opencloud.Client) *Manager {
	return &Manager{
		cfg: cfg, ledger: ledger, openCloud: openCloud, now: time.Now,
		sessions: map[string]*Session{}, tickets: map[string]*Ticket{}, downloads: map[string]int{},
	}
}

func randomID() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand never fails on Linux
	}
	return hex.EncodeToString(b)
}

// Open checks the file on OpenCloud as the user, reserves its size, and starts copying and
// listing it in the background. authorization is the user's own header, used for this copy only.
func (m *Manager) Open(ctx context.Context, owner, authorization, webDavPath string) (*Session, error) {
	info, err := m.openCloud.Stat(ctx, authorization, webDavPath)
	if err != nil {
		return nil, err
	}
	reservation, err := m.ledger.Reserve(owner, info.Size)
	if err != nil {
		return nil, err
	}
	id := randomID()
	jobCtx, cancel := context.WithCancel(context.Background())
	s := &Session{
		ID: id, Owner: owner, Name: info.Name, Size: info.Size,
		state: Copying, lastSeen: m.now(), cancel: cancel, reservation: reservation,
		path: filepath.Join(m.cfg.Dir, filePrefix+id[:32]),
	}
	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()
	slog.Info("archive opened", "session", id[:8], "user", owner, "size", info.Size)
	m.jobs.Add(1)
	go func() {
		defer m.jobs.Done()
		m.run(jobCtx, s, authorization, webDavPath, info.ETag)
	}()
	return s, nil
}

// reservedWriter counts every write against the reservation (the hard stop).
type reservedWriter struct {
	file        *os.File
	reservation *storage.Reservation
	written     *atomic.Int64
}

func (w reservedWriter) Write(p []byte) (int, error) {
	if err := w.reservation.Write(int64(len(p))); err != nil {
		return 0, err
	}
	n, err := w.file.Write(p)
	w.written.Add(int64(n))
	return n, err
}

func (m *Manager) run(ctx context.Context, s *Session, authorization, webDavPath, etag string) {
	defer func() {
		s.mu.Lock()
		s.jobDone = true
		s.mu.Unlock()
		s.cleanupIfIdle()
	}()
	a, err := m.copyAndScan(ctx, s, authorization, webDavPath, etag)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	if err != nil {
		// nothing will read it any more: free the space before reporting the failure, and keep
		// the session so the viewer can still fetch its status
		removeFiles(s.path)
		s.reservation.Release()
		s.state = Failed
		s.code = codeFor(err)
		slog.Warn("archive failed", "session", s.ID[:8], "code", s.code, "error", err)
		return
	}
	s.archive = a
	s.state = Ready
	slog.Info("archive ready", "session", s.ID[:8], "format", a.Format, "entries", a.Index.Len())
}

func (m *Manager) copyAndScan(ctx context.Context, s *Session, authorization, webDavPath, etag string) (*archive.Archive, error) {
	body, err := m.openCloud.Download(ctx, authorization, webDavPath, etag)
	if err != nil {
		return nil, err
	}
	defer body.Close()
	part := s.path + ".part"
	file, err := os.OpenFile(part, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", errStorage, err)
	}
	_, copyErr := io.Copy(reservedWriter{file, s.reservation, &s.copied}, body)
	closeErr := file.Close()
	switch {
	case errors.Is(copyErr, storage.ErrOverReservation):
		return nil, fmt.Errorf("%w: more data than OpenCloud reported", opencloud.ErrChanged)
	case copyErr != nil && ctx.Err() == nil && isWriteError(copyErr):
		return nil, fmt.Errorf("%w: %v", errStorage, copyErr)
	case copyErr != nil:
		return nil, copyErr
	case closeErr != nil:
		return nil, fmt.Errorf("%w: %v", errStorage, closeErr)
	case s.copied.Load() != s.Size:
		return nil, fmt.Errorf("%w: got %d of %d bytes", opencloud.ErrChanged, s.copied.Load(), s.Size)
	}
	if err := os.Rename(part, s.path+".archive"); err != nil {
		return nil, fmt.Errorf("%w: %v", errStorage, err)
	}
	s.mu.Lock()
	s.state = Scanning
	s.mu.Unlock()
	scanCtx, cancel := context.WithTimeout(ctx, m.cfg.ScanTimeout)
	defer cancel()
	a, err := archive.Scan(scanCtx, s.path+".archive", s.Name, m.cfg.Limits, &s.scanned)
	if errors.Is(err, context.DeadlineExceeded) {
		return nil, fmt.Errorf("%w: listing took longer than %v", archive.ErrTooComplex, m.cfg.ScanTimeout)
	}
	return a, err
}

var errStorage = errors.New("temp storage error")

// isWriteError: io.Copy reports write failures as *os.PathError from the temp file.
func isWriteError(err error) bool {
	var pathErr *os.PathError
	return errors.As(err, &pathErr)
}

func codeFor(err error) string {
	switch {
	case errors.Is(err, archive.ErrUnsupported):
		return CodeUnsupported
	case errors.Is(err, archive.ErrTooComplex):
		return CodeTooComplex
	case errors.Is(err, archive.ErrEncrypted):
		return CodeEncrypted
	case errors.Is(err, archive.ErrCorrupt):
		return CodeCorrupt
	case errors.Is(err, opencloud.ErrChanged):
		return CodeChanged
	case errors.Is(err, errStorage):
		return CodeStorage
	}
	return CodeDownload
}

// Get returns the user's session and marks it as seen. Another user's session is reported as
// not found, so session IDs reveal nothing.
func (m *Manager) Get(id, owner string) (*Session, error) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	m.mu.Unlock()
	if !ok || s.Owner != owner {
		return nil, ErrNotFound
	}
	s.mu.Lock()
	s.lastSeen = m.now()
	s.mu.Unlock()
	return s, nil
}

// Close ends the user's session: the job stops, and the temp file is deleted once no download
// is reading it.
func (m *Manager) Close(id, owner string) error {
	m.mu.Lock()
	s, ok := m.sessions[id]
	if !ok || s.Owner != owner {
		m.mu.Unlock()
		return ErrNotFound
	}
	delete(m.sessions, id)
	m.mu.Unlock()
	m.close(s)
	return nil
}

func (m *Manager) close(s *Session) {
	s.mu.Lock()
	s.closed = true
	s.mu.Unlock()
	s.cancel()
	s.cleanupIfIdle()
	slog.Info("archive closed", "session", s.ID[:8])
}

// Sweep closes sessions not seen within the timeout, and drops expired tickets.
func (m *Manager) Sweep() {
	now := m.now()
	var expired []*Session
	m.mu.Lock()
	for id, s := range m.sessions {
		s.mu.Lock()
		idle := now.Sub(s.lastSeen) > m.cfg.Timeout
		s.mu.Unlock()
		if idle {
			delete(m.sessions, id)
			expired = append(expired, s)
		}
	}
	var unused []*Ticket
	for id, t := range m.tickets {
		if now.After(t.expires) {
			delete(m.tickets, id)
			m.countDown(t.Owner)
			unused = append(unused, t)
		}
	}
	m.mu.Unlock()
	for _, t := range unused {
		t.release()
	}
	for _, s := range expired {
		m.close(s)
	}
}

// CloseAll ends every session and waits for their jobs to stop (on shutdown), so no job writes
// a temp file after the final cleanup.
func (m *Manager) CloseAll() {
	m.mu.Lock()
	all := m.sessions
	m.sessions = map[string]*Session{}
	m.mu.Unlock()
	for _, s := range all {
		m.close(s)
	}
	m.jobs.Wait()
}

// RemoveOrphans deletes temp files left by an earlier run. Only files named like the helper's
// own are touched, so a temp folder pointed somewhere wrong by mistake isn't emptied.
func RemoveOrphans(dir string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, err
	}
	removed := 0
	for _, entry := range entries {
		name := entry.Name()
		if !entry.Type().IsRegular() || !strings.HasPrefix(name, filePrefix) ||
			!(strings.HasSuffix(name, ".part") || strings.HasSuffix(name, ".archive")) {
			continue
		}
		if err := os.Remove(filepath.Join(dir, name)); err == nil {
			removed++
		}
	}
	return removed, nil
}

// CheckWritable fails with a hint when the temp folder is missing or not writable by this user.
func CheckWritable(dir string) error {
	probe := filepath.Join(dir, filePrefix+"probe-"+randomID()[:8])
	file, err := os.OpenFile(probe, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("temp folder %s is not writable by uid %d / gid %d (%v); on the host run: "+
			"sudo chown -R <ARCHIVE_HELPER_UID_GID> <ARCHIVE_HELPER_TEMP_DIR>", dir, os.Getuid(), os.Getgid(), err)
	}
	file.Close()
	return os.Remove(probe)
}
