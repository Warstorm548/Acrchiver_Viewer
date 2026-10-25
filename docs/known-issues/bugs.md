# Known Bugs and Limitations

**Confidence:** `CONFIRMED` = certain from the code (and, where noted, library/OpenCloud source or
docs); `PLAUSIBLE` = needs a test. Remove entries when fixed (and say so in the commit).

## Current app

No known bugs. Known limitations (by design for now):

| #   | Limitation                                                                                                           | Planned                |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| K1  | XZ, TAR.XZ, 7z, RAR show "not supported yet" (download offered)                                                      | step 4b (XZ) / roadmap |
| K2  | Whole archive is downloaded into browser memory (up to `maxArchiveSize`, default 256 MiB)                            | step 5 (ZIP)           |
| K3  | Password-protected ZIP entries are listed but can't be previewed or downloaded                                       | roadmap                |
| K4  | ZIP entry sizes come from the archive's own headers; only previews (10 MiB) are capped, not user-requested downloads | —                      |
| K5  | Deflate64 / bzip2 / LZMA compression _inside_ ZIP is unsupported (native zip.js build)                               | —                      |
| K6  | New UI strings are English-only until translation tooling exists                                                     | step 6                 |
| K7  | bzip2 is decoded in full in memory (no streaming); large `.tar.bz2` files take seconds (in a worker)                 | —                      |

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
