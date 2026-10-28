# Changelog

All notable changes to the Archive Viewer are recorded here, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) — `MAJOR.MINOR.PATCH`:

- **MAJOR** — breaking changes (e.g. dropping an OpenCloud version, removing a config key).
- **MINOR** — new features that keep existing behaviour working.
- **PATCH** — bug fixes and small tweaks.

Every change gets an entry and a version bump in `package.json`, which is the single source of
the version: the build copies it into `dist/manifest.json` and stamps it on every compiled JS file
(`/*! archive-viewer vX.Y.Z */`).

## [0.4.1] - 2026-10-28

Supported OpenCloud versions: **8.0.1**.

### Added

- `ARCHIVE_HELPER_PORT` (default `8080`): the helper's port inside the Docker network, passed to
  the helper as `ARCHIVE_HELPER_ADDR`. The port is never published on the server, so it can't
  clash with another service using 8080 there; when it is changed, both archive-helper backends in
  `custom/proxy.yaml` must use the same number (noted in `proxy.yaml` and `env.example`).
- The helper checks `ARCHIVE_HELPER_ADDR` at startup (host:port or :port, port 1–65535) and stops
  with `invalid settings: ARCHIVE_HELPER_ADDR: …` instead of a listen error.

## [0.4.0] - 2026-10-28

Supported OpenCloud versions: **8.0.1**. The first tagged release: it also contains 0.2.2 and
0.3.0, which were never released on their own.

### Added

- **Release workflow** (`.github/workflows/release.yml`): a `v*.*.*` tag checks that the tag,
  `package.json` and the helper's `api.Version` agree, runs the Go and viewer checks, publishes
  the helper image `ghcr.io/warstorm548/archive-helper` (linux/amd64 and linux/arm64, tags
  `<version>` and `latest`) and creates the GitHub release with the extension zip, its SHA-256
  and the helper's compose files.
- The helper's compose file now **pulls the published image** instead of building it, so a server
  no longer needs a clone of this repository. Building from source moved to the optional overlay
  `deploy/compose/archive-helper-build.yml`. The Dockerfile cross-compiles for each platform.

- **7z** through the archive helper, at any size (LZMA, LZMA2, PPMd, bzip2, Deflate,
  Deflate64, zstd, BCJ/ARM/ARM64/PPC/SPARC filters). Without the helper, 7z shows "can only be
  opened when the server helper is installed" instead of downloading the file first.
- **Large ZIPs** through the helper: a ZIP over `maxArchiveSize` opens on the server, where files
  and selections over the browser's entry cap can be read and downloaded. If the helper is
  missing or fails, the ZIP is still read by range in the browser, with a notice.
- ZIPs whose entries the browser can't decompress (Deflate64 from Windows Explorer, bzip2,
  LZMA, zstd, xz) open on the helper; the range listing is used if the helper is missing or fails.
- New helper error code `encrypted`: password-protected 7z headers are refused with a clear
  message; encrypted 7z/ZIP entries are listed as unreadable, as in the browser.
- Helper safety: a patched copy of `github.com/bodgit/sevenzip` v1.6.5
  (`server/third_party/sevenzip`) caps header counts at `MaxEntries` and the header at 512 MiB
  (upstream could be made to allocate billions of entries from a few bytes), folders at 64
  coders/streams and all coders at 4 × `MaxEntries`, with stream indexes checked; panics from the
  library are recovered as `corrupt` instead of ending the helper (CodeRabbit review); LZMA/LZMA2
  dictionaries, PPMd memory and zstd windows over 256 MiB are refused before allocating; the
  ZIP central directory is parsed by our own code, which stops at `MaxEntries`.
- ZIP dates from a DOS timestamp are shown in the user's time zone in server mode too
  (`localTime` on helper entries), matching zip.js.
- 3 new strings in de/es/fr (AI draft); Go tests with 7-Zip/Python-made test files
  (`make-7z-zip.sh`); unit tests for the new routing.

## [0.3.0] - Not released on its own (included in 0.4.0)

Supported OpenCloud versions: **8.0.1**. On `feature/archive-helper`.

### Added

- Optional **archive helper** (`server/`, Go 1.27) next to OpenCloud for archives too large for
  the browser (TAR, TAR.GZ/BZ2/XZ/LZMA, single .gz/.bz2/.xz/.lzma): copied as the logged-in user
  into `./archive-temp`, listed and streamed on the server; deleted on close, after 10 minutes
  without a heartbeat and on restart. Install with `deploy/compose/` and `deploy/env.example`
  ([deployment](docs/deployment/archive-helper.md)).
- Storage caps checked **before** a copy starts (total 50 GB, 25 GB per user, real free space)
  with a hard stop; "Server busy…" / "too many large archives open" messages. Admins have no
  bypass; `.env` sets the limits (also above 100 GB).
- Download caps from the tar headers (10 GB file, 10 GB selection), confirmation above 1 GB,
  3 downloads per user; downloads stream to disk through single-use links, several files as a
  ZIP with an exact size.
- Viewer: server mode with progress and Cancel, folder pages ("Show more"), server search and
  sort, previews; `archiveHelperUrl` in `apps.yaml` (default `/archive-api`, `""` = off, same
  origin only). Browser mode, ZIP range reading and public links are unchanged.
- Hardening: own UID 1500:1500, read-only container, no capabilities, memory/CPU limits; parser
  limits (entries, decompressed size, time, names); xz/lzma dictionaries over 256 MiB refused
  before allocating.
- Roadmap: formats the helper could open next (7z, RAR, Zstandard, ZIP codecs the browser can't
  read, ISO), with priorities and open questions (libraries, solid archives, memory, passwords).
- Review fixes (CodeRabbit deep review): the viewer closes a helper session also when Cancel is
  clicked while the session is being created and when a status call fails (it held server space
  until the timeout); status polling no longer piles up abort listeners; `archiveHelperUrl` is
  checked with the URL parser (`/\evil.example` no longer passes as same-origin); the install
  guide warns not to overwrite an existing `proxy.yaml`.
- ESLint ignores Playwright's `playwright-report/` and `test-results/` (a failed e2e run made
  `pnpm lint` fail).
- `limits.spec.ts` turns the helper off (`archiveHelperUrl: ""`), since it tests the browser's
  own limits; with the helper in the stack those archives now open on the server.
- 23 new strings in de/es/fr (AI draft); unit tests for the helper client and server mode; Go
  tests for every helper package; e2e spec `helper.spec.ts`.

## [0.2.2] - Not released on its own (included in 0.4.0)

Supported OpenCloud versions: **8.0.1**. No change to the extension itself.

### Added

- End-to-end tests in Chromium (Playwright, `pnpm test:e2e`) against the local OpenCloud stack:
  every format, browsing, previews, byte-checked downloads, limits, the built-in-CSP fallback, the
  version check, translations and the 3 GiB ZIP; see [e2e](docs/testing/e2e.md).

## [0.2.1] - Not released on its own (included in 0.4.0)

Supported OpenCloud versions: **8.0.1**. Memory fixes from browser testing with large archives
(PR #3); details in [bugs](docs/known-issues/bugs.md) (M-1–M-6).

### Fixed

- xz/bzip2/lzma files that unpack to more than 1 GiB no longer fail as "damaged" (output stays
  under the browser's largest buffer, `MAX_BUFFER_SIZE`).
- Failed memory allocations show "not enough free memory" instead of "damaged archive".
- bzip2/xz/lzma open under OpenCloud's built-in CSP: when the worker is blocked, decompression
  runs on the main thread (the page freezes meanwhile).
- A full download is counted against `maxArchiveSize` while it streams, so a wrong or missing
  file size in OpenCloud's metadata can't let an unbounded download through.
- "Download selected" is capped by the real bytes extracted, not the sizes the archive declares.
- An image preview the browser can't decode shows a message instead of an empty modal.

### Changed

- Mobile defaults lowered to 128 MiB archive / 384 MiB decompressed (per-file limit stays
  256 MiB), in `src/limits.ts` and `src/manifest.json`.
- Lower peak memory: downloads and extracted files go to the blob store in parts, decoders size
  their output from the recorded size and grow in place.

### Known issues

- R-1–R-3 from the PR #3 review are open; see [bugs](docs/known-issues/bugs.md).

## [0.2.0] - Not released on its own (included in 0.4.0)

Supported OpenCloud versions: **8.0.1**.

### Added

- OpenCloud version check: the viewer runs only on the exact OpenCloud versions it supports
  (`SUPPORTED_OPENCLOUD_VERSIONS` in `src/compatibility.ts`). On any other version, or if the
  version can't be read, it hides itself (no "Open in Archive Viewer", no file types) and logs the
  reason in the browser console.
- `apps.yaml` option `allowUnsupportedOpenCloud` (default `false`): lets an admin run the viewer on
  an unsupported version anyway, with a console warning.

## [0.1.1] - Not released on its own (included in 0.4.0)

### Added

- This changelog and the SemVer rule: every change bumps the version and gets an entry here.
- Version banner (`/*! archive-viewer vX.Y.Z */`) on every compiled JS file.

## [0.1.0] - Not released on its own (included in 0.4.0)

First version of the rebuilt viewer as an OpenCloud Web 8 extension (no tag or release yet).

### Added

- Opens ZIP, TAR, TAR.GZ/TGZ, TAR.BZ2/TBZ2, TAR.XZ/TXZ, TAR.LZMA and single .gz/.bz2/.xz/.lzma
  files in the browser with pure JavaScript (no WebAssembly, no CSP change).
- Browse, search, sort, preview and download archive entries.
- ZIPs of any size are read with HTTP Range requests; other formats have device-aware size limits
  configurable in `apps.yaml`.
- UI translations for German, Spanish and French (AI-drafted).
- `pnpm package` release zip with SHA-256 checksum.
