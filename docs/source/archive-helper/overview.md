# Archive Helper: Overview

`server/` is an optional Go service that runs next to OpenCloud and opens archives that are too
large for the browser (users' archives are 500 MiB–20 GB). The viewer uses it only when it is
installed, the user is logged in and the archive is over the browser limit
([zip-range-reading](../zip-range-reading.md) for the limits). Without it the viewer works
exactly as before. Added in 0.3.0; 0.4.0 added 7z and large ZIPs
([zip-and-7z](zip-and-7z.md)). Related docs: [api](api.md), [storage-limits](storage-limits.md),
[deployment](../../deployment/archive-helper.md).

## How a large archive is opened

```
Browser (viewer)                    OpenCloud proxy           archive-helper (Go)
POST /archive-api/sessions  ──────▶ login check, sets  ─────▶ PROPFIND file as the user
  {webDavPath}                      X-Remote-User             reserve its size (caps)
                                                              GET file → ./archive-temp/ah-<id>.part
GET /sessions/{id} every 1 s ◀────── copying % / scanning % ◀ rename .archive, scan headers
GET /sessions/{id}/children  ◀────── one folder page ◀──────── index in memory
POST /sessions/{id}/downloads ─────▶ size + caps; ticket ────▶ single-use link
GET /archive-api/download/{t} ◀───── (no login: ticket) ◀───── stream file or store-only ZIP
DELETE /sessions/{id} (leave/close) ───────────────────────▶ delete temp file, free space
```

- **Auth:** the proxy rejects anonymous requests on `/archive-api/` and **replaces** any
  client-sent `X-Remote-User` with the user's ID (verified in phase 0; OpenCloud
  `account_resolver.go`). The `Authorization` header passes through; the helper forwards it once
  to fetch the file over WebDAV, so OpenCloud's permissions decide what can be opened. The
  helper never reads OpenCloud's storage folders and never receives the reva token
  (`skip_x_access_token`).
- **Downloads** can't send a token (a plain `<a href>`), so `/archive-api/download/` is an
  unprotected route that trusts only a 256-bit random ticket, single use, 60 s. On that route the
  proxy passes a client-sent `X-Remote-User` through, so the helper ignores the header there.
- **Temp file (option A):** the compressed archive is copied as is; nothing is extracted to
  disk. Disk use equals the archive size, known before the copy, so the space check is exact.
  Reading an entry of a compressed archive decompresses from the start up to it (several
  selected files: one pass in archive order). Checkpoints for random access are a possible later
  improvement.

## Packages (`server/internal/`)

| Package     | Role                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `config`    | Environment settings with defaults; sizes like `50GB` / `25GiB`, durations like `10m`          |
| `storage`   | Reservation ledger: total + per-user caps, real free space (statfs), hard stop on writes       |
| `opencloud` | WebDAV client: PROPFIND (size, ETag), GET as the user; path checks (`/spaces/…`, no `..`)      |
| `archive`   | Detection, scan → index, extraction; xz container with BCJ/delta filters; ZIP and 7z           |
| `deflate64` | Deflate64 decoder (Go's `compress/flate` with the 64 KiB variant), for ZIP and 7z              |
| `session`   | Sessions (owner, state, heartbeat timeout), copy + scan job, download tickets, startup cleanup |
| `zipstream` | Store-only ZIP/ZIP64 writer whose size is known in advance (exact `Content-Length`)            |
| `api`       | HTTP handlers, error codes; `cmd/archive-helper/main.go` wires it all and handles shutdown     |

Dependencies: `github.com/ulikunitz/xz` (raw LZMA/LZMA2 for xz, `.lzma`, ZIP and 7z),
`github.com/bodgit/sevenzip` (7z, a patched copy in `server/third_party/`) with its modules,
`github.com/klauspost/compress` (zstd) and `github.com/stangelandcl/ppmd` (PPMd); gzip, bzip2,
deflate and tar are Go's standard library ([dependencies](../../tech-stack/dependencies.md)).

## Archive engine (server side)

- **Same results as the browser:** `archive.Detect` ports `resolveFormat` (content wins over a
  wrong extension; ZIP and 7z in [zip-and-7z](zip-and-7z.md)), `NormalizePath` and the index port
  `normalizePath` / `buildIndex` (synthesized parent folders, last duplicate wins in place, file
  beats a later folder of the same path), `SingleFileName` ports `singleFileName`. Tar headers
  are read by Go's `archive/tar` (pax, GNU long names, base-256 sizes); symlinks, hard links and
  sparse files are listed as unsupported, as in the browser.
- **Offsets:** each file's data offset in the uncompressed stream is recorded while scanning.
  Plain tar is read from the file with seeks (`io.SectionReader`); a cut inside a file's data is
  reported as damaged (a seek past the end of a file doesn't fail by itself).
- **xz:** ulikunitz/xz's own xz reader allocates whatever dictionary a file declares (up to
  4 GiB) and supports no BCJ filters, so `archive/xz.go` parses the container itself (stream,
  block headers, CRC32/CRC64/SHA-256 checks, index, padding, concatenated streams) and checks
  each block's dictionary against 256 MiB **before** `lzma.Reader2` allocates it. BCJ x86 /
  PowerPC / IA-64 / ARM / ARM-Thumb / SPARC and delta are streaming ports of liblzma's simple
  filters (as `src/engine/lzma/filters.ts`); ARM64 and RISC-V are refused like in the browser.
  Test files in `testdata/` come from the reference `xz` (`make-xz.sh`).
- **Single compressed files:** the size is only known after decompressing, so the scan
  decompresses them once (within the scan limits).

## Viewer side (`src/helper/`)

- `client.ts`: `HelperClient` (fetch with `Authorization: Bearer` from `useAuthStore()`, read
  fresh per call), `HelperError` (the helper's stable codes), `resolveHelperUrl` (apps.yaml
  `archiveHelperUrl`, default `/archive-api`; only same-origin paths, so the token never goes
  to another site; empty turns the helper off).
- `remote.ts`: `RemoteArchive` wraps one session for `ArchiveBrowser`: folder pages
  (`PAGE_SIZE` 500), search, preview reads, download preparation, heartbeat every
  `heartbeatSeconds` (a 404 means the session timed out), close on unmount and with
  `keepalive` on `pagehide`.
- When it is used is decided in `App.vue` ([viewer-ui](../viewer-ui.md)).

## When changing the helper

Keep `api.Version` equal to `package.json`, run `go vet ./... && go test -race ./...` in
`server/`, rebuild the image, and update [api](api.md) / [storage-limits](storage-limits.md) /
[deployment](../../deployment/archive-helper.md) and `deploy/` as needed.
