package config

import (
	"strings"
	"testing"
	"time"
)

func TestParseSize(t *testing.T) {
	cases := map[string]int64{
		"50GB":   50_000_000_000,
		"50 gb":  50_000_000_000,
		"25GiB":  25 << 30,
		"1.5TB":  1_500_000_000_000,
		"150GB":  150_000_000_000,
		"1024":   1024,
		"512MiB": 512 << 20,
		"10G":    10_000_000_000,
	}
	for input, want := range cases {
		got, err := ParseSize(input)
		if err != nil || got != want {
			t.Errorf("ParseSize(%q) = %d, %v; want %d", input, got, err, want)
		}
	}
	for _, input := range []string{"", "abc", "-5GB", "0", "GB", "1e30TB"} {
		if _, err := ParseSize(input); err == nil {
			t.Errorf("ParseSize(%q) should fail", input)
		}
	}
}

func lookup(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}

func TestDefaults(t *testing.T) {
	c, err := Load(lookup(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.MaxStorage != 50e9 || c.MaxStoragePerUser != 25e9 {
		t.Errorf("storage caps = %d / %d", c.MaxStorage, c.MaxStoragePerUser)
	}
	if c.MaxDownloadSize != 10e9 || c.MaxSelectionSize != 10e9 || c.ConfirmDownloadSize != 1e9 {
		t.Errorf("download caps = %d / %d / %d", c.MaxDownloadSize, c.MaxSelectionSize, c.ConfirmDownloadSize)
	}
	if c.MaxDownloadsPerUser != 3 || c.SessionTimeout != 10*time.Minute {
		t.Errorf("downloads/timeout = %d / %v", c.MaxDownloadsPerUser, c.SessionTimeout)
	}
	if c.OpenCloudURL != "http://opencloud:9200" || c.DataDir != "/data" {
		t.Errorf("urls = %q / %q", c.OpenCloudURL, c.DataDir)
	}
}

func TestOverridesAboveHundredGB(t *testing.T) {
	c, err := Load(lookup(map[string]string{
		"ARCHIVE_HELPER_MAX_STORAGE":   "250GB",
		"ARCHIVE_HELPER_OPENCLOUD_URL": "http://oc:9200/",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.MaxStorage != 250e9 {
		t.Errorf("MaxStorage = %d", c.MaxStorage)
	}
	if c.OpenCloudURL != "http://oc:9200" {
		t.Errorf("OpenCloudURL = %q", c.OpenCloudURL)
	}
}

func TestInvalidValuesAreReported(t *testing.T) {
	_, err := Load(lookup(map[string]string{
		"ARCHIVE_HELPER_MAX_STORAGE":            "lots",
		"ARCHIVE_HELPER_SESSION_TIMEOUT":        "soon",
		"ARCHIVE_HELPER_MAX_DOWNLOADS_PER_USER": "0",
	}))
	if err == nil {
		t.Fatal("expected an error")
	}
	for _, key := range []string{"MAX_STORAGE", "SESSION_TIMEOUT", "MAX_DOWNLOADS_PER_USER"} {
		if !strings.Contains(err.Error(), key) {
			t.Errorf("error %q does not name %s", err, key)
		}
	}
}
