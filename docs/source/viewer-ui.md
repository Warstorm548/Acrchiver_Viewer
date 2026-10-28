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

**Server helper** (0.3.0, [archive-helper overview](archive-helper/overview.md)): instead of
step 1's "too large" message, and when step 2/4 fails with `too-large` / out of memory, `load()`
calls `tryServer()`. It is used only if `usableHelper()` finds all of: `archiveHelperUrl` set
(same-origin path, `resolveHelperUrl`), a login token (`useAuthStore().accessToken`; public
links have none), a WebDAV path (`resource.webDavPath`, else `space.webDavPath` + `resource.path`),
an extension it reads (`HELPER_EXTENSIONS`: TAR family, single compressed files, ZIP, 7z), and a
`GET /health` answer (checked once per viewer; any failure → null → browser behaviour unchanged).
`openOnServer` posts the session, polls its status every second ("Preparing the archive on the
server… N%" while copying, "Reading the archive on the server… N%" while scanning) with a
**Cancel** button (state `cancelled`: message + "Open again" + "Download archive"), then starts
the heartbeat and renders `<archive-browser :remote>`. Helper error codes get their own messages
(server busy, too many large archives open, larger than the server allows, too complex,
password-protected, changed, generic). 0.4.0 adds three routes
([zip-and-7z](archive-helper/zip-and-7z.md)): **7z** (`HELPER_ONLY`) goes to `tryServer()` first
at any size, else "can only be opened when the server helper is installed" without downloading;
a **ZIP over `maxArchiveSize`** tries the helper before range mode, and a **range-listed ZIP with
`needsServer` entries** moves to the helper once it is ready. For ZIPs, `tryServerOrRange()` turns
a helper failure into a notice above the listing (`archive-viewer-notice`) and range mode, and
`serverFailed` stops a second attempt in the same load. Helper entries with `localTime` (a ZIP's
DOS date) are shown in the user's zone (`toArchiveEntry` in `remote.ts`). A lost session (heartbeat 404) switches to an error asking to reload. `closeArchive`
closes the session on unmount/reload/cancel.

Config keys (`apps.yaml` / manifest): `maxArchiveSize`, `maxUncompressedSize`, `maxEntrySize` and
their `…Mobile` variants; invalid values fall back to the defaults (1 GiB / 2 GiB / 1 GiB desktop,
128 / 384 / 256 MiB mobile), which are also published in `src/manifest.json` →
`dist/manifest.json` `config`. `archiveHelperUrl` (default `/archive-api`; `""` or anything not
starting with a single `/` turns the helper off).

## `components/ArchiveBrowser.vue`

Props `handle` **or** `remote` (a `RemoteArchive`, server helper mode), `archiveName`,
`maxEntrySize`, `bytesRead` (range bytes fetched so far). With `handle` it builds
`buildIndex(handle.entries)` and everything below is synchronous, as before. All reads go through
`readEntry`, which refuses entries whose declared size is over `maxEntrySize` and shows
"Extracting <name>… N%" while a read runs.

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
  total is over `maxEntrySize` is refused before anything is read; while packing, the **real**
  bytes are capped at `maxEntrySize` as well (see `zipEntries` below).
- Failures → `useMessages().showErrorMessage` (host notification); `too-large` errors are replaced
  by a message naming the device limit, memory failures by "not enough free memory".
- **Server mode** (`remote`): rows are the current folder's pages from the server (sorted there;
  a sort change reloads; opening another folder clears the rows until its page arrives, so no
  stale rows can be clicked; "Show more (n of total)" loads the next 500), search runs on the server
  300 ms after typing stops ("Showing the first N results" when capped), a spinner shows while a
  page loads. Downloads (`downloadOnServer`) ask the helper for size and caps first, show an
  `oc-modal` "Download X?" (files + total, "make sure your device has enough free space") when
  `confirm` is set, then follow a single-use link with `triggerUrlDownload`. Helper error codes
  (`download-too-large` with size and limit, `too-many-downloads`, closed session, nothing to
  download) get their own messages.

## `components/PreviewModal.vue`

`oc-modal` with `hide-actions` and its own Download / Close buttons (design-system 8.0.0 has no
custom cancel text). Text types are decoded with `TextDecoder` (first 1 MiB, with a "beginning
only" note); images via `<img :src="blob:…">` (URL revoked on close); if the browser can't decode
the image (`@error`: damaged, or too many pixels — Chromium refuses a 30000×30000 PNG this way
rather than crashing) it shows "This image could not be displayed". Messages for: unsupported or
encrypted entries, types without preview, entries over 10 MiB, read failures. Reads use the
browser's `read` prop (`readEntry`, with cap and progress; in server mode it reads through the
helper), falling back to `handle.read` (`handle` is null in server mode).

## `download.ts`

- `sanitizeFileName`: replaces `/`, `\` and control characters (names come from the archive).
- `triggerDownload`: temporary `<a download>`, URL revoked after 60 s.
- `triggerUrlDownload(url, name)`: the same for a same-origin URL (the helper's single-use links);
  the browser saves the file as it arrives, so its size isn't limited by memory.
- `zipEntries(handle, files, maxTotal)`: zip.js native `ZipWriter`, entries added one at a time
  (each `handle.read(file, maxTotal − bytes so far)`, so a read stops at what is left of the
  allowance; over it → `too-large`, writer closed) under their
  archive paths made safe by `selectionPath` (trims segments, drops `.`/`..`, sanitizes the rest, numbers
  clashes as `name (2).ext`).

## Styling

Tailwind via `import '@opencloud-eu/extension-sdk/tailwind.css'` in `src/index.ts`. The SDK
generates utilities with the **`ext:` prefix** (`ext:flex`, `ext:hover:underline`), so they can't
clash with the host's CSS. Own hook classes use the `archive-` prefix (also used by tests). Colours
come from OpenCloud role tokens (e.g. `ext:hover:bg-role-surface-container`). See
[styles-and-i18n](styles-and-i18n.md).

## Tests

`tests/unit/App.spec.ts`, `AppHelper.spec.ts` (server mode), `ArchiveBrowser.spec.ts`,
`ArchiveBrowserRemote.spec.ts` and `helper/*.spec.ts`; see [tests](../testing/tests.md).

## When changing

Update this doc, [archive-engine](archive-engine.md) for engine changes, and
[styles-and-i18n](styles-and-i18n.md) for new strings.
