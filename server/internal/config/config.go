// Package config reads the helper's settings from environment variables (set in the
// opencloud-compose .env and passed in by custom/archive-helper.yml).
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr         string
	OpenCloudURL string
	// DataDir is the temp folder inside the container (the host folder is mounted here).
	DataDir string

	MaxStorage          int64
	MaxStoragePerUser   int64
	MaxDownloadSize     int64
	MaxSelectionSize    int64
	ConfirmDownloadSize int64
	MaxDownloadsPerUser int
	SessionTimeout      time.Duration

	MaxEntries  int
	MaxScanSize int64
	ScanTimeout time.Duration
}

var units = []struct {
	suffix     string
	multiplier int64
}{
	// longest suffixes first so "GiB" isn't read as "B"
	{"KIB", 1 << 10}, {"MIB", 1 << 20}, {"GIB", 1 << 30}, {"TIB", 1 << 40},
	{"KB", 1e3}, {"MB", 1e6}, {"GB", 1e9}, {"TB", 1e12},
	{"K", 1e3}, {"M", 1e6}, {"G", 1e9}, {"T", 1e12},
	{"B", 1},
}

// ParseSize reads sizes like "50GB" (decimal, as disks are sold), "25GiB" (binary) or a plain
// number of bytes. Fractions are allowed ("1.5TB").
func ParseSize(text string) (int64, error) {
	value := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(text), " ", ""))
	multiplier := int64(1)
	for _, unit := range units {
		if strings.HasSuffix(value, unit.suffix) {
			value = strings.TrimSuffix(value, unit.suffix)
			multiplier = unit.multiplier
			break
		}
	}
	number, err := strconv.ParseFloat(value, 64)
	if err != nil || number <= 0 {
		return 0, fmt.Errorf("invalid size %q", text)
	}
	size := number * float64(multiplier)
	if size >= 1<<62 {
		return 0, fmt.Errorf("size %q is too large", text)
	}
	return int64(size), nil
}

type reader struct {
	lookup func(string) (string, bool)
	errs   []string
}

func (r *reader) str(key, fallback string) string {
	if value, ok := r.lookup(key); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

func (r *reader) size(key, fallback string) int64 {
	size, err := ParseSize(r.str(key, fallback))
	if err != nil {
		r.errs = append(r.errs, fmt.Sprintf("%s: %v", key, err))
	}
	return size
}

func (r *reader) duration(key, fallback string) time.Duration {
	text := r.str(key, fallback)
	value, err := time.ParseDuration(text)
	if err != nil || value <= 0 {
		r.errs = append(r.errs, fmt.Sprintf("%s: invalid duration %q (e.g. 10m, 1h)", key, text))
	}
	return value
}

func (r *reader) count(key, fallback string) int {
	text := r.str(key, fallback)
	value, err := strconv.Atoi(text)
	if err != nil || value <= 0 {
		r.errs = append(r.errs, fmt.Sprintf("%s: invalid number %q", key, text))
	}
	return value
}

// Load reads the configuration; lookup is os.LookupEnv outside tests.
func Load(lookup func(string) (string, bool)) (Config, error) {
	if lookup == nil {
		lookup = os.LookupEnv
	}
	r := &reader{lookup: lookup}
	c := Config{
		Addr:                r.str("ARCHIVE_HELPER_ADDR", ":8080"),
		OpenCloudURL:        strings.TrimRight(r.str("ARCHIVE_HELPER_OPENCLOUD_URL", "http://opencloud:9200"), "/"),
		DataDir:             r.str("ARCHIVE_HELPER_DATA_DIR", "/data"),
		MaxStorage:          r.size("ARCHIVE_HELPER_MAX_STORAGE", "50GB"),
		MaxStoragePerUser:   r.size("ARCHIVE_HELPER_MAX_STORAGE_PER_USER", "25GB"),
		MaxDownloadSize:     r.size("ARCHIVE_HELPER_MAX_DOWNLOAD_SIZE", "10GB"),
		MaxSelectionSize:    r.size("ARCHIVE_HELPER_MAX_SELECTION_SIZE", "10GB"),
		ConfirmDownloadSize: r.size("ARCHIVE_HELPER_CONFIRM_DOWNLOAD_SIZE", "1GB"),
		MaxDownloadsPerUser: r.count("ARCHIVE_HELPER_MAX_DOWNLOADS_PER_USER", "3"),
		SessionTimeout:      r.duration("ARCHIVE_HELPER_SESSION_TIMEOUT", "10m"),
		MaxEntries:          r.count("ARCHIVE_HELPER_MAX_ENTRIES", "500000"),
		MaxScanSize:         r.size("ARCHIVE_HELPER_MAX_SCAN_SIZE", "500GB"),
		ScanTimeout:         r.duration("ARCHIVE_HELPER_SCAN_TIMEOUT", "60m"),
	}
	if len(r.errs) > 0 {
		return c, fmt.Errorf("invalid settings: %s", strings.Join(r.errs, "; "))
	}
	return c, nil
}
