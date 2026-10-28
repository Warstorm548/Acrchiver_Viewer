// Phase 0 prototype: reports what the OpenCloud proxy forwards, so the auth design can be
// verified before the real helper is written. Replaced by the real server in phase 1.
package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

var openCloudURL = strings.TrimRight(env("ARCHIVE_HELPER_OPENCLOUD_URL", "http://opencloud:9200"), "/")

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// headers lists which interesting headers arrived; values are shown only for non-secret ones.
func headers(r *http.Request) map[string]any {
	auth := r.Header.Get("Authorization")
	scheme, _, _ := strings.Cut(auth, " ")
	return map[string]any{
		"x-remote-user":       r.Header.Get("X-Remote-User"),
		"authorization":       scheme,
		"x-access-token-sent": r.Header.Get("X-Access-Token") != "",
		"x-forwarded-for":     r.Header.Get("X-Forwarded-For"),
		"path":                r.URL.Path,
	}
}

// davURL builds the internal WebDAV URL for a path like /spaces/<id>/dir/file.tar.gz.
func davURL(webDavPath string) (string, bool) {
	if !strings.HasPrefix(webDavPath, "/spaces/") || strings.Contains(webDavPath, "..") {
		return "", false
	}
	segments := strings.Split(strings.TrimPrefix(webDavPath, "/"), "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}
	return openCloudURL + "/dav/" + strings.Join(segments, "/"), true
}

func probe(r *http.Request, webDavPath string) map[string]any {
	target, ok := davURL(webDavPath)
	if !ok {
		return map[string]any{"error": "invalid path"}
	}
	result := map[string]any{}
	body := `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getetag/></d:prop></d:propfind>`
	propfind, _ := http.NewRequestWithContext(r.Context(), "PROPFIND", target, strings.NewReader(body))
	propfind.Header.Set("Authorization", r.Header.Get("Authorization"))
	propfind.Header.Set("Depth", "0")
	if response, err := http.DefaultClient.Do(propfind); err != nil {
		result["propfind_error"] = err.Error()
	} else {
		data, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		response.Body.Close()
		result["propfind_status"] = response.StatusCode
		result["propfind_body"] = string(data)
	}
	get, _ := http.NewRequestWithContext(r.Context(), "GET", target, nil)
	get.Header.Set("Authorization", r.Header.Get("Authorization"))
	get.Header.Set("Range", "bytes=0-15")
	if response, err := http.DefaultClient.Do(get); err != nil {
		result["get_error"] = err.Error()
	} else {
		data, _ := io.ReadAll(io.LimitReader(response.Body, 64))
		response.Body.Close()
		result["get_status"] = response.StatusCode
		result["get_etag"] = response.Header.Get("ETag")
		result["get_bytes"] = len(data)
	}
	return result
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/archive-api/download/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"route": "download", "headers": headers(r)})
	})
	mux.HandleFunc("/archive-api/", func(w http.ResponseWriter, r *http.Request) {
		result := map[string]any{"route": "api", "headers": headers(r)}
		if path := r.URL.Query().Get("path"); path != "" {
			result["probe"] = probe(r, path)
		}
		writeJSON(w, http.StatusOK, result)
	})
	address := env("ARCHIVE_HELPER_ADDR", ":8080")
	log.Printf("archive-helper prototype listening on %s, OpenCloud at %s", address, openCloudURL)
	log.Fatal(http.ListenAndServe(address, mux))
}
