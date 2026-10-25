# Archive Engine — `src/engine/`

Reads archives entirely in the browser with **pure JavaScript** (no WebAssembly, so it runs under
OpenCloud's production CSP). Added in rework step 3. Formats: **ZIP, TAR, TAR.GZ / TGZ**.

## Modules

| File           | Role                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `types.ts`     | `ArchiveFormat`, `ArchiveEntry`, `ArchiveHandle`, `ArchiveLimits`, `ArchiveError` (+ `code`)           |
| `detect.ts`    | `archiveExtension(name)`, `sniffSignature(head)`, `resolveFormat(extension, head)`, `SIGNATURE_LENGTH` |
| `zip.ts`       | `openZip(blob)`, `configureZip({ useWebWorkers })` — zip.js native build                               |
| `tar.ts`       | `openTar(bytes, format?)` — own parser                                                                 |
| `gzip.ts`      | `gunzip(blob, maxSize)` — browser `DecompressionStream('gzip')`                                        |
| `tree.ts`      | `normalizePath`, `parentPath`, `buildIndex(entries)` → `ArchiveIndex`                                  |
| `fileTypes.ts` | `isTextFile`, `isImageFile`, `mimeTypeFor`, `extensionOf`                                              |
| `index.ts`     | `openArchive(blob, format, limits)` + re-exports                                                       |

## Data model

`ArchiveEntry`: `path` (normalized, no leading/trailing slash), `name`, `isDirectory`, `size`
(uncompressed), `compressedSize?`, `modified?`, `encrypted?`, `supported` (content readable).
`ArchiveHandle`: `format`, `entries`, `read(entry): Promise<Blob>` (blob carries a MIME type from
the file name), `close()`.

## Format detection (`detect.ts`)

- `archiveExtension` mirrors OpenCloud's web-client rule: `tar.gz`, `tar.bz2`, `tar.xz` count as
  one extension; otherwise the last part.
- `sniffSignature`: `PK\x03|\x05|\x07` → zip, `1f 8b` → gzip, `ustar` at byte 257 → tar.
- `resolveFormat` trusts **content over extension**: zip/tar signatures win; gzip is accepted only
  for `tar.gz`/`tgz`; signature-less (pre-POSIX) tar accepted on the `tar` extension. Anything else
  → `ArchiveError('unsupported-format')` (e.g. `.gz`, `.bz2`, `.xz`, `.7z`, `.rar` — step 4+).

## ZIP (`zip.ts`)

- Imports from `@zip.js/zip.js/lib/zip-native.js`: the **native** build has no WebAssembly and
  decompresses with `DecompressionStream` in an inline `blob:` worker (allowed by
  `worker-src 'self' blob:`). The default zip.js build would load `zip-module.wasm` and fail under
  the production CSP.
- Supports ZIP64. Supported methods: stored (0) and deflate (8); others (e.g. Deflate64, bzip2,
  LZMA inside zip) → `supported: false`. Encrypted entries are listed with `encrypted: true` and
  `supported: false` (no password prompt yet). Symlinks → unsupported.
- `configureZip({ useWebWorkers: false })` is used in tests (no workers in happy-dom).

## TAR (`tar.ts`)

- 512-byte headers with checksum validation (`corrupt` error on mismatch); stops at the first
  zero block; `corrupt` "truncated" error if data runs past the end.
- Names: ustar `prefix` + `name`, GNU long names (`L` records), pax `x` records (`path`, `size`,
  `mtime`); global pax (`g`) and GNU long link (`K`) ignored. Sizes in octal or GNU base-256.
- Types: `0`/`7` file, `5` directory; everything else (symlinks, hard links, devices) listed as
  `supported: false`.
- Reads return blobs over the original bytes (no extra decompression).

## GZIP (`gzip.ts`)

Streams through `DecompressionStream('gzip')` and **aborts once output exceeds `maxSize`**
(`ArchiveError('too-large')`) — the zip-bomb guard for `.tar.gz`. Invalid data → `corrupt`.

## Folder index (`tree.ts`)

`buildIndex` synthesizes missing parent folders (many archives omit them), keeps the first of
duplicate paths, and offers `children(folder)` (direct children only), `get(path)`,
`filesBelow(folder)`. `normalizePath` turns backslashes into slashes and drops empty / `.`
segments; `..` is kept as display text (nothing is ever written to disk).

## Limits

| Limit                 | Default                    | Where enforced                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------- |
| `maxArchiveSize`      | 256 MiB                    | `App.vue`, before downloading (see [viewer-ui](viewer-ui.md)) |
| `maxUncompressedSize` | 1 GiB                      | `gunzip` while decompressing `.tar.gz`                        |
| Preview size          | 10 MiB declared entry size | `PreviewModal.vue`                                            |
| Text shown            | first 1 MiB                | `PreviewModal.vue`                                            |

Known gap: ZIP entry sizes come from the archive's own (untrusted) headers; a single huge entry is
only bounded by the preview cap and by what the user chooses to download.

## Tests

`tests/unit/engine/*.spec.ts` (tar, zip, gzip, tree, detect) with an in-test tar builder
(`tarBuilder.ts`) and zip.js `ZipWriter`. See [tests](../testing/tests.md).

## When changing

Update this doc, [viewer-ui](viewer-ui.md), [dependencies](../tech-stack/dependencies.md) and
[security](../known-issues/security.md).
