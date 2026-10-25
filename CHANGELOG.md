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
