# Viewer UI — `src/App.vue`, `src/components/`, `src/download.ts`

The user-facing viewer built in rework step 3 (replacing the step 1 placeholder and the old
pre-v8 view, whose useful UI was ported and then deleted).

## `App.vue` — loading flow

Rendered by `AppWrapperRoute` (see [extension-entry](extension-entry.md)). Props:
`resource` (`Resource`), `url` (pre-signed download URL), `applicationConfig`. Declaring `url`
(not `currentContent`) means the wrapper downloads nothing itself.

1. **Size check**: `resource.size > maxArchiveSize` → state `too-large`: message with the limit +
   "Download archive" button (`oc-button type="a" :href="url"`). No download happens.
2. **Download**: `fetch(url)` read as a stream, `loaded` bytes drive "Downloading… N%".
   An `AbortController` cancels it when the component unmounts or `url`/`resource.id` change.
3. **Detect**: first `SIGNATURE_LENGTH` bytes + `archiveExtension(resource.name)` →
   `resolveFormat`.
4. **Open**: `openArchive(blob, format, { maxUncompressedSize }, resource.name)` → state `ready`
   → `<archive-browser>`. For compressed formats (`isCompressedFormat`: tar.gz, tar.bz2, gz, bz2)
   the loading text switches to "Decompressing…" first; bzip2 runs in a Web Worker so the page
   stays responsive.
5. **Errors** → state `error` with a message per `ArchiveError.code` (unsupported format, too
   large when decompressed, damaged) or "could not be loaded" (HTTP/network), plus the download
   button.

Config (from `apps.yaml` / manifest): `maxArchiveSize` (default 256 MiB = 268435456),
`maxUncompressedSize` (default 1 GiB = 1073741824); non-positive or invalid values fall back to the
defaults. Defaults are also published in `src/manifest.json` → `dist/manifest.json` `config`.

## `components/ArchiveBrowser.vue`

Props `handle`, `archiveName`. Builds `buildIndex(handle.entries)`.

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
  `archiveExtension`, e.g. `large.tar.bz2` → `large-selection.zip`).
- Failures → `useMessages().showErrorMessage` (host notification).

## `components/PreviewModal.vue`

`oc-modal` with `hide-actions` and its own Download / Close buttons (design-system 8.0.0 has no
custom cancel text). Text types are decoded with `TextDecoder` (first 1 MiB, with a "beginning
only" note); images via `<img :src="blob:…">` (URL revoked on close). Messages for: unsupported or
encrypted entries, types without preview, entries over 10 MiB, read failures.

## `download.ts`

- `sanitizeFileName`: replaces `/`, `\` and control characters (names come from the archive).
- `triggerDownload`: temporary `<a download>`, URL revoked after 60 s.
- `zipEntries(handle, files)`: zip.js native `ZipWriter`, entries added one at a time, keeping
  their archive paths.

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
