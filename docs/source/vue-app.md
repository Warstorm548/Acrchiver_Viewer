# Vue App — `src/views/ArchiveViewer.vue`

The component routed to by `src/index.ts`. Options-API shell with everything in `setup()`.
Template lines 1–223, script 225–1003, scoped styles 1005–1232. Component `name: 'ArchiveViewer'`.

## Template structure

- Memory warning banner (`memoryWarning`).
- Header: archive name, file count, total size, compressed size, compression ratio.
- `loading` → spinner + `loadingMessage`; `error` → message; else content:
  - Toolbar: `oc-text-input` search, "Download Selected (n)", "Extract All",
    "Create Archive" (only when something is selected).
  - Breadcrumb from `currentPath` with home button.
  - Table: select-all checkbox, sortable Name/Size/Modified headers, Actions column
    (preview + download for files, open for folders). Row click opens folder or previews file
    (unless Ctrl/Cmd held).
- Preview `oc-modal`: text in `<pre>`, image via `<img :src>` blob URL, fallback message; footer
  Download/Close. **Bug:** `v-if="previewFile"` (line 182) tests the function, not
  `previewFileRef`; see [bugs](../known-issues/bugs.md).

## State (refs)

| Ref | Purpose |
|-----|---------|
| `loading`, `loadingMessage`, `error` | Page status |
| `archiveName` | From `resource.name` |
| `archiveFiles: ArchiveFile[]` | Flat list of files **and** synthesized directories |
| `currentPath: string[]` | Current folder as path segments |
| `searchQuery`, `sortField`, `sortDirection` | List controls |
| `selectedFiles: ArchiveFile[]` | Selected rows (compared by object identity) |
| `previewFileRef`, `previewData`, `previewLoading`, `previewError` | Preview modal |
| `archiveHandle` | libarchive.js `Archive` instance |
| `memoryWarning`, `estimatedMemoryUsage` | From `performance.memory` |

Constants: `CHUNK_SIZE` 64MB (threshold for "streaming" download), `MAX_PREVIEW_SIZE` 10MB,
`MAX_MEMORY_USAGE` 0.7.

`ArchiveFile`: `path, name, size, compressed, modified: Date, isDirectory, mode, file?, offset?`.

## Computed

- `fileCount`, `totalSize`, `compressedSize` — sums over non-directories.
- `currentDirectory` — `currentPath.join('/')`.
- `displayedFiles` — filter to direct children of `currentDirectory`, then search on `name`
  (only within the current folder), then sort with directories first.
  Bug: the `parts.length === 2 && f.isDirectory` branch also shows **grandchild folders**
  (e.g. `a/b` appears at root next to `a`), because synthesized directory paths have no
  trailing slash.
- `allSelected` — every displayed file is in `selectedFiles`.

## Loading

`loadArchive()` (line 401): see [opencloud-integration](../architecture/opencloud-integration.md)
for how `fileId`/`resource` are found. Then:
- `size > 1GB` → `loadArchiveStreaming` (line 468): reads the response stream until **100MB**,
  cancels, concatenates, and opens that prefix with `Archive.open`. ZIP/7z keep their index at the
  end of the file, so this fails or lists nothing for real large archives. Its "yield to UI"
  check (`totalRead % 10MB === 0`, line 496) almost never fires.
- otherwise → `loadArchiveStandard` (line 449): whole file to `ArrayBuffer` → `File` → `Archive.open`.
- Both call `archive.getFilesArray()` then `processArchiveEntries(entries, streaming)` (line 533):
  builds directory entries from path segments of `entry.file.name`, pushes file entries, yields
  to the UI every 1000 entries. In streaming mode `file` is set to `null` so later extraction
  goes through `extractFileByPath`.
  Uses only `entry.file.name`; libarchive.js typically keeps the folder in `entry.path`, which
  would flatten all files into the root (**plausible, needs testing**).

## Actions

| Function | Line | Behaviour |
|----------|-----:|-----------|
| `downloadFile` | 645 | Memory check (+`confirm()`), then standard or "streaming" download, then `forceGarbageCollection()` |
| `downloadFileStandard` | 679 | `Archive.extract(file.file)` or `extractFileByPath` → Blob → `triggerDownload` |
| `downloadFileStreaming` | 687 | Same extraction (full file in memory), then re-chunks into Blob parts — no real streaming |
| `extractFileByPath` | 720 | Re-lists all entries and matches `e.file.name === path` |
| `triggerDownload` | 736 | Temporary `<a download>` click; revokes URL after 1s |
| `downloadSelected` | 749 | Confirm if >2GB; downloads each selected file one by one |
| `downloadAll` | 777 | Confirm if >5GB; downloads every file in batches of 10, calls `cleanupMemory()` per batch (which also clears selection/preview) |
| `createArchiveFromSelected` | 805 | Just calls `downloadSelected` |
| `previewFile` | 811 | Size/memory guards, extract, text → decode (truncate at 1MB), image → blob URL (≤50MB) |
| `closePreview` | 871 | Revoke image URL, reset preview state |
| navigation | 594–613 | `navigateToRoot`, `navigateToPath(i)`, `navigateToDirectory(file)`, `handleFileClick` |
| selection | 615–634 | `toggleSelection`, `toggleSelectAll`, `isSelected` |
| `sortBy` | 636 | Toggle direction or switch field |

Helpers: `getFileIcon` (ext → `oc-icon` name), `isTextFile` (txt md json js ts html css xml log
csv), `isImageFile` (jpg jpeg png gif svg webp bmp), `formatSize` (B–GB; ≥1TB prints
"undefined"), `formatDate`.

Extraction everywhere uses the static `Archive.extract(entry.file)`; whether libarchive.js offers
that (vs. `entry.file.extract()`) is unverified — see bug V14. Large-download and memory warnings
use native `confirm()` dialogs.

## Memory helpers (inline)

`checkMemory`, `getAvailableMemory` (falls back to 2GB), `updateMemoryWarning`,
`forceGarbageCollection` (line 326 — uses `global`, which throws `ReferenceError` in browsers;
called from preview, download and cleanup paths), `cleanupMemory`.

## Lifecycle

`onMounted` (line 931): `loadArchive()`, start a 5s `setInterval(updateMemoryWarning)`, and
register `onBeforeUnmount` (inside `onMounted`) to clear the interval, `cleanupMemory()` and
`archiveHandle.close()`. `watch(route.query.fileId)` → `cleanupMemory()` + `loadArchive()`.

## i18n

Template labels use `$gettext`; all `loadingMessage`/`error`/`previewError` strings set in the
script are hard-coded English. See [styles-and-i18n](styles-and-i18n.md).

## Related

- Unused alternate component: [vue-app-large-variant](vue-app-large-variant.md).
- Tests for this component: [tests](../testing/tests.md).
