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

## [0.2.2] - Unreleased

Supported OpenCloud versions: **8.0.1**. No change to the extension itself.

### Added

- End-to-end tests in Chromium (Playwright, `pnpm test:e2e`) against the local OpenCloud stack:
  every format, browsing, previews, byte-checked downloads, limits, the built-in-CSP fallback, the
  version check, translations and the 3 GiB ZIP; see [e2e](docs/testing/e2e.md).

## [0.2.1] - Unreleased

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

## [0.2.0] - Unreleased

Supported OpenCloud versions: **8.0.1**.

### Added

- OpenCloud version check: the viewer runs only on the exact OpenCloud versions it supports
  (`SUPPORTED_OPENCLOUD_VERSIONS` in `src/compatibility.ts`). On any other version, or if the
  version can't be read, it hides itself (no "Open in Archive Viewer", no file types) and logs the
  reason in the browser console.
- `apps.yaml` option `allowUnsupportedOpenCloud` (default `false`): lets an admin run the viewer on
  an unsupported version anyway, with a console warning.

## [0.1.1] - Unreleased

### Added

- This changelog and the SemVer rule: every change bumps the version and gets an entry here.
- Version banner (`/*! archive-viewer vX.Y.Z */`) on every compiled JS file.

## [0.1.0] - Unreleased

First version of the rebuilt viewer as an OpenCloud Web 8 extension (no tag or release yet).

### Added

- Opens ZIP, TAR, TAR.GZ/TGZ, TAR.BZ2/TBZ2, TAR.XZ/TXZ, TAR.LZMA and single .gz/.bz2/.xz/.lzma
  files in the browser with pure JavaScript (no WebAssembly, no CSP change).
- Browse, search, sort, preview and download archive entries.
- ZIPs of any size are read with HTTP Range requests; other formats have device-aware size limits
  configurable in `apps.yaml`.
- UI translations for German, Spanish and French (AI-drafted).
- `pnpm package` release zip with SHA-256 checksum.
