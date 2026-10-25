# Legacy JS App — `src/index.js` + `src/lib/*`

Vanilla ES-module classes bundled by webpack into a UMD `ArchiveViewer` global. Registers with
the classic Files app via `OC.Plugins` (not available in OpenCloud Web — see
[two-app-split](../architecture/two-app-split.md)). Kept here for reference until it is removed.

## `src/index.js` — `ArchiveViewerApp`

Constructor creates `ArchiveReader`, `ArchiveWriter`, `UIManager(this)`, `StreamProcessor`, plus
`currentArchive`, `currentArchiveMetadata`, `selectedFiles: Set<path>`.

| Method | Behaviour |
|--------|-----------|
| `init(context)` | Stores `context`, `fileId/fileName/fileUrl`; `uiManager.init()`; `loadArchiveMetadata()` |
| `loadArchiveMetadata()` | `detectArchiveType` → `context.getFileInfo` for size → `streamProcessor.extractMetadata` → `uiManager.displayArchiveContents` |
| `detectArchiveType(name)` | Extension → `tar.gz`/`tar.bz2`/`tar.xz`/`tar`/`zip`/`gz`/`bz2`/`xz`/`7z`/`rar`, else throws |
| `viewFile(path)` | `extractSingleFile` → text (by extension) or "binary" viewer |
| `editFile(path, text)` | `archiveWriter.modifyArchive` (always throws) → `context.saveFile` |
| `downloadFile(path)` | Extract → Blob → `<a download>` click → revokes URL **immediately** (may cancel the download) |
| `downloadSelectedFiles()` | `createArchiveFromEntries(..., 'zip')` → download `<name>_selected.zip` |
| `createArchive(files, fmt)` | `createArchiveFromFiles` → `context.uploadFile('archive_<ts>.<fmt>')` |
| `shareFiles(entries)` | None → `context.createShare(fileId)`; some → build ZIP, upload `shared_<ts>.zip`, share it |
| `toggleFileSelection`, `clearSelection` | Maintain `selectedFiles` |
| `isTextFile(name)` | 32 text extensions |
| `formatFileSize(bytes)` | B–TB |

Bottom of file: `if (typeof OC !== 'undefined') OC.Plugins.register('files', { attach(fileList) { fileList.registerTabView(new ArchiveViewerApp()) } })`; default export the class.

## `src/lib/StreamProcessor.js`

All file access goes through `fetchRange(url, start, end, ctx)` → `fetch` with
`Range: bytes=start-(end-1)` and `Authorization: ctx.getAuthToken()`. `CHUNK_SIZE` 2MB,
`MAX_MEMORY_USAGE` 100MB (unused).

| Method | Behaviour / issues |
|--------|-------------------|
| `extractMetadata` | Dispatch by type; 7z/rar throw |
| `extractZipMetadata` | Fetch last ≤64KB, `findEOCD` (scan backwards for `0x06054b50`), read CD size/offset/count, fetch CD, `parseZipCentralDirectory`. No ZIP64, so >4GB / >65535 entries fail |
| `parseZipCentralDirectory` | Reads name, sizes, local header offset per entry |
| `extractTarMetadata` | Loop: fetch 512-byte header per entry (one HTTP request each). For compressed TAR it fetches *compressed* bytes at the *uncompressed* offset and gunzips each 2MB chunk independently — wrong for anything past the first entry; bz2/xz throw |
| `parseTarHeader` | Requires `ustar` magic, name (100 bytes, no prefix field), octal size, type flag `5` = dir |
| `extractSingleFile` | Dispatch; `extractZipFile` / `extractTarFile` / `extractCompressedFile` / 7z / rar |
| `extractZipFile` | Calls `extractZipMetadata(url, 0, ctx)` — fileSize `0` gives `Range: bytes=0--1`, so it **always fails**. Otherwise would handle stored (0) and deflate (8) |
| `extractTarFile` | Calls metadata with size 0 (loop never runs) then always throws |
| `extractCompressedMetadata` | Single synthetic entry named from the URL |
| `extractCompressedFile` | `getFileSize` (HEAD) → fetch all chunks → concat → `decompress` (gzip only) |
| `decompress` | `fflate.ungzip` for gz; bz2/xz throw; imports `pako` and `unzlib` without using them |

`extractTarMetadata` stops after 1,000,000 entries with a console warning.

## `src/lib/ArchiveReader.js`

Instantiated by `ArchiveViewerApp` but **never called**. `readEntries(data, fmt, offset, limit)`:
- ZIP: `fflate.unzip` decompresses every entry just to list names (whole archive in memory).
- TAR: always `ungzip`s non-plain tar (wrong for bz2/xz); `parseTarHeader` can return `null` and
  the loop then reads `entry.size` → `TypeError` (line 99).

## `src/lib/ArchiveWriter.js`

| Method | State |
|--------|-------|
| `createArchiveFromFiles(files, fmt)` | zip / tar / tar.gz; others throw |
| `createZip` | `fflate.zip` level 6, keyed by `file.name` (no folders) |
| `createTar` | Builds ustar headers; re-concatenates the whole buffer per file (O(n²)); names >100 bytes are truncated |
| `createTarGz` | `createTar` + `fflate.gzip` |
| `createTarHeader` | Mode 0644, uid/gid 0, octal size/mtime, checksum, `ustar` + `00` |
| `modifyArchive`, `addFilesToArchive`, `removeFilesFromArchive` | Throw "not implemented" |
| `createArchiveFromEntries` | Calls `extractEntry` (always throws), swallows errors per entry → returns an **empty ZIP** |
| `readFile` | `FileReader` → `Uint8Array` |
| `concatArrays` | Join `Uint8Array`s |

## `src/lib/UIManager.js`

Renders everything with template strings into `innerHTML` under `#app-content`.
- `render()` builds toolbar (refresh, create, download selected, share, search, sort), breadcrumb,
  status bar, loading overlay, file list, viewer, info panel; `attachEventListeners()`.
- `displayArchiveContents` → `buildFileTree(entries)` → `displayDirectory(tree, path)` (table with
  checkbox, name, size, actions). Directory and breadcrumb clicks call `app.loadArchiveMetadata()`
  again (full reparse per navigation).
- Sort dropdown sets `sortBy`, but no code sorts, so it has no effect. Search filters only file
  rows in the current folder.
- Info panel compression ratio divides by `uncompressedSize` (NaN/−∞ when 0, e.g. gz files).
- `showFileViewer`, `showFileEditor` (textarea + Save → `app.editFile`), `showCreateArchiveDialog`
  (format select + file input), `showShareDialog` (`execCommand('copy')`), notifications (3s toast).
- `escapeHtml` uses `textContent`→`innerHTML`, which **does not escape quotes**; several
  attributes interpolate paths unescaped. See [security](../known-issues/security.md).

## `src/styles/main.css`

Styles for the markup above; see [styles-and-i18n](styles-and-i18n.md).

## Root `index.html`

Standalone harness: loads `dist/app.js`, defines a `mockContext` (50MB fake zip at
`/path/to/test-archive.zip`, token `mock-token-123`, logging save/upload/share), then
`new ArchiveViewer().init(mockContext)`. Because the URL doesn't exist, loading fails at the first
Range fetch.
