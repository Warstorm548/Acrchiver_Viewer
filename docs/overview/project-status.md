# Project Status

Where the Archive Viewer actually stands, based on reading the code. Snapshot taken from branch
`v1.0-possible-config-2` (commit `e8ea3f8`, a single bulk "Add files via upload").

## One-paragraph summary

The repo contains **two separate implementations** of an archive viewer that do not share code:
a legacy vanilla-JS app built with webpack, and an OpenCloud Web extension written in Vue 3 +
TypeScript using `libarchive.js`. Neither builds from a clean checkout (see
[build-tooling](../tech-stack/build-tooling.md)). The Vue app is the one that matches OpenCloud's
real extension API (see [two-app-split](../architecture/two-app-split.md)). Many features described
in `README.md` and the [original docs](../original-docs/) are placeholders or not implemented.

## Build / run status

| Item | Status |
|------|--------|
| `npm`/`pnpm install` | Would install only legacy deps; Vue app deps are not declared |
| Lockfile | None (`pnpm-lock.yaml` absent), so `--frozen-lockfile` fails |
| `npm run build` (webpack) | Fails: config `require.resolve`s packages not in `package.json` |
| Vite build of Vue app | No script for it; deps missing |
| Tests (`vitest`) | No `test` script; vitest/test-utils not declared |
| Docker image | Fails at `pnpm install --frozen-lockfile` |

Nothing has been verified by running it; all statuses above come from reading config files.

## Feature reality check (Vue app — the OpenCloud target)

| Feature | README claim | Actual state |
|---------|--------------|--------------|
| List archive contents | Yes | Implemented via `libarchive.js` (`ArchiveViewer.vue:449`) |
| Folder navigation | Yes | Implemented; may be flattened (see [bugs](../known-issues/bugs.md)) |
| Search / sort | Yes | Implemented (client-side, `displayedFiles` computed) |
| Preview text/images | Yes | Implemented but broken by `global` ReferenceError + modal `v-if` bug |
| Download one file | Yes | Works, then reports "Download failed" (same `global` bug) |
| Download selected / all | Yes | Sequential single-file downloads, no ZIP bundling |
| Create archive | Yes | "Create Archive" button just calls `downloadSelected` |
| Edit files in archive | Yes | Not present in Vue app |
| Sharing | Yes | Not present in Vue app |
| 20GB+ streaming | Yes | No: >1GB reads only first 100MB; <1GB loads whole file in memory |
| 7z / RAR / XZ / BZ2 | Partially | Depends on libarchive.js WASM worker, which is never shipped |

## Feature reality check (legacy JS app)

| Feature | Actual state |
|---------|--------------|
| ZIP listing | Reads central directory via HTTP Range (no ZIP64) |
| TAR listing | One HTTP request per entry; compressed TAR logic is wrong |
| View/download file from ZIP | Broken (`extractZipFile` passes fileSize `0`) |
| View/download file from TAR | Always throws "requires full implementation" |
| Edit file | `modifyArchive` always throws |
| Batch download / share selected | `extractEntry` always throws, produces empty ZIP |
| Create ZIP/TAR/TAR.GZ from uploads | Implemented (`ArchiveWriter.js`) |
| 7z / RAR / BZ2 / XZ | Throw "not yet implemented" |

Details: [legacy-app](../source/legacy-app.md).

## Dead / unused code

- `src/views/ArchiveViewerLarge.vue` — alternate viewer, not imported anywhere.
- `src/utils/memory.ts` — utilities, not imported anywhere.
- Declared but unused deps: `node-7z`, `unrar-js`, `tar-stream` (and `pako` only imported, never used).

## Metadata

- License is **AGPL-3.0** everywhere (`LICENSE` = canonical gnu.org text, `package.json`,
  `manifest.json`, `appinfo/info.json`, README).
- Author is **Warstorm548**; repo/bugs links point to `Warstorm548/Acrchiver_Viewer`. README states
  the project is independent and not affiliated with OpenCloud GmbH.
- Earlier metadata (OpenCloud.eu as author, `opencloud-eu` repos, MIT/Apache mix) was never
  accurate and has been replaced.
- `CHANGELOG.md` dates release 1.0.0 as 2025-11-04 and marks it "Production Ready"; it is not.

## Suggested direction (not yet decided)

1. Keep the Vue app; remove the legacy app and webpack config.
2. Declare real deps, add a lockfile and `build`/`test` scripts.
3. Fix the blocker bugs listed in [bugs](../known-issues/bugs.md).
4. Decide on large-file strategy (Range-request based reading, or an honest size limit).
