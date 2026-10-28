package sevenzip

// Added for the Archive Viewer helper (see PATCHES.md): upstream only bounds header counts at
// math.MaxUint32, so a few header bytes can declare billions of files and make() them all.

import (
	"errors"
	"math"
	"sync/atomic"
)

// ErrLimit is returned when a header exceeds SetMaxCount or SetMaxHeaderSize.
var ErrLimit = errors.New("sevenzip: header exceeds a configured limit")

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
