# Reference: Old Large-Archive Viewer — `reference/old-views/ArchiveViewerLarge.vue`

**Port notes for rework step 3.** An alternate "large archive" design that was never imported
anywhere; now parked in `reference/` and not built. Ideas worth reusing: virtual scrolling,
extraction cache, progress/cancel for bulk downloads, retry button, extract-all modal.

## `reference/old-views/ArchiveViewerLarge.vue` (1305 lines)

Template 1–285, script 287–1019, scoped styles 1021–1305. Also declares `name: 'ArchiveViewer'`
(line 314) — same name as the real component.

### Differences from `ArchiveViewer.vue`

| Area                | Large variant                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading             | Always streams the **entire** response into chunks, concatenates, wraps in Blob → File, then `Archive.open` (≈3× file size in memory at peak). Shows `streamingProgress`. |
| Large threshold     | `LARGE_ARCHIVE_THRESHOLD` 1GB sets `isLargeArchive` (badge, tips, smaller batches)                                                                                        |
| Virtual scrolling   | `visibleFiles` computed with top/bottom spacer rows, `ROW_HEIGHT` 40, buffer 50                                                                                           |
| Caching             | `extractionCache: Map<path, Blob>` (files <50MB on download, <10MB on preview); trimmed by a 30s interval when >100 entries                                               |
| Extraction progress | `extracting`, `extractionProgress/Total`, cancel button (`extractionAborted`)                                                                                             |
| Extract All         | Confirmation modal (`showExtractWarning`) instead of `confirm()`                                                                                                          |
| Preview modal       | Correctly uses `v-if="previewFileRef"`                                                                                                                                    |
| Errors              | Retry button (`canRetry`)                                                                                                                                                 |
| Search              | `debouncedSearch` handler that does nothing (search is already reactive)                                                                                                  |
| Navigation          | Clears selection on every navigation                                                                                                                                      |
| Select all          | Excludes directories                                                                                                                                                      |
| Preview text limit  | 100,000 chars (vs 1MB bytes)                                                                                                                                              |
| Text types          | adds yaml, yml, ini, conf                                                                                                                                                 |
| Lifecycle           | `onMounted(loadArchive)`; `onUnmounted` clears timers, `clearCache()`, `close()`                                                                                          |

### Bugs specific to this file

- **Download Selected / Extract All do nothing**: `downloadSelected` (line 756) and
  `downloadAll` (line 790) set `extracting = true`, then call `downloadFile`, whose first line
  (717) is `if (!file.file || extracting.value) return`.
- **Virtual scroll never updates**: `visibleFiles` (line 419) reads `container.scrollTop`, which is
  not reactive; `handleScroll` only calls `checkMemory()`, so the slice changes only when
  something else re-triggers the computed. It also writes refs inside a computed.
- **`global.gc`** in `clearCache` (line 470) throws `ReferenceError` in browsers; `clearCache` runs
  in `onUnmounted` and in the `fileId` watcher (line 952), so the watcher throws before
  `loadArchive()` is reached.
- `isImageFile(previewFileRef.value!)` in `clearCache` would throw if `previewData` is set while
  `previewFileRef` is null.
- 15 `$gettext` keys used here are missing from `translations.json` (e.g. 'Retry', 'Clear Cache').
- Same folder-path assumption as the main view (`entry.file.name` only).

## `src/utils/memory.ts` (deleted)

The helper module (`getMemoryStats`, `forceGC`, `ManagedStream`, `MemoryMonitor`, …) was removed
in rework step 1: it was unused, its GC helpers are no-ops in browsers, and `ManagedStream`
discarded data. Recover it with `git show 3a2ed58:src/utils/memory.ts` if ever needed.
