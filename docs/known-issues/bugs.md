# Known Bugs

**Confidence:** `CONFIRMED` = certain from the code (and, where noted, the library/OpenCloud source
or docs); `PLAUSIBLE` = depends on library or host behaviour that needs a test. Remove entries
when fixed (and say so in the commit).

## Current app (`src/`)

No known bugs. The app is a placeholder (rework step 1); see the open questions in
[opencloud-v8-compatibility](../architecture/opencloud-v8-compatibility.md).

## Parked old viewer — fix or avoid while porting (step 3)

Lines refer to `reference/old-views/ArchiveViewer.vue` (port notes:
[reference-old-viewer](../source/reference-old-viewer.md)). Items marked _gone_ no longer apply
to the v8 design but are kept as warnings.

| #   |                    Line | Bug                                                                                                                                                                                                      | Conf.     |
| --- | ----------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| V1  |                     182 | `v-if="previewFile"` tests the function → preview modal always rendered, title "previewFile"; should be `previewFileRef` (template also uses `previewFile` for `:title`, `isTextFile`, `:alt`, Download) | CONFIRMED |
| V2  |                     327 | `'gc' in global` → `ReferenceError` in browsers; breaks preview, download, close and cleanup paths. _Gone_ if the memory helpers aren't ported                                                           | CONFIRMED |
| V3  |                     482 | >1GB archives: only first 100MB read before `Archive.open`; ZIP/7z indexes are at the end                                                                                                                | CONFIRMED |
| V4  |                     449 | Whole archive held in memory (ArrayBuffer + File copy)                                                                                                                                                   | CONFIRMED |
| V5  |                     541 | Paths taken from `entry.file.name` only; libarchive.js puts folders in `entry.path` → tree flattened, duplicate names collide (libarchive.js README: `getFilesArray()` → `{ file, path: 'addon/' }`)     | CONFIRMED |
| V6  |                     361 | `displayedFiles` shows grandchild folders in the current folder (`parts.length === 2 && isDirectory`)                                                                                                    | CONFIRMED |
| V7  |                     414 | `resourcesStore.getResource(fileId)` misses on reload. _Gone_: v8 passes `resource` as a prop                                                                                                            | PLAUSIBLE |
| V8  |                     452 | `webdav.getFileContents(resource)` uses the wrong v8 signature. _Gone_: use `AppWrapperRoute` props                                                                                                      | CONFIRMED |
| V9  |                     799 | `downloadAll` calls `cleanupMemory()` per batch, which clears selection and preview                                                                                                                      | CONFIRMED |
| V10 |                     777 | Many sequential `<a download>` clicks; browsers block or prompt for multiple downloads                                                                                                                   | PLAUSIBLE |
| V11 |                     805 | "Create Archive" button only downloads files individually                                                                                                                                                | CONFIRMED |
| V12 |                     556 | Directory entries get `modified: new Date()` (now); sort by date is meaningless for them                                                                                                                 | CONFIRMED |
| V13 |                     675 | Any download error replaces the whole page with the error view (`error.value`)                                                                                                                           | CONFIRMED |
| V14 |      681, 695, 733, 837 | Uses static `Archive.extract(file)`, which libarchive.js 2.0.2 doesn't document; single files are extracted with `compressedFile.extract()`                                                              | CONFIRMED |
| V16 |                     496 | Streaming loop yields only when `totalRead` is an exact multiple of 10MB (almost never)                                                                                                                  | CONFIRMED |
| V17 |                     921 | `formatSize` units stop at GB; ≥1TB prints "undefined" — use web-pkg `formatFileSize`                                                                                                                    | CONFIRMED |
| V18 |           654, 755, 782 | Native `confirm()` dialogs instead of OpenCloud modals                                                                                                                                                   | CONFIRMED |
| B4  | (old `src/index.ts:14`) | libarchive.js worker path: real file is `dist/worker-bundle.js` (+ WASM); must be bundled and referenced relative to the build                                                                           | CONFIRMED |

`reference/old-views/ArchiveViewerLarge.vue`: Download Selected / Extract All no-op (L716-717),
non-reactive virtual scroll (L419), `global.gc` (L470) — see
[reference-old-viewer-large](../source/reference-old-viewer-large.md).

## Fixed or removed

- **Rework step 1** removed the legacy JS app (bugs L1–L11), the webpack/Docker/install setup
  (B1–B3, D1–D4), the old `src/index.ts` (I1–I3) and the hand-written `manifest.json` (M3: claimed
  encrypted-archive and batch features).
- **Metadata fix**: license (M1) and author/repo (M2) now AGPL-3.0 / Warstorm548 /
  `Warstorm548/Acrchiver_Viewer`.
- V15 was not a bug (`workerUrl` is valid in libarchive.js 2.0.2).

Security issues are tracked separately in [security](security.md).
