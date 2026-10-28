// Package archive lists TAR-based, single compressed, ZIP and 7z archives stored in the temp folder
// and reads entries out of them. Detection and listing follow the browser engine (src/engine/), so
// the viewer shows the same tree whichever side opened the archive.
package archive

import (
	"bytes"
	"errors"
	"strings"
)

// Format is what the archive is, by the same names as the browser's ArchiveFormat.
type Format string

const (
	FormatTar    Format = "tar"
	FormatTarGz  Format = "tar.gz"
	FormatTarBz2 Format = "tar.bz2"
	FormatTarXz  Format = "tar.xz"
	FormatGz     Format = "gz"
	FormatBz2    Format = "bz2"
	FormatXz     Format = "xz"
	FormatLzma   Format = "lzma"
	FormatZip    Format = "zip"
	Format7z     Format = "7z"
)

var (
	ErrUnsupported = errors.New("unsupported archive format")
	ErrCorrupt     = errors.New("archive is damaged")
	// ErrTooComplex: a parser limit was hit (entries, names, decompressed size, time, dictionary).
	ErrTooComplex = errors.New("archive is too large or complex to list")
	// ErrEncrypted: the archive (or its listing) is password-protected.
	ErrEncrypted = errors.New("archive is password-protected")
)

type compression int

const (
	none compression = iota
	gzipCompression
	bzip2Compression
	xzCompression
	lzmaCompression
)

func (f Format) compression() compression {
	switch f {
	case FormatTarGz, FormatGz:
		return gzipCompression
	case FormatTarBz2, FormatBz2:
		return bzip2Compression
	case FormatTarXz, FormatXz:
		return xzCompression
	case FormatLzma:
		return lzmaCompression
	}
	return none
}

// isTarFormat: always read as a tar; the other compressed formats are a tar only if the
// decompressed data looks like one (as the browser's openDecompressed).
func (f Format) isTarFormat() bool {
	return f == FormatTar || f == FormatTarGz || f == FormatTarBz2 || f == FormatTarXz
}

var formatsByExtension = map[string]Format{
	"tar": FormatTar, "tar.gz": FormatTarGz, "tgz": FormatTarGz,
	"tar.bz2": FormatTarBz2, "tbz2": FormatTarBz2, "tbz": FormatTarBz2,
	"tar.xz": FormatTarXz, "txz": FormatTarXz,
	"gz": FormatGz, "bz2": FormatBz2, "xz": FormatXz, "lzma": FormatLzma, "tlz": FormatLzma,
	"zip": FormatZip, "7z": Format7z,
}

// Extension follows OpenCloud's rule: tar.gz / tar.bz2 / tar.xz count as one extension.
func Extension(fileName string) string {
	lower := strings.ToLower(fileName)
	for _, compound := range []string{"tar.gz", "tar.bz2", "tar.xz"} {
		if strings.HasSuffix(lower, "."+compound) {
			return compound
		}
	}
	if dot := strings.LastIndex(lower, "."); dot > 0 {
		return lower[dot+1:]
	}
	return ""
}

// SignatureLength is how many leading bytes Detect needs.
const SignatureLength = 262

func signature(head []byte) string {
	switch {
	case len(head) >= 3 && head[0] == 'P' && head[1] == 'K' && (head[2] == 3 || head[2] == 5 || head[2] == 7):
		return "zip"
	case len(head) >= 2 && head[0] == 0x1f && head[1] == 0x8b:
		return "gzip"
	case len(head) >= 3 && bytes.Equal(head[:3], []byte("BZh")):
		return "bzip2"
	case len(head) >= 6 && bytes.Equal(head[:6], []byte{0xfd, '7', 'z', 'X', 'Z', 0}):
		return "xz"
	case len(head) >= 6 && bytes.Equal(head[:6], []byte{'7', 'z', 0xbc, 0xaf, 0x27, 0x1c}):
		return "7z"
	case looksLikeTar(head):
		return "tar"
	}
	return ""
}

func looksLikeTar(head []byte) bool {
	return len(head) >= 262 && string(head[257:262]) == "ustar"
}

// Detect picks the format from the extension, trusting the content when they disagree (a port of
// the browser's resolveFormat).
func Detect(fileName string, head []byte) (Format, error) {
	byExtension := formatsByExtension[Extension(fileName)]
	switch signature(head) {
	case "zip":
		return FormatZip, nil
	case "7z":
		return Format7z, nil
	case "tar":
		return FormatTar, nil
	case "gzip":
		if byExtension == FormatTarGz || byExtension == FormatGz {
			return byExtension, nil
		}
		return FormatGz, nil
	case "bzip2":
		if byExtension == FormatTarBz2 || byExtension == FormatBz2 {
			return byExtension, nil
		}
		return FormatBz2, nil
	case "xz":
		if byExtension == FormatTarXz || byExtension == FormatXz {
			return byExtension, nil
		}
		return FormatXz, nil
	}
	if byExtension == FormatTar {
		return FormatTar, nil
	}
	// legacy .lzma has no magic bytes: accept it on the extension if the header is plausible
	if byExtension == FormatLzma && len(head) >= 13 && head[0] < 225 {
		return FormatLzma, nil
	}
	return "", ErrUnsupported
}

// SingleFileName names the file inside a single compressed file: the name stored in a gzip
// header, else the archive name without its extension (port of the browser's singleFileName).
func SingleFileName(archiveName, storedName string) string {
	if stored := strings.TrimSpace(lastSegment(storedName)); stored != "" {
		return stored
	}
	lower := strings.ToLower(archiveName)
	for _, extension := range []string{".gz", ".bz2", ".xz", ".lzma"} {
		if strings.HasSuffix(lower, extension) && len(archiveName) > len(extension) {
			return archiveName[:len(archiveName)-len(extension)]
		}
	}
	return archiveName + ".out"
}

func lastSegment(path string) string {
	if i := strings.LastIndexAny(path, `/\`); i >= 0 {
		return path[i+1:]
	}
	return path
}
