# Unused Code — `ArchiveViewerLarge.vue` and `utils/memory.ts`

Neither file is imported anywhere (`grep -r ArchiveViewerLarge src tests` and
`grep -r utils/memory` return nothing outside themselves). They look like an alternate
"large archive" design that was never wired in. Decide whether to merge useful parts into
`ArchiveViewer.vue` or delete them.

## `src/views/ArchiveViewerLarge.vue` (1305 lines)

Template 1–285, script 287–1019, scoped styles 1021–1305. Also declares `name: 'ArchiveViewer'`
(line 314) — same name as the real component.

### Differences from `ArchiveViewer.vue`

| Area | Large variant |
|------|---------------|
| Loading | Always streams the **entire** response into chunks, concatenates, wraps in Blob → File, then `Archive.open` (≈3× file size in memory at peak). Shows `streamingProgress`. |
| Large threshold | `LARGE_ARCHIVE_THRESHOLD` 1GB sets `isLargeArchive` (badge, tips, smaller batches) |
| Virtual scrolling | `visibleFiles` computed with top/bottom spacer rows, `ROW_HEIGHT` 40, buffer 50 |
| Caching | `extractionCache: Map<path, Blob>` (files <50MB on download, <10MB on preview); trimmed by a 30s interval when >100 entries |
| Extraction progress | `extracting`, `extractionProgress/Total`, cancel button (`extractionAborted`) |
| Extract All | Confirmation modal (`showExtractWarning`) instead of `confirm()` |
| Preview modal | Correctly uses `v-if="previewFileRef"` |
| Errors | Retry button (`canRetry`) |
| Search | `debouncedSearch` handler that does nothing (search is already reactive) |
| Navigation | Clears selection on every navigation |
| Select all | Excludes directories |
| Preview text limit | 100,000 chars (vs 1MB bytes) |
| Text types | adds yaml, yml, ini, conf |
| Lifecycle | `onMounted(loadArchive)`; `onUnmounted` clears timers, `clearCache()`, `close()` |

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

## `src/utils/memory.ts` (365 lines)

Exports (also as a default object):

| Export | What it does |
|--------|--------------|
| `MemoryStats`, `StreamConfig` | Types |
| `DEFAULT_STREAM_CONFIG` | 64MB chunk, 512MB max buffer, GC threshold 0.75 |
| `getMemoryStats()` | `performance.memory` (Chrome only) or `null` |
| `getAvailableMemory()` | limit − used, else 2GB guess |
| `canAllocate(bytes, margin=1.5)` | Compare against available |
| `forceGC()` | Calls `global.gc` if present — safely guarded with `typeof global` |
| `waitForGC(ms)` | Sleep + `forceGC` |
| `processInChunks(items, fn, size)` | Sequential processing with yields |
| `ManagedStream` | Chunk buffer; **bug:** `addChunk` calls `flush()` when over limit and discards the returned data |
| `readFileInChunks(file, onChunk, size)` | `Blob.slice` reader with progress |
| `downloadLargeBlob(blob, name, size)` | Re-slices a Blob into a new Blob before download (no memory benefit) |
| `MemoryMonitor` | Interval-based listener pattern over `getMemoryStats` |
| `estimateExtractionMemory` | `compressed / ratio * 1.5` |
| `supportsStreaming()` | Checks `ReadableStream`/`WritableStream`/`TransformStream` |
| `formatBytes(bytes, decimals)` | Human-readable sizes |

Browsers never expose `gc()` to page scripts, so all "force GC" helpers are effectively no-ops.
