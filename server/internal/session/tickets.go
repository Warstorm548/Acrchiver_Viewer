package session

import (
	"errors"
	"strings"
	"time"

	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/archive"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/zipstream"
)

// TicketLifetime: a download link must be used this soon after it was issued.
const TicketLifetime = 60 * time.Second

var (
	ErrNothingToDownload = errors.New("the selection contains no readable files")
	ErrTooManyDownloads  = errors.New("too many downloads at once")
	ErrTicketInvalid     = errors.New("download link expired or already used")
)

// DownloadLimits are the caps checked before a download starts (13a and 13c).
type DownloadLimits struct {
	MaxFile      int64
	MaxSelection int64
	MaxPerUser   int
}

// TooLargeError reports a download over its cap, with both sizes for the message.
type TooLargeError struct{ Size, Limit int64 }

func (e *TooLargeError) Error() string { return "download is larger than allowed" }

// Download is a prepared download: one file as-is, or several as a ZIP.
type Download struct {
	FileName string
	// Size is the exact number of bytes sent; ContentSize the files' own total.
	Size        int64
	ContentSize int64
	Files       []*archive.Entry
	// ZipFiles is set for a ZIP (same order as Files).
	ZipFiles []zipstream.File
}

// PrepareDownload expands folders, drops unreadable entries and checks the caps.
func PrepareDownload(a *archive.Archive, archiveName string, paths []string, limits DownloadLimits) (*Download, error) {
	seen := map[string]bool{}
	var files []*archive.Entry
	for _, path := range paths {
		var covered []*archive.Entry
		if entry := a.Index.Get(path); entry != nil && !entry.IsDir {
			covered = []*archive.Entry{entry}
		} else if a.Index.IsFolder(path) { // "" is the whole archive
			covered = a.Index.FilesBelow(path)
		}
		for _, file := range covered {
			if !file.IsDir && file.Supported && !seen[file.Path] {
				seen[file.Path] = true
				files = append(files, file)
			}
		}
	}
	if len(files) == 0 {
		return nil, ErrNothingToDownload
	}
	archive.SortForExtract(files)
	d := &Download{Files: files}
	for _, file := range files {
		d.ContentSize += file.Size
	}
	if len(files) == 1 {
		if d.ContentSize > limits.MaxFile {
			return nil, &TooLargeError{Size: d.ContentSize, Limit: limits.MaxFile}
		}
		d.FileName = zipstream.SanitizeFileName(files[0].Name)
		d.Size = d.ContentSize
		return d, nil
	}
	if d.ContentSize > limits.MaxSelection {
		return nil, &TooLargeError{Size: d.ContentSize, Limit: limits.MaxSelection}
	}
	paths = make([]string, len(files))
	for i, file := range files {
		paths[i] = file.Path
	}
	for i, name := range zipstream.Names(paths) {
		d.ZipFiles = append(d.ZipFiles, zipstream.File{
			Name: name, Size: files[i].Size, Modified: time.UnixMilli(files[i].Modified),
		})
	}
	d.Size = zipstream.Size(d.ZipFiles)
	d.FileName = zipstream.SanitizeFileName(selectionBaseName(archiveName) + "-selection.zip")
	return d, nil
}

// selectionBaseName is the archive name without its extension (as in the browser).
func selectionBaseName(archiveName string) string {
	if extension := archive.Extension(archiveName); extension != "" {
		return strings.TrimSuffix(archiveName, archiveName[len(archiveName)-len(extension)-1:])
	}
	return archiveName
}

// Ticket is a single-use download link for a prepared download. It holds the archive's temp file
// from issue to the end of the download, so closing the viewer right after clicking "Download"
// doesn't break the link.
type Ticket struct {
	ID       string
	Owner    string
	Archive  *archive.Archive
	Download *Download
	expires  time.Time
	release  func()
}

// IssueTicket counts the download against the user's limit until it finishes or the ticket
// expires unused.
func (m *Manager) IssueTicket(s *Session, d *Download, maxPerUser int) (*Ticket, error) {
	a, release, err := s.Acquire()
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.downloads[s.Owner] >= maxPerUser {
		release()
		return nil, ErrTooManyDownloads
	}
	t := &Ticket{
		ID: randomID(), Owner: s.Owner, Archive: a, Download: d,
		expires: m.now().Add(TicketLifetime), release: release,
	}
	m.tickets[t.ID] = t
	m.downloads[s.Owner]++
	return t, nil
}

// Redeem returns the ticket's download once; done must be called when the download ends.
func (m *Manager) Redeem(id string) (t *Ticket, done func(), err error) {
	m.mu.Lock()
	t, ok := m.tickets[id]
	if ok {
		delete(m.tickets, id)
	}
	m.mu.Unlock()
	if !ok {
		return nil, nil, ErrTicketInvalid
	}
	if m.now().After(t.expires) {
		m.endTicket(t)
		return nil, nil, ErrTicketInvalid
	}
	return t, func() { m.endTicket(t) }, nil
}

// endTicket frees what a ticket held: its count against the user's limit and the temp file.
func (m *Manager) endTicket(t *Ticket) {
	m.mu.Lock()
	m.countDown(t.Owner)
	m.mu.Unlock()
	t.release()
}

// countDown must be called with m.mu held.
func (m *Manager) countDown(owner string) {
	if m.downloads[owner]--; m.downloads[owner] <= 0 {
		delete(m.downloads, owner)
	}
}
