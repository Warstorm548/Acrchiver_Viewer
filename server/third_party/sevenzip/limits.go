package sevenzip

// Added for the Archive Viewer helper (see PATCHES.md): upstream only bounds header counts at
// math.MaxUint32, so a few header bytes can declare billions of files and make() them all.

import (
	"errors"
	"math"
	"sync/atomic"
)

// ErrLimit is returned when a header exceeds SetMaxCount, SetMaxHeaderSize or the folder limits.
var ErrLimit = errors.New("sevenzip: header exceeds a configured limit")

const (
	// maxFolderStreams caps the coders and the in/out streams of one folder (7-Zip's own
	// k_NumCodersStreams_in_Folder_MAX); real folders have at most 4 coders (BCJ2 + 3 LZMA).
	maxFolderStreams = 64
	// coderBudget caps the coders of all folders together, as a multiple of SetMaxCount: each
	// coder costs a heap object but only one header byte.
	coderBudget = 4
)

var (
	//nolint:gochecknoglobals
	maxCount atomic.Uint64
	//nolint:gochecknoglobals
	maxHeaderSize atomic.Int64
)

//nolint:gochecknoinits
func init() {
	maxCount.Store(math.MaxUint32)
	maxHeaderSize.Store(math.MaxInt64)
}

// SetMaxCount caps every count read from a header (files, folders, streams, coders, property
// sizes); larger values fail with an error before anything is allocated for them.
func SetMaxCount(n uint64) {
	maxCount.Store(min(n, math.MaxUint32))
}

// SetMaxHeaderSize caps the header's size, stored or after decompressing an encoded header.
func SetMaxHeaderSize(n int64) {
	maxHeaderSize.Store(n)
}
