# Archive Helper: ZIP and 7z

Added in 0.4.0. The helper opens **7z** archives (the browser can't: their codecs need
WebAssembly, which the CSP blocks) and **ZIPs** that are too big for the browser's limits or hold
entries the browser can't decompress. The flow, sessions, caps and downloads are the same as for
TAR ([overview](overview.md), [api](api.md), [storage-limits](storage-limits.md)); this doc covers
what is specific to the two formats. Code: `server/internal/archive/zip.go`, `sevenzip.go`,
`server/internal/deflate64/`, `server/third_party/sevenzip/`.

## When the viewer uses the helper (`App.vue`)

| Archive                                                       | Opened                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `.7z`, any size                                               | On the helper. Without it: "can only be opened when the server helper is installed"        |
| `.zip` over `maxArchiveSize` (1 GiB desktop / 128 MiB mobile) | On the helper; if missing or failing, by range in the browser (+ a notice if it failed)    |
| `.zip` within the limit, all entries stored/deflate           | By range in the browser, as before                                                         |
| `.zip` within the limit, an entry with `needsServer`          | Listed by range, then moved to the helper once it is ready; stays in range mode without it |

`needsServer` is set by `src/engine/zip.ts` for files that aren't encrypted or symlinks and use
a method only the helper decodes (9, 12, 14, 93, 95). A failed helper attempt is not retried in
the same load (`serverFailed`), so a big ZIP never asks the helper twice.

## Detection

`archive.Detect` (port of the browser's `resolveFormat`): content wins over the extension, so
`PK…` is a ZIP and `7z¼¯'\x1c` a 7z whatever the name. Like the browser, a `.zip` that doesn't
start with `PK` (self-extractors) is refused as `unsupported-format`.

## ZIP (`zip.go`)

- **Own central-directory parser** instead of `archive/zip`: Go's reader keeps one `File` per
  header it finds, whatever the declared count, so a crafted multi-GB directory could exhaust
  memory. Ours reads the end record (and the ZIP64 record and locator), refuses a declared count
  over `MaxEntries` before reading any header, then streams the headers and stops at the cap.
  The directory and every local header must lie inside the file (`corrupt` otherwise).
- **Same listing as zip.js:** names are UTF-8 when flagged or when the bytes are valid UTF-8
  beyond ASCII, else CP437 (zip.js's table); a valid Info-ZIP Unicode Path field (0x7075, CRC of
  the raw name) wins. Folders: Unix directory mode, the MS-DOS folder attribute (when made on
  FAT) or a trailing `/`. Symlinks and encrypted entries (flag bit 0) are unreadable.
- **Dates** in zip.js's order: DOS date, then PKWARE Unix (0x000d), Info-ZIP Unix type 1
  (0x5855), extended timestamp (0x5455), NTFS (0x000a). A DOS date alone has no time zone: the
  entry carries `localTime: true` and the viewer shows it in the user's zone, as zip.js does.
- **Methods:** 0 store, 8 deflate, 9 Deflate64, 12 bzip2, 14 LZMA, 93 zstd, 95 xz. Others (PPMd
  98, AES 99, …) are listed as unreadable. Each entry is read from its own offset (no stream to
  replay) and its CRC32 checked at the end (`corrupt` on a mismatch).
- **Deflate64** (`internal/deflate64`): Go's `compress/flate` decoder with a 64 KiB window,
  distance codes 30/31 and length code 285 = 3 + 16 extra bits. Windows Explorer writes it for
  ZIPs over ~2 GB.
- **LZMA:** ZIP's 4-byte header is rewritten into a classic `.lzma` header (size, or −1 when the
  end-marker flag is set) after checking the dictionary against 256 MiB.
- **zstd:** `klauspost/compress/zstd`, one goroutine, window ≤ 256 MiB, low-memory mode.

## 7z (`sevenzip.go`)

- **Library:** `github.com/bodgit/sevenzip` v1.6.5 (BSD-3-Clause, pure Go), used through a
  patched copy in `server/third_party/sevenzip` (`replace` in `go.mod`). Upstream bounds header
  counts only at 2³², then allocates slices of that length: a header of a few bytes declaring
  4 billion files would crash the helper. The patch caps every count at `MaxEntries` and the
  header (stored, or decoded when compressed) at 512 MiB, returning `sevenzip.ErrLimit`
  (→ `too-complex`). Details and update steps: `third_party/sevenzip/PATCHES.md`.
- **Decoders replaced** at init with ones that check before allocating, like xz:
  LZMA/LZMA2 dictionary and PPMd memory ≤ 256 MiB, zstd window ≤ 256 MiB, Deflate64 from our
  package. They are built lazily on the first read, so opening a file without reading allocates
  nothing. AES is replaced by a decoder that refuses (`ErrEncrypted`).
- **Listing** reads only the header, so a 20 GB 7z lists in seconds (the progress jumps to
  100 %). Each compressed stream is then opened once without reading: one that is encrypted or
  uses a method the library lacks (e.g. the IA-64 filter) marks its files unreadable. An
  encrypted header fails the whole archive with `encrypted`.
- **Reading:** a fresh reader per request; files in archive order, each closed before the next,
  so the library continues a solid stream where it left off. Reading a late file in a solid
  stream decompresses everything before it, as with `.tar.gz`. CRC32 is checked when the header
  has one.
- **Not supported:** multi-volume (`.7z.001`), passwords, RAR.

## Tests

`server/internal/archive/testdata/make-7z-zip.sh` builds the test files with the reference 7-Zip
(`sudo apt install 7zip`, command `7z`) and Python: one tree as 7z per codec/filter (incl.
IA-64, AES, encrypted header, stored headers for patching) and as ZIP per method (incl.
Deflate64 with matches over 32 KiB, PPMd, ZipCrypto, AES, CP437 names, Python LZMA with end
marker). `sevenzip_test.go` / `zip_test.go` also build hostile cases in code: a 7z header
declaring 2³²−1 files, an oversized header, patched LZMA2/PPMd/LZMA properties, ZIP end
records with a huge count, out-of-range offsets, CRC damage, ZIP64 with 70,000 entries, zstd/xz
methods, duplicates, Unicode Path fields and DOS-only dates.

## When changing ZIP or 7z support

Keep the ZIP listing rules in step with `src/engine/zip.ts` / zip.js, update `PATCHES.md` when
the sevenzip copy changes, and update [storage-limits](storage-limits.md) for new caps and
[security](../../known-issues/security.md) for new attack surface.
