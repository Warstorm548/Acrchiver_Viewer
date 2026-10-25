# Known Bugs and Limitations

**Confidence:** `CONFIRMED` = certain from the code (and, where noted, library/OpenCloud source or
docs); `PLAUSIBLE` = needs a test. Remove entries when fixed (and say so in the commit). K6 (English-only UI) was resolved in step 6.

## Current app

### Open bugs (review of PR #3)

- **R-1** `CONFIRMED` — xz and `.lzma` size the output buffer from the size recorded in the file
  (`recordedSize` in `src/engine/xz.ts`, the header size in `src/engine/lzmaAlone.ts`) before
  decoding, with no ratio check (gzip has `MAX_DEFLATE_RATIO`). A small crafted file claiming a
  huge size reserves up to `min(maxUncompressedSize, MAX_BUFFER_SIZE)` up front, which can give a
  false "not enough memory" error. Fix: cap the initial size (e.g. a multiple of the input size)
  and let `GrowableBuffer` grow.
- **R-2** `CONFIRMED` — `decompressInWorker` (`src/engine/workerClient.ts`) only adds its abort
  listener after reading the blob and importing the worker; an abort during those steps is missed
  and the worker runs to the end. Fix: reject at once if `signal.aborted` before adding the
  listener.
- **R-3** `PLAUSIBLE` — `isOutOfMemory` (`src/engine/buffer.ts`) also matches "invalid array
  length", which damaged data can raise too, so some corrupt archives may show "not enough free
  memory" instead of "damaged". Fix: drop that pattern if a test confirms it.

### Limitations

Known limitations (by design for now):

| #   | Limitation                                                                                                                                                                                                                                                | Planned                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| K1  | 7z and RAR show "not supported yet" (download offered); xz files using the ARM64 or RISC-V filter report "unsupported filter"                                                                                                                             | roadmap                      |
| K2  | Non-ZIP archives are downloaded whole into browser memory (up to `maxArchiveSize`, 1 GiB desktop / 128 MiB mobile); ZIPs are read by range since step 5                                                                                                   | roadmap (TAR header hopping) |
| K3  | Password-protected ZIP entries are listed but can't be previewed or downloaded                                                                                                                                                                            | roadmap                      |
| K4  | An extracted file is collected into one Blob, so single files and selections are capped at `maxEntrySize` (1 GiB / 256 MiB); bigger ones must be fetched by downloading the whole archive                                                                 | —                            |
| K5  | Deflate64 / bzip2 / LZMA compression _inside_ ZIP is unsupported (native zip.js build)                                                                                                                                                                    | —                            |
| K7  | Compressed formats are decoded in full in memory (no streaming): at most just under 2 GiB decompressed (`MAX_BUFFER_SIZE`, a browser limit); bzip2/xz/lzma take seconds — in a worker, or on the main thread (page frozen) under OpenCloud's built-in CSP | —                            |
| K8  | A tab that runs out of memory is killed by the OS ("Aw, Snap"); no error can be shown. The limits keep the peak near `archive + uncompressed` (gzip: 1.5 × `uncompressed`; about 512 MiB on mobile), but a busy low-memory device can still hit it        | —                            |

## Memory bugs found by browser testing (fixed)

Found by opening large archives in OpenCloud 8.0.1 with Chromium (see
[tests](../testing/tests.md#browser-memory-tests)):

- **M-1** xz/bzip2/lzma output over 1 GiB always failed: the buffer doubled to 2 GiB, which
  Chromium refuses → capped growth (`MAX_BUFFER_SIZE`), resizable buffers.
- **M-2** Failed allocations and blocked workers were reported as "damaged archive" → own
  `out-of-memory` message; blocked worker → main-thread fallback.
- **M-3** Under OpenCloud's built-in CSP, bzip2/xz/lzma never opened (blob worker blocked) →
  main-thread fallback.
- **M-4** A full download was only checked against the metadata size → bytes counted while
  downloading.
- **M-5** Peaks of 2–2.5× the limits (chunks + Blob + copies) crashed tabs on a 2 GB device →
  `BlobBuilder`, size hints, in-place growth; lower mobile limits.
- **M-6** Image previews the browser can't decode left an empty modal → `@error` message.

## Old viewer bugs (resolved)

The pre-v8 viewer (`ArchiveViewer.vue` / `ArchiveViewerLarge.vue`, deleted in step 3; see git
history before commit `619d40a`) had bugs V1–V18 and B4. They were avoided by design in the new
code:

- **V1** preview modal always shown → `PreviewModal` rendered only with a selected entry.
- **V2/V16** `global.gc` crash, broken streaming loop → no memory hacks; streamed `fetch`.
- **V3/V4** 100 MB truncation / double copies → size limit before download, single `Blob`.
- **V5/V6** flattened tree, grandchild folders → `buildIndex` with real paths, direct children only.
- **V7/V8** resource lookup / wrong `getFileContents` → `AppWrapperRoute` props + pre-signed `url`.
- **V9–V13, V18** batch-download quirks, page-wide errors, `confirm()` → one zip per selection,
  `showErrorMessage`, no native dialogs.
- **V14/B4** libarchive.js API/worker issues → libarchive.js not used.
- **V17** sizes ≥1 TB → `formatFileSize` from web-pkg.

Earlier removals: legacy JS app (L1–L11), webpack/Docker/install setup (B1–B3, D1–D4), old
`src/index.ts` (I1–I3), hand-written manifest (M3), metadata (M1–M2).

Security issues are tracked separately in [security](security.md).
