// Package opencloud fetches files from OpenCloud over WebDAV as the logged-in user: the user's
// own Authorization header is forwarded, so OpenCloud's permissions decide what may be read.
package opencloud

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode"
)

var (
	ErrInvalidPath = errors.New("invalid WebDAV path")
	ErrNotFound    = errors.New("file not found")
	ErrForbidden   = errors.New("access denied")
	// ErrChanged: the file on OpenCloud changed while it was being copied.
	ErrChanged = errors.New("file changed on the server")
)

type Client struct {
	base string
	http *http.Client
}

func NewClient(base string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	return &Client{base: strings.TrimRight(base, "/"), http: httpClient}
}

type FileInfo struct {
	Name string
	Size int64
	ETag string
}

// davURL turns a viewer path like "/spaces/<space id>/folder/file.tar.gz" into an escaped URL of
// OpenCloud's WebDAV endpoint, refusing anything outside /spaces/ or with dot segments.
func (c *Client) davURL(webDavPath string) (string, error) {
	if !strings.HasPrefix(webDavPath, "/spaces/") {
		return "", ErrInvalidPath
	}
	segments := strings.Split(strings.TrimPrefix(webDavPath, "/"), "/")
	if len(segments) < 3 {
		return "", ErrInvalidPath
	}
	for i, segment := range segments {
		if segment == "" || segment == "." || segment == ".." || strings.ContainsRune(segment, '\\') ||
			strings.IndexFunc(segment, unicode.IsControl) >= 0 {
			return "", ErrInvalidPath
		}
		segments[i] = url.PathEscape(segment)
	}
	return c.base + "/dav/" + strings.Join(segments, "/"), nil
}

func statusError(status int) error {
	switch status {
	case http.StatusNotFound:
		return ErrNotFound
	case http.StatusUnauthorized, http.StatusForbidden:
		return ErrForbidden
	}
	return fmt.Errorf("OpenCloud answered HTTP %d", status)
}

const propfindBody = `<?xml version="1.0" encoding="utf-8"?>` +
	`<d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getetag/><d:resourcetype/></d:prop></d:propfind>`

type multistatus struct {
	Responses []struct {
		Propstats []struct {
			Status string `xml:"status"`
			Prop   struct {
				ContentLength string `xml:"getcontentlength"`
				ETag          string `xml:"getetag"`
				ResourceType  struct {
					Collection *struct{} `xml:"collection"`
				} `xml:"resourcetype"`
			} `xml:"prop"`
		} `xml:"propstat"`
	} `xml:"response"`
}

// Stat returns the file's size and ETag (PROPFIND, depth 0).
func (c *Client) Stat(ctx context.Context, authorization, webDavPath string) (FileInfo, error) {
	target, err := c.davURL(webDavPath)
	if err != nil {
		return FileInfo{}, err
	}
	request, err := http.NewRequestWithContext(ctx, "PROPFIND", target, strings.NewReader(propfindBody))
	if err != nil {
		return FileInfo{}, err
	}
	request.Header.Set("Authorization", authorization)
	request.Header.Set("Depth", "0")
	request.Header.Set("Content-Type", "application/xml")
	response, err := c.http.Do(request)
	if err != nil {
		return FileInfo{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusMultiStatus {
		return FileInfo{}, statusError(response.StatusCode)
	}
	var result multistatus
	if err := xml.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result); err != nil {
		return FileInfo{}, fmt.Errorf("invalid PROPFIND answer: %w", err)
	}
	for _, r := range result.Responses {
		for _, propstat := range r.Propstats {
			if !strings.Contains(propstat.Status, " 200 ") {
				continue
			}
			if propstat.Prop.ResourceType.Collection != nil {
				return FileInfo{}, ErrNotFound
			}
			size, err := strconv.ParseInt(strings.TrimSpace(propstat.Prop.ContentLength), 10, 64)
			if err != nil || size < 0 {
				return FileInfo{}, fmt.Errorf("invalid file size %q", propstat.Prop.ContentLength)
			}
			name := webDavPath[strings.LastIndex(webDavPath, "/")+1:]
			return FileInfo{Name: name, Size: size, ETag: strings.TrimSpace(propstat.Prop.ETag)}, nil
		}
	}
	return FileInfo{}, errors.New("PROPFIND answer has no file properties")
}

// Download starts a GET of the file; the caller reads and closes the body. The response's ETag
// is compared with the expected one so a file replaced since Stat isn't copied by mistake.
func (c *Client) Download(ctx context.Context, authorization, webDavPath, expectedETag string) (io.ReadCloser, error) {
	target, err := c.davURL(webDavPath)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", authorization)
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, statusError(response.StatusCode)
	}
	if etag := response.Header.Get("ETag"); expectedETag != "" && etag != "" && etag != expectedETag {
		response.Body.Close()
		return nil, ErrChanged
	}
	return response.Body, nil
}
