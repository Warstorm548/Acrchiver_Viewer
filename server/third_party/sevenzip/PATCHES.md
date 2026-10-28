# Local patches to github.com/bodgit/sevenzip v1.6.5

Copied from the v1.6.5 module (BSD-3-Clause, see `LICENSE`) without its tests and testdata, and
used through a `replace` in `server/go.mod`. Upstream's `go.mod` lost only its test-only
requirements (testify, x/sync).

Why: upstream bounds every count read from a 7z header only at `math.MaxUint32`, then
`make()`s slices of that length (e.g. `make([]FileHeader, files)`). A header of a few bytes can
declare billions of files and crash the helper with an out-of-memory error. A compressed
("encoded") header can also decode to any declared size.

Changes (each marked `Archive Viewer patch` in the code):

- `limits.go` (new): `ErrLimit`, `SetMaxCount`, `SetMaxHeaderSize`. Defaults keep upstream
  behaviour.
- `types.go` `checkUint64`: a count over `SetMaxCount` fails with `ErrLimit` before any
  allocation. Every count passed to `make` already goes through `checkUint64`.
- `reader.go` `init`: a stored header larger than `SetMaxHeaderSize`, or an encoded header
  whose declared unpacked size is larger, fails with `ErrLimit`. The decoded header stream is
  already limited to its declared size by `coderReader`.
- `types.go` `readFolder`: at most 64 coders and 64 in/out streams per folder (7-Zip's own
  limit), so bind pairs and packed streams stay small; bind-pair and packed-stream indexes must
  lie inside the folder (they are used unchecked when the folder is read).
- `types.go` `readUnpackInfo`: all folders together hold at most 4 × `SetMaxCount` coders (a
  coder is one header byte but a heap object).
- `types.go` `readSubStreamsInfo`: the per-folder stream counts are summed with a cap, so the
  sum can't wrap around to a small value and pass the check.

The helper calls `SetMaxCount(MaxEntries)` and `SetMaxHeaderSize(512 MiB)` before any 7z is read,
and recovers panics from the library (`recoverParser` in `internal/archive/sevenzip.go`) for
inconsistencies these checks don't cover.

When updating: copy the new release's non-test `.go` files, `LICENSE` and `README.md`, reapply
these changes (search for `Archive Viewer patch`), and run `go test -race ./...` in `server/`.
