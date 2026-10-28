package opencloud

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

const space = "d8012512-6b33$69d90434-0c86"

func fakeOpenCloud(t *testing.T, content string, etag string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer good" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/dav/spaces/"+space+"/dir/my file.tar.gz" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		switch r.Method {
		case "PROPFIND":
			w.WriteHeader(http.StatusMultiStatus)
			io.WriteString(w, `<d:multistatus xmlns:d="DAV:"><d:response><d:href>x</d:href><d:propstat><d:prop>`+
				`<d:getcontentlength>`+strconv.Itoa(len(content))+`</d:getcontentlength><d:getetag>`+etag+`</d:getetag>`+
				`<d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`)
		case http.MethodGet:
			w.Header().Set("ETag", etag)
			io.WriteString(w, content)
		}
	}))
}

func TestStatAndDownload(t *testing.T) {
	server := fakeOpenCloud(t, "hello archive", `"e1"`)
	defer server.Close()
	client := NewClient(server.URL, nil)
	path := "/spaces/" + space + "/dir/my file.tar.gz"

	info, err := client.Stat(context.Background(), "Bearer good", path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size != 13 || info.ETag != `"e1"` || info.Name != "my file.tar.gz" {
		t.Errorf("info = %+v", info)
	}
	body, err := client.Download(context.Background(), "Bearer good", path, info.ETag)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(body)
	body.Close()
	if string(data) != "hello archive" {
		t.Errorf("data = %q", data)
	}
}

func TestErrors(t *testing.T) {
	server := fakeOpenCloud(t, "hello archive", `"e2"`)
	defer server.Close()
	client := NewClient(server.URL, nil)
	path := "/spaces/" + space + "/dir/my file.tar.gz"
	ctx := context.Background()

	if _, err := client.Stat(ctx, "Bearer bad", path); !errors.Is(err, ErrForbidden) {
		t.Errorf("bad token: %v", err)
	}
	if _, err := client.Stat(ctx, "Bearer good", "/spaces/"+space+"/other.tar"); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing file: %v", err)
	}
	if _, err := client.Download(ctx, "Bearer good", path, `"e1"`); !errors.Is(err, ErrChanged) {
		t.Errorf("changed etag: %v", err)
	}
}

func TestInvalidPathsAreRefusedBeforeAnyRequest(t *testing.T) {
	client := NewClient("http://unused.invalid", nil)
	for _, path := range []string{
		"", "/", "/files/x", "/spaces/", "/spaces/" + space, "/spaces/" + space + "/../x",
		"/spaces/" + space + "/./x", "/spaces/" + space + "//x", "/spaces/" + space + "/a\\b",
		"/spaces/" + space + "/a\nb", "spaces/" + space + "/x",
	} {
		if _, err := client.Stat(context.Background(), "Bearer good", path); !errors.Is(err, ErrInvalidPath) {
			t.Errorf("%q: want ErrInvalidPath, got %v", path, err)
		}
	}
}
