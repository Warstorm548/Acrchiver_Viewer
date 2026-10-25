# CLAUDE.md — Archive Viewer

Archive viewer extension for **OpenCloud Web v8** (browse/preview/download ZIP, TAR, etc. inside
OpenCloud). Standalone extension at the repo root, built with OpenCloud's toolchain
(`@opencloud-eu/extension-sdk`, Vite, Vue 3, TypeScript, pnpm, Node 24), pinned to OpenCloud
**8.0** to match the main server (rolling 8.0.1). Rework steps 1–5 of 6 are done: it opens ZIP,
TAR, TAR.GZ/TGZ, TAR.BZ2/TBZ2, TAR.XZ/TXZ, TAR.LZMA and single .gz/.bz2/.xz/.lzma files in the
browser with pure JavaScript (no WebAssembly, no CSP change) — browse, search, sort, preview,
download; ZIPs of any size are read by HTTP Range requests. Next: step 6 (translations, README,
release). Start with [project status](docs/overview/project-status.md).

Commands: `pnpm install`, `pnpm build`, `pnpm check:types`, `pnpm lint`, `pnpm format:check`,
`pnpm test:unit --run` (run `nvm use` first if Node 24 isn't active).

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
- Keep entries to one line: path + what it covers.
- When a bug in [bugs](docs/known-issues/bugs.md) is fixed, remove it there and update any doc
  that mentions it.

## Index

### Root

- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) — licenses of ported/bundled code (seek-bzip
  MIT port, xz-compat MIT adaptation, zip.js BSD-3-Clause).
- [README.md](README.md) — project readme; still describes the original, aspirational feature set
  and old setup (rewrite pending), see project status.

### Overview

- [docs/overview/project-status.md](docs/overview/project-status.md) — build/test status, feature
  status, the 6-step rework plan, decisions, metadata.
- [docs/overview/repository-layout.md](docs/overview/repository-layout.md) — every tracked file
  with line count and purpose; what steps 1 and 3 removed.
- [docs/overview/roadmap-considerations.md](docs/overview/roadmap-considerations.md) — parked
  options: server helper service, libarchive as plain JS, WebAssembly + CSP, extract to folder,
  plain TAR header hopping (deferred).

### Tech stack

- [docs/tech-stack/dependencies.md](docs/tech-stack/dependencies.md) — zip.js (native build only)
  and devDependencies with versions, 8.0 alignment rule, install warnings, step 4 candidates.
- [docs/tech-stack/build-tooling.md](docs/tech-stack/build-tooling.md) — Node/pnpm, scripts, what
  the extension-sdk `defineConfig` provides, TypeScript, ESLint, Prettier, `.gitignore`.

### Architecture

- [docs/architecture/opencloud-integration.md](docs/architecture/opencloud-integration.md) — how
  OpenCloud loads the extension: manifest, Module Federation, file types, route/wrapper, config.
- [docs/architecture/opencloud-v8-compatibility.md](docs/architecture/opencloud-v8-compatibility.md)
  — v8 verdict, resolved vs open items, `AppWrapperRoute` behaviour, archive engines,
  `web-app-unzip` overlap, open questions, migration outline.

### Source

- [docs/source/extension-entry.md](docs/source/extension-entry.md) — `src/index.ts` and
  `src/manifest.json`: Tailwind import, file types, route, default config.
- [docs/source/xz-lzma-decoder.md](docs/source/xz-lzma-decoder.md) — XZ container, LZMA/LZMA2
  decoder, filters, checks, legacy `.lzma`: origins, design notes, verification, speed.
- [docs/source/zip-range-reading.md](docs/source/zip-range-reading.md) — ZIP over HTTP Range
  (`HttpRangeReader`, URL renewal, fallback), device-aware limits (`src/limits.ts`), entry cap,
  step 5 verification.
- [docs/source/viewer-ui.md](docs/source/viewer-ui.md) — `App.vue` loading flow, `ArchiveBrowser`,
  `PreviewModal`, `download.ts`, styling conventions.
- [docs/source/archive-engine.md](docs/source/archive-engine.md) — `src/engine/`: formats table,
  detection, ZIP (zip.js native), TAR, gzip, bzip2, worker, single files, index, limits.
- [docs/source/styles-and-i18n.md](docs/source/styles-and-i18n.md) — Tailwind/design-system
  styling, v8 theme tokens, `l10n/translations.json`, translation tooling.

### Testing

- [docs/testing/tests.md](docs/testing/tests.md) — how to run, SDK test config, the 12 spec files,
  test patterns (stubs, range-server fetch mock, zip), what only the manual checklist covers.

### Deployment

- [docs/deployment/deploying-to-opencloud.md](docs/deployment/deploying-to-opencloud.md) — build
  output, installing on a server (opencloud-compose), install checks, `apps.yaml` limit keys, production CSP.
- [docs/deployment/local-dev-environment.md](docs/deployment/local-dev-environment.md) — the local
  opencloud-compose stack (rolling 8.0.1) outside the repo: setup to recreate it, sudo commands,
  dev loop, fixtures, browser checklist, large-ZIP test + cleanup, step results, troubleshooting.

### Known issues

- [docs/known-issues/bugs.md](docs/known-issues/bugs.md) — known limitations (K1–K7) and how the
  old viewer's bugs were resolved.
- [docs/known-issues/security.md](docs/known-issues/security.md) — untrusted-archive rules and how
  the viewer meets them (no `v-html`, limits, SVG, filenames, auth, CSP).

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
