package archive

import (
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Entry is one file or folder, serialized for the viewer like its ArchiveEntry.
type Entry struct {
	Path  string `json:"path"`
	Name  string `json:"name"`
	IsDir bool   `json:"isDirectory"`
	Size  int64  `json:"size"`
	// Modified is milliseconds since 1970 (0 = unknown).
	Modified  int64 `json:"modified,omitempty"`
	Supported bool  `json:"supported"`

	// offset is where the entry's data starts in the uncompressed stream.
	offset int64
	// positions in Index.entries and in the parent's children, so a duplicate replaces in O(1)
	listPos, childPos int
}

// NormalizePath matches the browser's normalizePath: forward slashes, no empty or "." segments.
// ".." is kept as text; it only matters when files are written out (see download names).
func NormalizePath(raw string) string {
	segments := strings.Split(strings.ReplaceAll(raw, `\`, "/"), "/")
	kept := segments[:0]
	for _, segment := range segments {
		if segment != "" && segment != "." {
			kept = append(kept, segment)
		}
	}
	return strings.Join(kept, "/")
}

func parentPath(path string) string {
	if slash := strings.LastIndexByte(path, '/'); slash >= 0 {
		return path[:slash]
	}
	return ""
}

func baseName(path string) string {
	return path[strings.LastIndexByte(path, '/')+1:]
}

// Index is the folder structure of an archive (a port of the browser's buildIndex).
type Index struct {
	entries  []*Entry
	byPath   map[string]*Entry
	children map[string][]*Entry
}

func newIndex() *Index {
	return &Index{byPath: map[string]*Entry{}, children: map[string][]*Entry{"": {}}}
}

// add inserts an entry. Missing parent folders are synthesized; a repeated path keeps its last
// occurrence in place (what tar extracts), but a file and a folder with the same path keep the first.
func (x *Index) add(entry *Entry) {
	if entry.Path == "" {
		return
	}
	if existing, ok := x.byPath[entry.Path]; ok {
		if existing.IsDir == entry.IsDir {
			entry.listPos, entry.childPos = existing.listPos, existing.childPos
			x.byPath[entry.Path] = entry
			x.entries[entry.listPos] = entry
			x.children[parentPath(entry.Path)][entry.childPos] = entry
		}
		return
	}
	parent := parentPath(entry.Path)
	if parent != "" {
		if _, ok := x.byPath[parent]; !ok {
			x.add(&Entry{Path: parent, Name: baseName(parent), IsDir: true, Supported: true})
		}
	}
	entry.listPos, entry.childPos = len(x.entries), len(x.children[parent])
	x.byPath[entry.Path] = entry
	x.entries = append(x.entries, entry)
	x.children[parent] = append(x.children[parent], entry)
	if entry.IsDir {
		if _, ok := x.children[entry.Path]; !ok {
			x.children[entry.Path] = []*Entry{}
		}
	}
}

func (x *Index) Len() int { return len(x.entries) }

func (x *Index) Get(path string) *Entry { return x.byPath[path] }

// SortField is a column of the viewer's table.
type SortField string

const (
	SortName     SortField = "name"
	SortSize     SortField = "size"
	SortModified SortField = "modified"
)

// Less orders entries like the viewer's table: folders first in either direction, then by the
// field, then by name in natural order ("file2" before "file10").
func Less(a, b *Entry, field SortField, descending bool) bool {
	if a.IsDir != b.IsDir {
		return a.IsDir
	}
	result := 0
	switch field {
	case SortSize:
		result = compareInt(a.Size, b.Size)
	case SortModified:
		result = compareInt(a.Modified, b.Modified)
	}
	if result == 0 {
		result = naturalCompare(a.Name, b.Name)
	}
	if descending {
		return result > 0
	}
	return result < 0
}

func compareInt(a, b int64) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}

// naturalCompare compares case-insensitively, with runs of digits compared by value.
func naturalCompare(a, b string) int {
	for a != "" && b != "" {
		ra, sizeA := utf8.DecodeRuneInString(a)
		rb, sizeB := utf8.DecodeRuneInString(b)
		if isASCIIDigit(ra) && isASCIIDigit(rb) {
			numberA, restA := digitRun(a)
			numberB, restB := digitRun(b)
			trimmedA, trimmedB := strings.TrimLeft(numberA, "0"), strings.TrimLeft(numberB, "0")
			if len(trimmedA) != len(trimmedB) {
				return compareInt(int64(len(trimmedA)), int64(len(trimmedB)))
			}
			if trimmedA != trimmedB {
				return strings.Compare(trimmedA, trimmedB)
			}
			a, b = restA, restB
			continue
		}
		la, lb := unicode.ToLower(ra), unicode.ToLower(rb)
		if la != lb {
			return compareInt(int64(la), int64(lb))
		}
		a, b = a[sizeA:], b[sizeB:]
	}
	if result := compareInt(int64(len(a)), int64(len(b))); result != 0 {
		return result
	}
	return 0
}

func isASCIIDigit(r rune) bool { return r >= '0' && r <= '9' }

func digitRun(s string) (digits, rest string) {
	end := 0
	for end < len(s) && s[end] >= '0' && s[end] <= '9' {
		end++
	}
	return s[:end], s[end:]
}

// Children returns one sorted page of a folder's direct children and the total count.
func (x *Index) Children(folder string, field SortField, descending bool, offset, limit int) ([]*Entry, int) {
	children := x.children[folder]
	sorted := make([]*Entry, len(children))
	copy(sorted, children)
	sort.SliceStable(sorted, func(i, j int) bool { return Less(sorted[i], sorted[j], field, descending) })
	return page(sorted, offset, limit), len(sorted)
}

func page(entries []*Entry, offset, limit int) []*Entry {
	if offset < 0 {
		offset = 0
	}
	if offset > len(entries) {
		offset = len(entries)
	}
	end := len(entries)
	if limit > 0 && offset+limit < end {
		end = offset + limit
	}
	return entries[offset:end]
}

// IsFolder reports whether path is a folder ("" is the root).
func (x *Index) IsFolder(path string) bool {
	_, ok := x.children[path]
	return ok
}

// Search finds entries whose name contains query (case-insensitive), in archive order, up to
// limit; truncated reports that more matched.
func (x *Index) Search(query string, limit int) (matches []*Entry, truncated bool) {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return nil, false
	}
	for _, entry := range x.entries {
		if strings.Contains(strings.ToLower(entry.Name), query) {
			if len(matches) == limit {
				return matches, true
			}
			matches = append(matches, entry)
		}
	}
	return matches, false
}

// FilesBelow returns the readable files in a folder at any depth ("" = whole archive).
func (x *Index) FilesBelow(folder string) []*Entry {
	var files []*Entry
	for _, entry := range x.entries {
		if !entry.IsDir && entry.Supported && (folder == "" || strings.HasPrefix(entry.Path, folder+"/")) {
			files = append(files, entry)
		}
	}
	return files
}
