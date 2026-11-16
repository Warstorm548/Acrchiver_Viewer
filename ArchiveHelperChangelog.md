# Archive Helper changelog

All notable changes to the server helper (`server/`, image `ghcr.io/warstorm548/archive-helper`,
compose files in `deploy/`) are recorded here, newest first. The viewer has its own changelog:
[ArchiveViewerChangelog.md](ArchiveViewerChangelog.md).

The helper has its own version since 0.5.0 (`Version` in `server/internal/api/api.go`, reported
by `/health`, used as the image tag). Before that it shared the viewer's version: 0.3.0, 0.4.0 and
0.4.1 are recorded in ArchiveViewerChangelog.md. 0.5.0 continues from there so the image tags keep
counting up.

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html), with the 0.x rule
the viewer relies on:

- **MINOR** (0.5 → 0.6) — any breaking change to the API the viewer uses (changed or removed
  routes, fields or behaviour). Viewers that support `^0.5.0` then ignore the new helper until a
  viewer release supports it.
- **PATCH** (0.5.0 → 0.5.1) — fixes and compatible additions. A new optional ability is added to
  the `/health` features list, so older viewers keep working and newer ones use it when present.

Every change gets an entry and a bump of `Version`, and the default image tag in
`deploy/compose/archive-helper.yml` must match it (checked by `tests/unit/helperVersion.spec.ts`).

## [0.5.2] - Unreleased

Works with viewer **0.5.x** and **0.6.x** (both accept `^0.5.0`); tested on OpenCloud 9.1.0 with
viewer 0.6.0. No settings change: pull the new image (`ARCHIVE_HELPER_TAG=0.5.2`, or the new
`archive-helper.yml`) and restart the helper. No API change.

### Security

Three vulnerabilities reported by `govulncheck` as reachable from the helper's code (none were
Dependabot alerts):

- `github.com/andybalholm/brotli` v1.2.2 → v1.2.7 (GO-2026-6888: excessive memory allocation when
  decompressing crafted streams; Brotli in 7z, via sevenzip).
- `github.com/klauspost/compress` v1.19.0 → v1.20.2 (GO-2026-6865: panic on two-block frames;
  zstd in ZIP and 7z).
- Built with Go **1.27.4** (GO-2026-6859: HTTP/1 server crash from a `MaxBytesReader` header race
  in `net/http`). The Dockerfile's `golang:1.27-alpine` already resolves to 1.27.4.

Both module bumps are also made in the patched sevenzip copy (`third_party/sevenzip/go.mod`).
`govulncheck ./...` now reports no vulnerabilities.

## [0.5.1] - 2026-11-01

Works with viewer **0.5.x** and **0.6.x**. Tested with OpenCloud 8.0.1 and, with viewer 0.6.0,
OpenCloud 9.1.0 (no change needed). No settings change: pull the new image (`ARCHIVE_HELPER_TAG=0.5.1`, or
the new `archive-helper.yml`) and restart the helper.

### Security

- `golang.org/x/text` v0.40.0 → v0.43.0 (GO-2026-6629: a panic when parsing crafted input in
  `x/text/secure/precis`). The helper only uses the module's UTF-16 decoding for 7z file names
  (through the patched sevenzip copy), so it was never affected (govulncheck: not reachable).
  The bump clears the report.

## [0.5.0] - 2026-10-29

Works with viewer **0.5.x**.

**Upgrading:** add `ARCHIVE_HELPER_PORT` to opencloud-compose's `.env` (e.g.
`ARCHIVE_HELPER_PORT=8080`), copy the new `archive-helper.yml` and `proxy.yaml` into
`opencloud-compose/custom/`, then `sudo docker compose up -d` (helper and OpenCloud restart).

### Changed

- **Own version**, released with `helper-v<version>` tags; the GitHub release carries the compose
  files and `archive-helper.env.example`.
- **The port is set in one place:** `ARCHIVE_HELPER_PORT` in `.env`. The helper listens on it and
  OpenCloud's proxy reads it (`custom/proxy.yaml` uses `${ARCHIVE_HELPER_PORT}`;
  `archive-helper.yml` passes it to the `opencloud` container). There is no default port any more:
  without it the helper stops with `ARCHIVE_HELPER_PORT is not set in .env`, while OpenCloud keeps
  running and the viewer stays in browser mode.
- The image no longer declares `EXPOSE 8080` (the port is chosen in `.env`, never published).

### Added

- `/health` reports `features` (`format:<format>` for each format it opens, `download:selection`),
  `ready` and `problems` (`temp-not-writable`, `opencloud-unreachable`). The checks run at most
  every 30 s (not cached when the caller gave up); OpenCloud must answer
  `ARCHIVE_HELPER_OPENCLOUD_URL/status.php` with 200 and its status JSON (`"installed": true`,
  `"productname": "OpenCloud"`)
  within 3 s, so a wrong URL pointing at another server is reported too.
- A warning at startup when `ARCHIVE_HELPER_ADDR` uses a loopback host (`127.x.x.x`, `::1`,
  `localhost`), which the OpenCloud proxy can't reach.
