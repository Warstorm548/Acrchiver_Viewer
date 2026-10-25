# Archive Engine — `src/engine/`

Reads archives entirely in the browser with **pure JavaScript** (no WebAssembly, so it runs under
OpenCloud's production CSP). Step 3 added ZIP, TAR, TAR.GZ/TGZ; step 4 added bzip2 and single
compressed files; step 4b added XZ and legacy LZMA (details:
[xz-lzma-decoder](xz-lzma-decoder.md)).

## Formats

| Format (`ArchiveFormat`) | Extensions                                                     | Signature                                    | Reader                                                        |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `zip`                    | zip                                                            | `PK\x03\|\x05\|\x07`                         | zip.js native build                                           |
| `tar`                    | tar                                                            | `ustar` at byte 257 (or none: pre-POSIX tar) | `tar.ts`                                                      |
| `tar.gz`                 | tar.gz, tgz                                                    | `1f 8b`                                      | `gunzip` → `tar.ts`                                           |
| `tar.bz2`                | tar.bz2, tbz2, tbz                                             | `BZh`                                        | worker `bzip2` → `tar.ts`                                     |
| `tar.xz`                 | tar.xz, txz                                                    | `FD 37 7A 58 5A 00`                          | worker `xz` → `tar.ts`                                        |
| `gz`                     | gz                                                             | `1f 8b`                                      | `gunzip` → tar if the content is a tar, else one-file archive |
| `bz2`                    | bz2                                                            | `BZh`                                        | worker `bzip2` → tar or one-file archive                      |
| `xz`                     | xz                                                             | `FD 37 7A 58 5A 00`                          | worker `xz` → tar or one-file archive                         |
| `lzma`                   | lzma, tlz (and `.tar.lzma`, which OpenCloud reports as `lzma`) | none (header plausibility)                   | worker `lzma` → tar or one-file archive                       |

Not supported: `7z`, `rar` (roadmap) → `ArchiveError('unsupported-format')`.

## Modules

| File                              | Role                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `types.ts`                        | `ArchiveFormat`, `ArchiveEntry`, `ArchiveHandle`, `ArchiveLimits`, `ArchiveError` (+ `code`)                  |
| `detect.ts`                       | `archiveExtension(name)`, `sniffSignature(head)`, `resolveFormat(extension, head)`, `SIGNATURE_LENGTH`        |
| `zip.ts`                          | `openZip(blob)`, `configureZip({ useWebWorkers })` — zip.js native build                                      |
| `tar.ts`                          | `openTar(bytes, format?)` — own parser                                                                        |
| `gzip.ts`                         | `gunzip(blob, maxSize)` (browser `DecompressionStream`), `readGzipHeader(bytes)`                              |
| `bzip2.ts`                        | `bunzip2(bytes, maxSize)` — TypeScript port of seek-bzip (MIT)                                                |
| `xz.ts`, `lzmaAlone.ts`, `lzma/*` | XZ container, legacy `.lzma`, LZMA/LZMA2 decoder, filters, checks — see [xz-lzma-decoder](xz-lzma-decoder.md) |
| `decompressors.ts`                | `decompress(kind, bytes, maxSize)` for `bzip2` / `xz` / `lzma`                                                |
| `decompress.worker.ts`            | Web Worker running `decompress`                                                                               |
| `workerClient.ts`                 | `decompressAsync(kind, blob, maxSize)` — worker when available, main thread otherwise                         |
| `single.ts`                       | `openSingleFile`, `singleFileName`                                                                            |
| `tree.ts`                         | `normalizePath`, `parentPath`, `buildIndex(entries)` → `ArchiveIndex`                                         |
| `fileTypes.ts`                    | `isTextFile`, `isImageFile`, `mimeTypeFor`, `extensionOf`                                                     |
| `index.ts`                        | `openArchive(blob, format, limits, archiveName)`, `isCompressedFormat` + re-exports                           |

## Data model

`ArchiveEntry`: `path` (normalized, no leading/trailing slash), `name`, `isDirectory`, `size`
(uncompressed), `compressedSize?`, `modified?`, `encrypted?`, `supported` (content readable).
`ArchiveHandle`: `format`, `entries`, `read(entry): Promise<Blob>` (blob carries a MIME type from
the file name), `close()`.

## Format detection (`detect.ts`)

- `archiveExtension` mirrors OpenCloud's web-client rule: `tar.gz`, `tar.bz2`, `tar.xz` count as
  one extension; otherwise the last part.
- `resolveFormat` trusts **content over extension**: zip/tar signatures always win; gzip, bzip2
  and xz signatures are accepted for their tar and single-file extensions; signature-less tar is
  accepted on `tar`; legacy `.lzma` (no magic) on `lzma`/`tlz` when `looksLikeLzmaAlone` accepts
  the header. A compressor mismatch (e.g. gzip data named `.bz2`) is unsupported.

## ZIP (`zip.ts`)

Imports only from `@zip.js/zip.js/lib/zip-native.js` (no WebAssembly; decompression via
`DecompressionStream` in an inline `blob:` worker — the default build would load
`zip-module.wasm`). ZIP64 supported; methods stored (0) and deflate (8); others, encrypted entries
and symlinks → `supported: false`. `configureZip({ useWebWorkers: false })` in tests.

## TAR (`tar.ts`)

512-byte headers with checksum validation; stops at the first zero block; truncated data →
`corrupt`. Names from ustar `prefix`+`name`, GNU `L` long names, pax `x` records (`path`, `size`,
`mtime`); `g`/`K` ignored. Sizes in octal or GNU base-256. Types `0`/`7` file, `5` directory,
everything else listed as unsupported. Reads return blobs over the original bytes.

## GZIP (`gzip.ts`)

`gunzip` streams through `DecompressionStream('gzip')` and **aborts once the output exceeds
`maxSize`** (`ArchiveError('too-large')`); invalid data → `corrupt`. `readGzipHeader` returns the
optional stored original file name (FNAME) and modification time (RFC 1952).

## BZIP2 (`bzip2.ts`)

Port of seek-bzip's decoder (bit reader, Huffman/MTF, Burrows-Wheeler, final RLE, block and
stream CRC checks); multi-stream files supported; trailing non-bzip2 bytes ignored like GNU bzip2.
Reading past the end → `corrupt`; output past `maxSize` → `too-large`. Verified byte-for-byte
against Python's `bz2` (libbz2), including multi-block data.

## Worker (`decompress.worker.ts`, `workerClient.ts`)

bzip2, xz and lzma decoding is CPU-heavy and synchronous, so `decompressAsync` runs it in a
worker imported lazily with Vite `?worker&inline`: the worker code is embedded in a chunk and
started from a **`blob:` URL** (allowed by `worker-src 'self' blob:`; Vite's `data:` URL path is
only a fallback when blob workers fail). Buffers are transferred, not copied. Without `Worker`
(unit tests) it decodes on the main thread.

## Single compressed files (`single.ts`, `index.ts`)

After decompressing `gz`/`bz2`/`xz`/`lzma`, the content is sniffed: a tar signature → opened as tar
(e.g. `archive-in-disguise.gz`, `.tar.lzma`); otherwise one entry, named from the gzip-stored
original name (basename only) or the archive name minus `.gz`/`.bz2`/`.xz`/`.lzma` (fallback
`<name>.out`); its date is the gzip MTIME when present.

## Folder index (`tree.ts`)

`buildIndex` synthesizes missing parent folders, keeps the first of duplicate paths, and offers
`children(folder)` (direct children only), `get(path)`, `filesBelow(folder)`. `normalizePath`
turns backslashes into slashes and drops empty / `.` segments; `..` stays display text.

## Limits

| Limit                 | Default                    | Where enforced                                                 |
| --------------------- | -------------------------- | -------------------------------------------------------------- |
| `maxArchiveSize`      | 256 MiB                    | `App.vue`, before downloading (see [viewer-ui](viewer-ui.md))  |
| `maxUncompressedSize` | 1 GiB                      | every decompressor (gzip, bzip2, xz, lzma) while decompressing |
| Preview size          | 10 MiB declared entry size | `PreviewModal.vue`                                             |
| Text shown            | first 1 MiB                | `PreviewModal.vue`                                             |

Known gap: ZIP entry sizes come from the archive's own headers; a huge entry is only bounded by the
preview cap and by what the user chooses to download.

## Tests

`tests/unit/engine/*.spec.ts` (tar, zip, gzip, bzip2, xz, single, tree, detect), helpers
`tarBuilder.ts`, `bzip2Samples.ts` (libbz2 output) and `xzSamples.ts` (liblzma output). See
[tests](../testing/tests.md).

## When changing

Update this doc, [xz-lzma-decoder](xz-lzma-decoder.md), [viewer-ui](viewer-ui.md),
[dependencies](../tech-stack/dependencies.md), [security](../known-issues/security.md) and
`THIRD-PARTY-NOTICES.md` for ported code.
