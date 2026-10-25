# Viewer UI — `src/App.vue`, `src/components/`, `src/download.ts`

The user-facing viewer built in rework step 3 (replacing the step 1 placeholder and the old
pre-v8 view, whose useful UI was ported and then deleted).

## `App.vue` — loading flow

Rendered by `AppWrapperRoute` (see [extension-entry](extension-entry.md)). Props:
`resource` (`Resource`), `url` (pre-signed download URL), `applicationConfig`, `space` and
`getUrlForResource` (used to renew the signed URL). Declaring `url` (not `currentContent`) means
the wrapper downloads nothing itself. Limits come from `resolveLimits(applicationConfig)`
(desktop / mobile, see [zip-range-reading](zip-range-reading.md)).

0. **ZIP range mode** (extension `zip`, `url` not `blob:`): read by HTTP Range requests, no
   archive size limit, status "Reading archive index…"; falls back to the steps below only if the
   server ignores Range. Details: [zip-range-reading](zip-range-reading.md).
1. **Size check**: `resource.size > limits.archive` → state `too-large`: message with the limit
   ("the most this viewer opens in the browser on this device") + "Download archive" button
   (`oc-button type="a" :href="url"`). No download happens.
2. **Download**: `fetch(url)` read as a stream into a `BlobBuilder` (blob store, 16 MiB parts);
   `loaded` bytes drive "Downloading… N%". The bytes are counted against `limits.archive` too
   (the metadata size can be wrong or missing): over it → cancelled, state `too-large`. An
   `AbortController` cancels it, and stops a running decompression worker, when the component
   unmounts or `url`/`resource.id` change.
3. **Detect**: first `SIGNATURE_LENGTH` bytes + `archiveExtension(resource.name)` →
   `resolveFormat`.
4. **Open**: `openArchive(blob, format, { maxUncompressedSize, maxEntrySize }, resource.name,
signal)` →
   state `ready` → `<archive-browser>`. For compressed formats (`isCompressedFormat`: everything
   except zip and tar) the loading text switches to "Decompressing…" first; bzip2/xz/lzma run in a
   Web Worker so the page stays responsive (on the main thread if the CSP blocks the worker).
5. **Errors** → state `error` with a message per `ArchiveError.code` (unsupported format, too
   large when decompressed, not enough free memory — `out-of-memory` or a failed-allocation
   `RangeError` —, damaged) or "could not be loaded" (HTTP/network), plus the download button.

Config keys (`apps.yaml` / manifest): `maxArchiveSize`, `maxUncompressedSize`, `maxEntrySize` and
their `…Mobile` variants; invalid values fall back to the defaults (1 GiB / 2 GiB / 1 GiB desktop,
128 / 384 / 256 MiB mobile), which are also published in `src/manifest.json` →
`dist/manifest.json` `config`.

## `components/ArchiveBrowser.vue`

Props `handle`, `archiveName`, `maxEntrySize`, `bytesRead` (range bytes fetched so far). Builds
`buildIndex(handle.entries)`. All reads go through `readEntry`, which refuses entries whose
declared size is over `maxEntrySize` and shows "Extracting <name>… N%" while a read runs.

- **Toolbar**: `oc-text-input` "Search in archive" (clear button) and "Download selected (n)".
- **Breadcrumb**: archive name as root, then folder segments; hidden while searching (a result
  count is shown instead).
- **Table**: select-all + per-row `oc-checkbox` (hidden labels), sortable Name / Size / Modified
  (folders always first, numeric-aware name compare as tie-breaker), actions column.
- **Search** covers the whole archive (case-insensitive substring on names); each hit shows its
  folder path under the name.
- **Rows**: click a folder → open it; click a file → preview. Unsupported entries are dimmed;
  encrypted ones get a lock icon. Eye button only for text/image files; download button only for
  readable files.
- **Download**: single file → `triggerDownload(blob, name)`. Selection → files plus everything
  inside selected folders (readable only); one file is downloaded directly, several are packed
  by `zipEntries` into `<archive>-selection.zip` (archive name minus its extension as computed by
  `archiveExtension`, e.g. `large.tar.bz2` → `large-selection.zip`). A selection whose declared
  total is over `maxEntrySize` is refused before anything is read.
- Failures → `useMessages().showErrorMessage` (host notification); `too-large` errors are replaced
  by a message naming the device limit, memory failures by "not enough free memory".

## `components/PreviewModal.vue`

`oc-modal` with `hide-actions` and its own Download / Close buttons (design-system 8.0.0 has no
custom cancel text). Text types are decoded with `TextDecoder` (first 1 MiB, with a "beginning
only" note); images via `<img :src="blob:…">` (URL revoked on close); if the browser can't decode
the image (`@error`: damaged, or too many pixels — Chromium refuses a 30000×30000 PNG this way
rather than crashing) it shows "This image could not be displayed". Messages for: unsupported or
encrypted entries, types without preview, entries over 10 MiB, read failures. Reads use the
browser's `read` prop (`readEntry`, with cap and progress), falling back to `handle.read`.

## `download.ts`

- `sanitizeFileName`: replaces `/`, `\` and control characters (names come from the archive).
- `triggerDownload`: temporary `<a download>`, URL revoked after 60 s.
- `zipEntries(handle, files)`: zip.js native `ZipWriter`, entries added one at a time under their
  archive paths made safe by `selectionPath` (trims segments, drops `.`/`..`, sanitizes the rest, numbers
  clashes as `name (2).ext`).

## Styling

Tailwind via `import '@opencloud-eu/extension-sdk/tailwind.css'` in `src/index.ts`. The SDK
generates utilities with the **`ext:` prefix** (`ext:flex`, `ext:hover:underline`), so they can't
clash with the host's CSS. Own hook classes use the `archive-` prefix (also used by tests). Colours
come from OpenCloud role tokens (e.g. `ext:hover:bg-role-surface-container`). See
[styles-and-i18n](styles-and-i18n.md).

## Tests

`tests/unit/App.spec.ts` and `tests/unit/ArchiveBrowser.spec.ts`; see [tests](../testing/tests.md).

## When changing

Update this doc, [archive-engine](archive-engine.md) for engine changes, and
[styles-and-i18n](styles-and-i18n.md) for new strings.
