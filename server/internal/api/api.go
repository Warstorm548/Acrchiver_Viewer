// Package api is the helper's HTTP interface, reached through the OpenCloud proxy:
// /archive-api/download/ is unprotected (single-use tickets), everything else requires login and
// identifies the user by the X-Remote-User header the proxy sets.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/archive"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/config"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/opencloud"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/session"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/storage"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/zipstream"
)

// Version of the helper; kept equal to the viewer's package.json version.
const Version = "0.4.1"

const (
	// HeartbeatInterval tells the viewer how often to report that the archive is still open.
	HeartbeatInterval = 30 * time.Second
	// MaxPreviewSize caps what /entry returns (the viewer previews up to 10 MiB).
	MaxPreviewSize = 16 << 20
	maxPageSize    = 5000
	maxRequestBody = 4 << 20
	prefix         = "/archive-api"
)

type Server struct {
	cfg      config.Config
	sessions *session.Manager
}

func New(cfg config.Config, sessions *session.Manager) *Server {
	return &Server{cfg: cfg, sessions: sessions}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET "+prefix+"/download/{ticket}", s.download)
	mux.HandleFunc("GET "+prefix+"/health", s.user(s.health))
	mux.HandleFunc("POST "+prefix+"/sessions", s.user(s.open))
	mux.HandleFunc("GET "+prefix+"/sessions/{id}", s.user(s.status))
	mux.HandleFunc("POST "+prefix+"/sessions/{id}/heartbeat", s.user(s.heartbeat))
	mux.HandleFunc("DELETE "+prefix+"/sessions/{id}", s.user(s.close))
	mux.HandleFunc("GET "+prefix+"/sessions/{id}/children", s.user(s.children))
	mux.HandleFunc("GET "+prefix+"/sessions/{id}/search", s.user(s.search))
	mux.HandleFunc("GET "+prefix+"/sessions/{id}/entry", s.user(s.entry))
	mux.HandleFunc("POST "+prefix+"/sessions/{id}/downloads", s.user(s.prepareDownload))
	return securityHeaders(mux)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

type handler func(w http.ResponseWriter, r *http.Request, user string)

// user requires the user ID set by the proxy. Requests without it never came through a protected
// proxy route (the route config is wrong), so they are refused.
func (s *Server) user(next handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := r.Header.Get("X-Remote-User")
		if user == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized", "login required")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBody)
		next(w, r, user)
	}
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Size    int64  `json:"size,omitempty"`
	Limit   int64  `json:"limit,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, apiError{Code: code, Message: message})
}

// writeFailure maps known errors to status codes and stable codes the viewer translates.
func (s *Server) writeFailure(w http.ResponseWriter, err error) {
	var tooLarge *session.TooLargeError
	switch {
	case errors.As(err, &tooLarge):
		writeJSON(w, http.StatusRequestEntityTooLarge, apiError{
			Code: "download-too-large", Message: err.Error(), Size: tooLarge.Size, Limit: tooLarge.Limit,
		})
	case errors.Is(err, storage.ErrArchiveTooLarge):
		writeJSON(w, http.StatusRequestEntityTooLarge, apiError{
			Code: "archive-too-large", Message: err.Error(), Limit: min(s.cfg.MaxStorage, s.cfg.MaxStoragePerUser),
		})
	case errors.Is(err, storage.ErrUserQuota):
		writeError(w, http.StatusInsufficientStorage, "user-quota", err.Error())
	case errors.Is(err, storage.ErrServerBusy):
		writeError(w, http.StatusInsufficientStorage, "server-busy", err.Error())
	case errors.Is(err, session.ErrTooManyDownloads):
		writeError(w, http.StatusTooManyRequests, "too-many-downloads", err.Error())
	case errors.Is(err, session.ErrNothingToDownload):
		writeError(w, http.StatusBadRequest, "nothing-to-download", err.Error())
	case errors.Is(err, session.ErrNotFound):
		writeError(w, http.StatusNotFound, "session-not-found", err.Error())
	case errors.Is(err, session.ErrNotReady):
		writeError(w, http.StatusConflict, "not-ready", err.Error())
	case errors.Is(err, opencloud.ErrInvalidPath):
		writeError(w, http.StatusBadRequest, "invalid-path", err.Error())
	case errors.Is(err, opencloud.ErrNotFound):
		writeError(w, http.StatusNotFound, "file-not-found", err.Error())
	case errors.Is(err, opencloud.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", err.Error())
	default:
		slog.Error("request failed", "error", err)
		writeError(w, http.StatusBadGateway, "helper-error", "the archive helper could not complete the request")
	}
}

func (s *Server) health(w http.ResponseWriter, r *http.Request, user string) {
	writeJSON(w, http.StatusOK, map[string]any{
		"version":               Version,
		"maxStorage":            s.cfg.MaxStorage,
		"maxStoragePerUser":     s.cfg.MaxStoragePerUser,
		"maxDownloadSize":       s.cfg.MaxDownloadSize,
		"maxSelectionSize":      s.cfg.MaxSelectionSize,
		"confirmDownloadSize":   s.cfg.ConfirmDownloadSize,
		"maxDownloadsPerUser":   s.cfg.MaxDownloadsPerUser,
		"maxPreviewSize":        MaxPreviewSize,
		"heartbeatSeconds":      int(HeartbeatInterval.Seconds()),
		"sessionTimeoutSeconds": int(s.cfg.SessionTimeout.Seconds()),
	})
}

func (s *Server) open(w http.ResponseWriter, r *http.Request, user string) {
	var body struct {
		WebDavPath string `json:"webDavPath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.WebDavPath == "" {
		writeError(w, http.StatusBadRequest, "bad-request", "expected {\"webDavPath\": \"/spaces/…\"}")
		return
	}
	authorization := r.Header.Get("Authorization")
	if authorization == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	opened, err := s.sessions.Open(r.Context(), user, authorization, body.WebDavPath)
	if err != nil {
		s.writeFailure(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, opened.Status())
}

func (s *Server) session(w http.ResponseWriter, r *http.Request, user string) (*session.Session, bool) {
	found, err := s.sessions.Get(r.PathValue("id"), user)
	if err != nil {
		s.writeFailure(w, err)
		return nil, false
	}
	return found, true
}

func (s *Server) status(w http.ResponseWriter, r *http.Request, user string) {
	if found, ok := s.session(w, r, user); ok {
		writeJSON(w, http.StatusOK, found.Status())
	}
}

func (s *Server) heartbeat(w http.ResponseWriter, r *http.Request, user string) {
	if _, ok := s.session(w, r, user); ok {
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) close(w http.ResponseWriter, r *http.Request, user string) {
	if err := s.sessions.Close(r.PathValue("id"), user); err != nil {
		s.writeFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) readyArchive(w http.ResponseWriter, r *http.Request, user string) (*session.Session, *archive.Archive, bool) {
	found, ok := s.session(w, r, user)
	if !ok {
		return nil, nil, false
	}
	a, err := found.Archive()
	if err != nil {
		s.writeFailure(w, err)
		return nil, nil, false
	}
	return found, a, true
}

func intParam(r *http.Request, name string, fallback, max int) int {
	value, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil || value < 0 {
		return fallback
	}
	if max > 0 && value > max {
		return max
	}
	return value
}

func (s *Server) children(w http.ResponseWriter, r *http.Request, user string) {
	_, a, ok := s.readyArchive(w, r, user)
	if !ok {
		return
	}
	query := r.URL.Query()
	folder := query.Get("path")
	if !a.Index.IsFolder(folder) {
		writeError(w, http.StatusNotFound, "folder-not-found", "no such folder in the archive")
		return
	}
	field := archive.SortField(query.Get("sort"))
	if field != archive.SortSize && field != archive.SortModified {
		field = archive.SortName
	}
	offset := intParam(r, "offset", 0, 0)
	entries, total := a.Index.Children(folder, field, query.Get("dir") == "desc", offset, intParam(r, "limit", 500, maxPageSize))
	writeJSON(w, http.StatusOK, map[string]any{"entries": nonNil(entries), "total": total, "offset": offset})
}

func nonNil(entries []*archive.Entry) []*archive.Entry {
	if entries == nil {
		return []*archive.Entry{}
	}
	return entries
}

func (s *Server) search(w http.ResponseWriter, r *http.Request, user string) {
	_, a, ok := s.readyArchive(w, r, user)
	if !ok {
		return
	}
	matches, truncated := a.Index.Search(r.URL.Query().Get("q"), intParam(r, "limit", 1000, maxPageSize))
	writeJSON(w, http.StatusOK, map[string]any{"entries": nonNil(matches), "truncated": truncated})
}

// entry returns a small file's content for a preview (the viewer reads it with its token).
func (s *Server) entry(w http.ResponseWriter, r *http.Request, user string) {
	found, ok := s.session(w, r, user)
	if !ok {
		return
	}
	a, release, err := found.Acquire()
	if err != nil {
		s.writeFailure(w, err)
		return
	}
	defer release()
	entry := a.Index.Get(r.URL.Query().Get("path"))
	if entry == nil || entry.IsDir || !entry.Supported {
		writeError(w, http.StatusNotFound, "entry-not-found", "no readable file at this path")
		return
	}
	if entry.Size > MaxPreviewSize {
		writeJSON(w, http.StatusRequestEntityTooLarge, apiError{
			Code: "preview-too-large", Message: "file too large to preview", Size: entry.Size, Limit: MaxPreviewSize,
		})
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(entry.Size, 10))
	err = a.Extract(r.Context(), []*archive.Entry{entry}, func(_ *archive.Entry, data io.Reader) error {
		_, err := io.Copy(w, data)
		return err
	})
	if err != nil {
		// headers are sent: the short body tells the browser the response failed
		slog.Warn("preview failed", "error", err)
	}
}

func (s *Server) downloadLimits() session.DownloadLimits {
	return session.DownloadLimits{
		MaxFile: s.cfg.MaxDownloadSize, MaxSelection: s.cfg.MaxSelectionSize, MaxPerUser: s.cfg.MaxDownloadsPerUser,
	}
}

// prepareDownload checks a selection. With "issue": true it also returns a single-use link;
// without, the viewer can show the size first and ask for confirmation.
func (s *Server) prepareDownload(w http.ResponseWriter, r *http.Request, user string) {
	found, a, ok := s.readyArchive(w, r, user)
	if !ok {
		return
	}
	var body struct {
		Paths []string `json:"paths"`
		Issue bool     `json:"issue"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "bad-request", "expected {\"paths\": […]}")
		return
	}
	d, err := session.PrepareDownload(a, found.Name, body.Paths, s.downloadLimits())
	if err != nil {
		s.writeFailure(w, err)
		return
	}
	result := map[string]any{
		"fileName":    d.FileName,
		"size":        d.Size,
		"contentSize": d.ContentSize,
		"files":       len(d.Files),
		"confirm":     d.Size > s.cfg.ConfirmDownloadSize,
	}
	if body.Issue {
		ticket, err := s.sessions.IssueTicket(found, d, s.cfg.MaxDownloadsPerUser)
		if err != nil {
			s.writeFailure(w, err)
			return
		}
		result["url"] = prefix + "/download/" + ticket.ID
	}
	writeJSON(w, http.StatusOK, result)
}

// contentDisposition names the download, with an ASCII fallback for old clients (RFC 6266).
func contentDisposition(name string) string {
	fallback := strings.Map(func(r rune) rune {
		if r < 0x20 || r > 0x7e || r == '"' || r == '\\' || r == '%' {
			return '_'
		}
		return r
	}, name)
	if value := mime.FormatMediaType("attachment", map[string]string{"filename": fallback}); value != "" {
		return value + "; filename*=UTF-8''" + url.PathEscape(name)
	}
	return "attachment"
}

// download streams a ticket's file or ZIP. The ticket is the only credential: the proxy doesn't
// check login on this route and passes any X-Remote-User a client sends, so that header is ignored.
func (s *Server) download(w http.ResponseWriter, r *http.Request) {
	ticket, done, err := s.sessions.Redeem(r.PathValue("ticket"))
	if err != nil {
		writeError(w, http.StatusGone, "link-expired", err.Error())
		return
	}
	defer done()
	d := ticket.Download
	w.Header().Set("Content-Length", strconv.FormatInt(d.Size, 10))
	w.Header().Set("Content-Disposition", contentDisposition(d.FileName))
	if d.ZipFiles == nil {
		w.Header().Set("Content-Type", "application/octet-stream")
		err = ticket.Archive.Extract(r.Context(), d.Files, func(_ *archive.Entry, data io.Reader) error {
			_, err := io.Copy(w, data)
			return err
		})
	} else {
		w.Header().Set("Content-Type", "application/zip")
		z := zipstream.NewWriter(w, d.ZipFiles)
		err = ticket.Archive.Extract(r.Context(), d.Files, func(_ *archive.Entry, data io.Reader) error {
			return z.Add(data)
		})
		if err == nil {
			err = z.Close()
		}
	}
	if err != nil {
		// the browser sees a short download and reports it as failed
		slog.Warn("download failed", "size", d.Size, "error", fmt.Sprint(err))
	}
}
