# Known Bugs

Found by reading the code; none confirmed by running it yet.
**Confidence:** `CONFIRMED` = certain from the code alone; `PLAUSIBLE` = depends on library or host
behaviour that needs a test. Remove entries when fixed (and say so in the commit).

## Build / setup (blockers)

| # | Where | Bug | Conf. |
|---|-------|-----|-------|
| B1 | `package.json` | Vue app deps (vue, vue-router, vite, libarchive.js, web-pkg, vitest…) not declared | CONFIRMED |
| B2 | `webpack.config.js:33-36` | `require.resolve` of uninstalled polyfills throws on config load | CONFIRMED |
| B3 | `Dockerfile:13`, `install.sh:44` | `--frozen-lockfile` with no `pnpm-lock.yaml` | CONFIRMED |
| B4 | `src/index.ts:14` | libarchive.js worker bundle never copied to `/archive-viewer/` | CONFIRMED |

## Vue app — `src/views/ArchiveViewer.vue`

| # | Line | Bug | Conf. |
|---|-----:|-----|-------|
| V1 | 182 | `v-if="previewFile"` tests the function → preview modal always rendered, title "previewFile"; should be `previewFileRef` (template also uses `previewFile` for `:title`, `isTextFile`, `:alt`, Download) | CONFIRMED |
| V2 | 327 | `'gc' in global` → `ReferenceError` in browsers. Breaks `previewFile` (shows error instead of preview), `downloadFile` (downloads then shows "Download failed"), `closePreview`, `cleanupMemory` (so `downloadAll` and the fileId watcher also throw) | CONFIRMED |
| V3 | 482 | >1GB archives: only first 100MB read before `Archive.open`; ZIP/7z indexes are at the end | CONFIRMED |
| V4 | 449 | <1GB archives loaded fully into memory (ArrayBuffer + File copy) | CONFIRMED |
| V5 | 541 | Paths taken from `entry.file.name` only; libarchive.js puts folders in `entry.path` → tree flattened, duplicate names collide | PLAUSIBLE |
| V6 | 361 | `displayedFiles` shows grandchild folders in the current folder (`parts.length === 2 && isDirectory`) | CONFIRMED |
| V7 | 414 | `resourcesStore.getResource(fileId)` misses on direct link / reload → "Resource not found" | PLAUSIBLE |
| V8 | 452 | `webdav.getFileContents(resource)` — v8 signature is `(space, { fileId, path }, opts)` returning `{ body, ... }`; call throws (see [v8 compatibility](../architecture/opencloud-v8-compatibility.md) C4) | CONFIRMED |
| V9 | 799 | `downloadAll` calls `cleanupMemory()` per batch, which clears selection and preview | CONFIRMED |
| V10 | 777 | Many sequential `<a download>` clicks; browsers block or prompt for multiple downloads | PLAUSIBLE |
| V11 | 805 | "Create Archive" button only downloads files individually | CONFIRMED |
| V12 | 556 | Directory entries get `modified: new Date()` (now); sort by date is meaningless for them | CONFIRMED |
| V13 | 675 | Any download error replaces the whole page with the error view (`error.value`) | CONFIRMED |
| V14 | 681 | Uses static `Archive.extract(file)`; libarchive.js extracts via the entry object (`compressedFile.extract()`) — static method may not exist | PLAUSIBLE |
| V15 | 13 (`index.ts`) | `Archive.init({ workerUrl })` option name depends on libarchive.js version | PLAUSIBLE |
| V16 | 496 | Streaming loop yields only when `totalRead` is an exact multiple of 10MB (almost never) | CONFIRMED |
| V17 | 921 | `formatSize` units stop at GB; ≥1TB prints "undefined" | CONFIRMED |
| V18 | 654, 755, 782 | Native `confirm()` dialogs instead of OpenCloud modals | CONFIRMED |

## Vue app — `src/index.ts`

| # | Line | Bug | Conf. |
|---|-----:|-----|-------|
| I1 | 44-51 | Handler passes `fileId` as a route param the path doesn't define; `driveAliasAndItem` is only the alias | PLAUSIBLE |
| I2 | 57-98 | Every extension entry claims all 11 MIME types | CONFIRMED |
| I3 | 1-7 | Unused imports fail `noUnusedLocals` type-check | CONFIRMED |

## Unused `ArchiveViewerLarge.vue` / `utils/memory.ts`

See [vue-app-large-variant](../source/vue-app-large-variant.md): Download Selected / Extract All
no-op (L716-717), non-reactive virtual scroll (L419), `global.gc` (L470), `ManagedStream` data loss.

## Legacy app

| # | Where | Bug | Conf. |
|---|-------|-----|-------|
| L1 | `StreamProcessor.js:266` | `extractZipMetadata(url, 0)` → invalid Range → every ZIP view/download fails | CONFIRMED |
| L2 | `StreamProcessor.js:326` | TAR single-file extraction always throws | CONFIRMED |
| L3 | `StreamProcessor.js:147` | Compressed TAR reads compressed bytes at uncompressed offsets | CONFIRMED |
| L4 | `StreamProcessor.js:52-54` | No ZIP64 (>4GB, >65535 entries) | CONFIRMED |
| L5 | `ArchiveWriter.js:190` | `extractEntry` always throws → batch download/share produce empty ZIPs | CONFIRMED |
| L6 | `ArchiveWriter.js:154` | Editing always throws | CONFIRMED |
| L7 | `ArchiveReader.js:99` | `entry.size` on `null` header → `TypeError` | CONFIRMED |
| L8 | `index.js:191` | `revokeObjectURL` right after `click()` may cancel download | PLAUSIBLE |
| L9 | `UIManager.js:118-121` | Sort dropdown has no effect | CONFIRMED |
| L10 | `UIManager.js:394` | Compression % is NaN/−∞ when uncompressed size is 0 | CONFIRMED |
| L11 | `index.js:355` | `registerTabView(new ArchiveViewerApp())` doesn't implement a tab view | PLAUSIBLE |

Security issues are tracked separately in [security](security.md).

## Deployment

| # | Where | Bug | Conf. |
|---|-------|-----|-------|
| D1 | `docker-compose.yml:12` | Named volume shadows new image contents after rebuild | CONFIRMED |
| D2 | `nginx.conf:25-28` | 1-year `immutable` cache on unhashed filenames | CONFIRMED |
| D3 | `nginx.conf:27` | Nested `add_header` drops security headers for static assets | CONFIRMED |
| D4 | `nginx.conf:22` | SPA fallback to `/archive-viewer/index.html` which the build doesn't produce | CONFIRMED |

## Metadata

| # | Where | Issue |
|---|-------|-------|
| M1 | `manifest.json` vs `LICENSE`/`package.json`/`appinfo` | Apache-2.0 vs MIT |
| M2 | `manifest.json`, `appinfo/info.json`, `package.json`, `LICENSE` | Author/repo point to OpenCloud's org, not this repo |
| M3 | `manifest.json` `features` | Claims encrypted archives and batch operations |
