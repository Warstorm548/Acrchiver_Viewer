# CLAUDE.md — Archive Viewer

Archive viewer extension for **OpenCloud Web v8** (browse/preview/download ZIP, TAR, etc. inside
OpenCloud). Standalone extension at the repo root, built with OpenCloud's toolchain
(`@opencloud-eu/extension-sdk`, Vite, Vue 3, TypeScript, pnpm, Node 24), pinned to OpenCloud
**8.0** to match the main server (rolling 8.0.1). All 6 rework steps are done: it opens ZIP,
TAR, TAR.GZ/TGZ, TAR.BZ2/TBZ2, TAR.XZ/TXZ, TAR.LZMA and single .gz/.bz2/.xz/.lzma files in the
browser with pure JavaScript (no WebAssembly, no CSP change) — browse, search, sort, preview,
download; ZIPs of any size are read by HTTP Range requests. UI in English, German,
Spanish and French (AI-drafted); runs only on OpenCloud 8.0.1. An optional Go **archive helper**
(`server/`, compose files in `deploy/`, since 0.3.0) opens archives too large for the browser,
7z and large ZIPs; since 0.5.0 it has its own version, and the viewer uses it only when
`src/helper/gate.ts` accepts it (else browser mode). Start with [project status](docs/overview/project-status.md).

Commands: `pnpm install`, `pnpm build`, `pnpm check:types`, `pnpm lint`, `pnpm format:check`,
`pnpm test:unit --run`, `pnpm test:e2e` (Chromium against the local stack; `E2E_SKIP_LARGE=1`
for a quick run), `pnpm package` (release zip), `pnpm l10n:extract` / `pnpm l10n:compile`
(translations; extract needs GNU gettext). Run `nvm use` first if Node 24 isn't active. Helper:
`cd server && go vet ./... && go test -race ./...` (Go 1.27 in `~/.local/go/bin`).

## How to use this index

- This file is an index only. Each entry below points to one topic doc in `docs/`.
- Before working on an area, find its entry and read **that** doc (and the docs it links). Don't
  load every doc up front.
- If a doc disagrees with the code, the code wins: fix the doc.
- Files in `docs/original-docs/` came with the upload, describe the removed legacy app and are
  **not verified**; prefer the other docs.

## Maintaining the docs and this index

- **After every code edit, update the affected docs in the same change** (behaviour, file/line
  references, bug lists, dependency tables). Most docs end with a "When changing…" note naming
  related docs to check.
- When a doc is added, renamed, split or removed, update its entry here in the same change.
- One topic per doc. Every `.md` in `docs/` (and this file) stays **at or under 300 lines**; when a
  doc would exceed that, split it into a subfolder with one file per subtopic and index each one.
- One bullet per doc: path + a short description of what it covers (Prettier may wrap it).
- When a bug in [bugs](docs/known-issues/bugs.md) is fixed, remove it there and update any doc
  that mentions it.
- **Every change bumps the SemVer version** of the part it changes, with a changelog entry in the
  same change; unreleased versions collect further changes until tagged. Viewer: `package.json`
  (MAJOR breaking, MINOR feature, PATCH fix) + [ArchiveViewerChangelog.md](ArchiveViewerChangelog.md).
  Helper (own version since 0.5.0): `Version` in `server/internal/api/api.go` and the default
  image tag in `deploy/compose/archive-helper.yml` (MINOR = breaking API change, PATCH =
  compatible) + [ArchiveHelperChangelog.md](ArchiveHelperChangelog.md). A breaking helper change
  also needs a viewer release that moves `SUPPORTED_HELPER` in `src/helper/gate.ts`.
- **Supporting a new OpenCloud version** = test it, add it to `SUPPORTED_OPENCLOUD_VERSIONS` in
  `src/compatibility.ts`, bump the version and list it in the changelog entry.

## Index

### Root

- [ArchiveViewerChangelog.md](ArchiveViewerChangelog.md) — the viewer's SemVer rules,
  compatibility table (OpenCloud and helper versions) and per-version changes, starting at 0.1.0
  (helper changes up to 0.4.1 too).
- [ArchiveHelperChangelog.md](ArchiveHelperChangelog.md) — the helper's own SemVer rules (minor =
  breaking API change) and changes, from 0.5.0.
- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) — licenses of ported/bundled code (seek-bzip
  MIT port, xz-compat MIT adaptation, zip.js BSD-3-Clause; in the helper ulikunitz/xz, the
  patched sevenzip copy, the Deflate64 port of Go's flate and the other Go modules).
- [README.md](README.md) — user-facing readme (step 6): features, formats, limits, install,
  build, translations, security, license.

### Overview

- [docs/overview/project-status.md](docs/overview/project-status.md) — build/test status, feature
  status, the 6-step rework plan, decisions, metadata.
- [docs/overview/repository-layout.md](docs/overview/repository-layout.md) — every tracked file
  with line count and purpose; what steps 1 and 3 removed.
- [docs/overview/roadmap-considerations.md](docs/overview/roadmap-considerations.md) — parked
  options: server helper (done in 0.3.0), more helper formats (7z and ZIP codecs done in 0.4.0;
  RAR, zstd, ISO proposed), libarchive as plain JS, WebAssembly + CSP, compress on the server and extract to
  folder (decided, not built), plain TAR header hopping (deferred).

### Tech stack

- [docs/tech-stack/dependencies.md](docs/tech-stack/dependencies.md) — zip.js (native build only)
  and devDependencies with versions, the helper's Go modules (ulikunitz/xz, patched sevenzip, zstd, ppmd), 8.0 alignment rule, install warnings, step 4 candidates.
- [docs/tech-stack/build-tooling.md](docs/tech-stack/build-tooling.md) — Node/pnpm, Go toolchain, scripts, what
  the extension-sdk `defineConfig` provides, TypeScript, ESLint, Prettier, `.gitignore`, release
  zip script, release workflows (viewer `release.yml`, helper `release-helper.yml` with the GHCR
  image), gettext config.

### Architecture

- [docs/architecture/opencloud-integration.md](docs/architecture/opencloud-integration.md) — how
  OpenCloud loads the extension: manifest, Module Federation, file types, route/wrapper, config.
- [docs/architecture/opencloud-v8-compatibility.md](docs/architecture/opencloud-v8-compatibility.md)
  — v8 verdict, resolved vs open items, `AppWrapperRoute` behaviour, archive engines,
  `web-app-unzip` overlap, open questions, migration outline.

### Source

- [docs/source/extension-entry.md](docs/source/extension-entry.md) — `src/index.ts`,
  `src/manifest.json` and `src/compatibility.ts`: Tailwind import, file types, route, default
  config, OpenCloud version check (exact versions, hide by throwing in `setup`, admin override).
- [docs/source/xz-lzma-decoder.md](docs/source/xz-lzma-decoder.md) — XZ container, LZMA/LZMA2
  decoder, filters, checks, legacy `.lzma`: origins, design notes, verification, speed.
- [docs/source/zip-range-reading.md](docs/source/zip-range-reading.md) — ZIP over HTTP Range
  (`HttpRangeReader`, URL renewal, fallback), device-aware limits (`src/limits.ts`), entry cap,
  step 5 verification.
- [docs/source/viewer-ui.md](docs/source/viewer-ui.md) — `App.vue` loading flow, `ArchiveBrowser`,
  `PreviewModal`, `download.ts`, styling conventions.
- [docs/source/archive-engine.md](docs/source/archive-engine.md) — `src/engine/`: formats table,
  detection, ZIP (zip.js native), TAR, gzip, bzip2, worker, single files, index, limits.
- [docs/source/archive-helper/overview.md](docs/source/archive-helper/overview.md) — server helper:
  flow, auth through the proxy, packages, dependencies, server-side engine (xz dictionary check, BCJ), viewer side.
- [docs/source/archive-helper/api.md](docs/source/archive-helper/api.md) — helper HTTP routes,
  entries, error codes, viewer flow.
- [docs/source/archive-helper/storage-limits.md](docs/source/archive-helper/storage-limits.md) —
  storage caps and reservations, hard stop, cleanup, Docker size limitation, download caps, parser
  and container limits.
- [docs/source/archive-helper/zip-and-7z.md](docs/source/archive-helper/zip-and-7z.md) — 0.4.0:
  when the viewer sends ZIPs/7z to the helper, own ZIP directory parser (zip.js rules, methods,
  Deflate64), 7z via the patched sevenzip copy, memory checks, encrypted data, tests.
- [docs/source/styles-and-i18n.md](docs/source/styles-and-i18n.md) — Tailwind/design-system
  styling, v8 theme tokens, translations (de/es/fr files, AI-draft note), translation workflow.

### Testing

- [docs/testing/tests.md](docs/testing/tests.md) — how to run, SDK test config, the 25 spec files,
  Go helper tests, test patterns (stubs, range-server fetch mock, zip), browser memory measurements.
- [docs/testing/e2e.md](docs/testing/e2e.md) — Playwright e2e suite in Chromium against the local
  stack: setup, env vars, request rewrites instead of restarts, console guard, the 11 specs (incl. server helper), results.

### Deployment

- [docs/deployment/deploying-to-opencloud.md](docs/deployment/deploying-to-opencloud.md) — build
  output, installing on a server (opencloud-compose), install checks, supported OpenCloud versions, release zip install, `apps.yaml` keys, releasing (viewer `v*` and helper `helper-v*` tags → two workflows), production CSP.
- [docs/deployment/archive-helper.md](docs/deployment/archive-helper.md) — installing the helper
  from the release files and the published image (files, `./archive-temp`, UID), changing settings,
  optional fixed-size partition, upgrade diff checklist and yjs note, updating (pull a version, from
  0.3.x/0.4.x, building from source), existing setups and own domains, troubleshooting, removal.
- [docs/deployment/ports.md](docs/deployment/ports.md) — which ports the stack uses: the helper's
  required `ARCHIVE_HELPER_PORT` (internal, set only in `.env`), OpenCloud's internal ports,
  Traefik's 80/443 and how to move them (Let's Encrypt, URL, external proxy).
- [docs/deployment/local-dev-environment.md](docs/deployment/local-dev-environment.md) — the local
  opencloud-compose stack (rolling 8.0.1) outside the repo: setup to recreate it, sudo commands,
  dev loop, fixtures, browser checklist, large-ZIP test + cleanup, step results, troubleshooting.

### Known issues

- [docs/known-issues/bugs.md](docs/known-issues/bugs.md) — open bugs from the PR #3 review
  (R-1–R-3), known limitations (K1–K5, K7, K8), memory bugs fixed by browser testing (M-1–M-6), and how the old viewer's bugs were resolved.
- [docs/known-issues/security.md](docs/known-issues/security.md) — untrusted-archive rules and how
  the viewer meets them (no `v-html`, limits, SVG, filenames, auth, CSP), plus the server helper's
  rules (proxy auth, sessions, tickets, resource limits, temp files, container).

### Original uploaded docs (historical, unverified)

- [docs/original-docs/CHANGELOG.md](docs/original-docs/CHANGELOG.md) — original 1.0.0 changelog
  and roadmap.
- [docs/original-docs/CONTRIBUTING.md](docs/original-docs/CONTRIBUTING.md) — original contribution
  guidelines, coding standards, release process.
- [docs/original-docs/PROJECT-SUMMARY.md](docs/original-docs/PROJECT-SUMMARY.md) — original
  feature/architecture summary and claimed benchmarks.
- [docs/original-docs/QUICK-REFERENCE.md](docs/original-docs/QUICK-REFERENCE.md) — original
  one-page cheat sheet.
- [docs/original-docs/api/archive-viewer-app.md](docs/original-docs/api/archive-viewer-app.md) —
  original API reference part 1: `ArchiveViewerApp` methods.
- [docs/original-docs/api/stream-reader-writer.md](docs/original-docs/api/stream-reader-writer.md)
  — original API reference part 2: `StreamProcessor`, `ArchiveReader`, `ArchiveWriter`.
- [docs/original-docs/api/ui-manager-and-context.md](docs/original-docs/api/ui-manager-and-context.md)
  — original API reference part 3: `UIManager`, OpenCloud context, errors, events, tips.
- [docs/original-docs/install/build-deploy-configure.md](docs/original-docs/install/build-deploy-configure.md)
  — original install guide part 1: prerequisites, build, deployment methods, configuration.
- [docs/original-docs/install/verify-troubleshoot-update.md](docs/original-docs/install/verify-troubleshoot-update.md)
  — original install guide part 2: verification, troubleshooting, updating, uninstalling.
