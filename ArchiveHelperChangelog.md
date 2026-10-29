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
  `ARCHIVE_HELPER_OPENCLOUD_URL/status.php` with 200 and its status JSON (`"installed": true`)
  within 3 s, so a wrong URL pointing at another server is reported too.
- A warning at startup when `ARCHIVE_HELPER_ADDR` uses a loopback host (`127.x.x.x`, `::1`,
  `localhost`), which the OpenCloud proxy can't reach.
