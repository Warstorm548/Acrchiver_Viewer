# CLAUDE.md — Archive Viewer

Archive viewer extension for **OpenCloud Web** (browse/preview/download ZIP, TAR, etc. inside
OpenCloud). The repo holds two separate implementations: the **Vue 3 + TypeScript app**
(`src/index.ts`, `src/views/`), which is the real OpenCloud target, and a **legacy vanilla-JS app**
(`src/index.js`, `src/lib/`) built with webpack. Neither builds yet. Start with
[project status](docs/overview/project-status.md).

## How to use this index

- This file is an index only. Each entry below points to one topic doc in `docs/`.
- Before working on an area, find its entry and read **that** doc (and the docs it links). Don't
  load every doc up front.
- If a doc disagrees with the code, the code wins: fix the doc.
- Files in `docs/original-docs/` came with the upload and are **not verified**; prefer the other docs.

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
- [README.md](README.md) — original project readme (features, usage, format table); many claims
  are aspirational, see project status.

### Overview
- [docs/overview/project-status.md](docs/overview/project-status.md) — what builds, what works,
  what's stubbed; README claims vs reality; suggested direction.
- [docs/overview/repository-layout.md](docs/overview/repository-layout.md) — every file with line
  count, owning app (Vue / legacy / dead) and purpose; referenced-but-missing files.

### Tech stack
- [docs/tech-stack/dependencies.md](docs/tech-stack/dependencies.md) — declared vs imported
  packages, missing deps, browser APIs used, hand-written type stubs.
- [docs/tech-stack/build-tooling.md](docs/tech-stack/build-tooling.md) — npm scripts, webpack,
  Vite, TypeScript, Vitest config, pnpm/lockfile, steps to a working build.

### Architecture
- [docs/architecture/two-app-split.md](docs/architecture/two-app-split.md) — legacy vs Vue app
  side by side, which one OpenCloud loads, both runtime flows, recommendation.
- [docs/architecture/opencloud-integration.md](docs/architecture/opencloud-integration.md) —
  `defineWebApplication`, file extensions/handler, route, how the file is fetched, MIME types,
  `manifest.json`, `appinfo/info.json`.
- [docs/architecture/opencloud-v8-compatibility.md](docs/architecture/opencloud-v8-compatibility.md)
  — verdict vs OpenCloud v8.1.0: blockers, mismatches, what still fits, reference app shape.

### Source
- [docs/source/vue-app.md](docs/source/vue-app.md) — `ArchiveViewer.vue`: template, state,
  computed, loading paths, actions with line numbers, lifecycle.
- [docs/source/vue-app-large-variant.md](docs/source/vue-app-large-variant.md) — unused
  `ArchiveViewerLarge.vue` and `utils/memory.ts`: differences and their bugs.
- [docs/source/legacy-app.md](docs/source/legacy-app.md) — `index.js`, `StreamProcessor`,
  `ArchiveReader`, `ArchiveWriter`, `UIManager`, root `index.html` harness.
- [docs/source/styles-and-i18n.md](docs/source/styles-and-i18n.md) — scoped Vue styles,
  `main.css`, `translations.json` languages and key coverage.

### Testing
- [docs/testing/tests.md](docs/testing/tests.md) — Vitest config, `setup.ts` mocks, spec coverage,
  expected failures, how to run.

### Deployment
- [docs/deployment/docker-and-nginx.md](docs/deployment/docker-and-nginx.md) — Dockerfile,
  docker-compose, nginx.conf and their problems.
- [docs/deployment/install-script.md](docs/deployment/install-script.md) — `install.sh` step by
  step and its issues.

### Known issues
- [docs/known-issues/bugs.md](docs/known-issues/bugs.md) — numbered bug list with file:line and
  confidence (confirmed / plausible), by area.
- [docs/known-issues/security.md](docs/known-issues/security.md) — legacy XSS, untrusted archive
  input, zip bombs, headers, unbacked README security claims.

### Original uploaded docs (unverified)
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
