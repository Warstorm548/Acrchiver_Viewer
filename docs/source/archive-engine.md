# Archive Engine — `src/engine/`

Reads archives entirely in the browser with **pure JavaScript** (no WebAssembly, so it runs under
OpenCloud's production CSP). Step 3 added ZIP, TAR, TAR.GZ/TGZ; step 4 added bzip2 and single
compressed files; step 4b added XZ and legacy LZMA (details:
[xz-lzma-decoder](xz-lzma-decoder.md)); step 5 added range reads for ZIP (details:
[zip-range-reading](zip-range-reading.md)).

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

| File                              | Role                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                        | `ArchiveFormat`, `ArchiveEntry`, `ArchiveHandle`, `ArchiveLimits`, `ArchiveError` (+ `code`)                               |
| `buffer.ts`                       | `GrowableBuffer`, `BlobBuilder`, `blobFromBytes`, `MAX_BUFFER_SIZE`, `isOutOfMemory`, `toArchiveError` — [Memory](#memory) |
| `detect.ts`                       | `archiveExtension(name)`, `sniffSignature(head)`, `resolveFormat(extension, head)`, `SIGNATURE_LENGTH`                     |
| `zip.ts`                          | `openZip(blob or Reader, { maxEntrySize })`, `configureZip({ useWebWorkers })` — zip.js native build                       |
| `rangeReader.ts`                  | `HttpRangeReader` (zip.js Reader over HTTP Range), `RangeRequestError`                                                     |
| `tar.ts`                          | `openTar(bytes, format?)` — own parser                                                                                     |
| `gzip.ts`                         | `gunzip(blob, maxSize)` (browser `DecompressionStream`), `readGzipHeader(bytes)`                                           |
| `bzip2.ts`                        | `bunzip2(bytes, maxSize)` — TypeScript port of seek-bzip (MIT)                                                             |
| `xz.ts`, `lzmaAlone.ts`, `lzma/*` | XZ container, legacy `.lzma`, LZMA/LZMA2 decoder, filters, checks — see [xz-lzma-decoder](xz-lzma-decoder.md)              |
| `decompressors.ts`                | `decompress(kind, bytes, maxSize)` for `bzip2` / `xz` / `lzma`                                                             |
| `decompress.worker.ts`            | Web Worker running `decompress`                                                                                            |
| `workerClient.ts`                 | `decompressAsync(kind, blob, maxSize, signal?)` — worker when it can run, main thread otherwise                            |
| `single.ts`                       | `openSingleFile`, `singleFileName`                                                                                         |
| `tree.ts`                         | `normalizePath`, `parentPath`, `buildIndex(entries)` → `ArchiveIndex`                                                      |
| `fileTypes.ts`                    | `isTextFile`, `isImageFile`, `mimeTypeFor`, `extensionOf`                                                                  |
| `index.ts`                        | `openArchive(blob, format, limits, archiveName, signal?)`, `isCompressedFormat` + re-exports                               |

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
  the header. Any other gzip, bzip2 or xz data (e.g. gzip named `.bz2`, `.tar` or `.zip`) opens
  as the single-file format `gz`/`bz2`/`xz`; a tar inside is still recognized after
  decompression. A `.zip` holding gzip data is therefore downloaded and opened by content.

## ZIP (`zip.ts`)

Imports only from `@zip.js/zip.js/lib/zip-native.js` (no WebAssembly; decompression via
`DecompressionStream` in an inline `blob:` worker — the default build would load
`zip-module.wasm`). ZIP64 supported; methods stored (0) and deflate (8); others, encrypted entries
and symlinks → `supported: false`. `configureZip({ useWebWorkers: false })` in tests. Opens a
`Blob` or any zip.js `Reader` (`HttpRangeReader`); `chunkSize` 4 MiB. `read` is capped at
`maxEntrySize` on the real output bytes (`readLimited`), which streams into a `BlobBuilder`; zip.js
errors while extracting → `corrupt` (failed allocations → `out-of-memory`).

## TAR (`tar.ts`)

512-byte headers with checksum validation; sizes must be non-negative whole numbers (else
`corrupt`); stops at the first zero block; truncated data →
`corrupt`. Names from ustar `prefix`+`name`, GNU `L` long names, pax `x` records (`path`, `size`,
`mtime`); `g`/`K` ignored. Sizes in octal or GNU base-256. Types `0`/`7` file, `5` directory,
everything else listed as unsupported. Reads return blobs copied from the original bytes (`blobFromBytes`). Each member's data range is kept per entry
(and per path, last member wins), so every listed member reads its own data.

## GZIP (`gzip.ts`)

`gunzip` streams through `DecompressionStream('gzip')` into one `GrowableBuffer` sized from the
trailer's ISIZE (ignored when it implies more than deflate's ~1032:1 ratio; multi-member files just
grow), and **aborts once the output exceeds `maxSize`** (`ArchiveError('too-large')`); invalid data
→ `corrupt`. `readGzipHeader` returns the
optional stored original file name (FNAME) and modification time (RFC 1952).

## BZIP2 (`bzip2.ts`)

Port of seek-bzip's decoder (bit reader, Huffman/MTF, Burrows-Wheeler, final RLE, block and
stream CRC checks); multi-stream files supported; trailing non-bzip2 bytes ignored like GNU bzip2.
Reading past the end → `corrupt`; output past `maxSize` → `too-large`. Verified byte-for-byte
against Python's `bz2` (libbz2), including multi-block data.

## Worker (`decompress.worker.ts`, `workerClient.ts`)

bzip2, xz and lzma decoding is CPU-heavy and synchronous, so `decompressAsync` runs it in a
worker imported lazily with Vite `?worker&inline`: the worker code is embedded in a chunk and
started from a **`blob:` URL** (allowed by `worker-src 'self' blob:`). Buffers are transferred,
not copied. Errors while decoding come back as messages (`toArchiveError` in the worker), so the
worker's `error` event means it never ran — e.g. OpenCloud's **built-in** CSP (no `csp.yaml`) has
no `worker-src` and falls back to `child-src 'self'`, which blocks `blob:` workers. Then, and
without `Worker` (unit tests), it decodes on the main thread: slower, the page freezes meanwhile,
but the archive opens. The input is read from the blob again, since the first copy was
transferred. An `error` event whose message says the worker ran out of memory is reported as
`out-of-memory` instead (retrying on the main thread wouldn't help). Aborting the `signal` (closing or switching the file) terminates the worker.

## Single compressed files (`single.ts`, `index.ts`)

After decompressing `gz`/`bz2`/`xz`/`lzma`, the content is sniffed: a tar signature → opened as tar
(e.g. `archive-in-disguise.gz`, `.tar.lzma`); otherwise one entry, named from the gzip-stored
original name (basename only) or the archive name minus `.gz`/`.bz2`/`.xz`/`.lzma` (fallback
`<name>.out`); its date is the gzip MTIME when present.

## Folder index (`tree.ts`)

`buildIndex` synthesizes missing parent folders, keeps the **last** of duplicate paths (as `tar`
extracts and as the tar/zip readers return; a file and a folder sharing a path keep the first), and offers
`children(folder)` (direct children only), `get(path)`, `filesBelow(folder)`. `normalizePath`
turns backslashes into slashes and drops empty / `.` segments; `..` stays display text (and is dropped
when writing the selection zip, see [viewer-ui](viewer-ui.md)).

## Limits

| Limit                 | Default                    | Where enforced                                                 |
| --------------------- | -------------------------- | -------------------------------------------------------------- |
| `maxArchiveSize`      | 1 GiB / 128 MiB mobile     | `App.vue`, before and during a full download (not ranged ZIPs) |
| `maxUncompressedSize` | 2 GiB / 384 MiB mobile     | every decompressor (gzip, bzip2, xz, lzma) while decompressing |
| `MAX_BUFFER_SIZE`     | 2 GiB − 16 MiB             | `GrowableBuffer`: caps `maxUncompressedSize` (see below)       |
| `maxEntrySize`        | 1 GiB / 256 MiB mobile     | `zip.ts` `readLimited`, `ArchiveBrowser` (file and selection)  |
| Preview size          | 10 MiB declared entry size | `PreviewModal.vue`                                             |
| Text shown            | first 1 MiB                | `PreviewModal.vue`                                             |

Limits are resolved per device by `src/limits.ts` (see [zip-range-reading](zip-range-reading.md)).

## Memory

Measured in Chromium 153 inside OpenCloud 8.0.1 (October 2026). Chromium refuses any single
ArrayBuffer of **2 GiB − 2 MiB** or more, whatever memory is free, so decompressed data can't
exceed `MAX_BUFFER_SIZE` (bigger → `too-large`). When a tab runs out of memory the OS kills it
("Aw, Snap"); nothing can be caught, so the limits must keep the peak low. `buffer.ts`:

- `GrowableBuffer` (gzip, bzip2, LZMA/XZ outputs) starts at the recorded decompressed size when
  the format has one (xz index — `recordedSize` in `xz.ts`; `.lzma` header; gzip ISIZE) and grows
  by 1.5×. It uses a **resizable ArrayBuffer** (`maxByteLength` = limit), which grows and shrinks
  in place, so the peak is about the data size; browsers without them copy on growth.
  **Caveat:** browsers' `Blob` and `TextDecoder` reject views of resizable buffers ("must not be
  resizable"; Node accepts them, so `resizable.spec.ts` stubs strict versions).
  `ArrayBuffer.transferToFixedLength()` would copy (measured: 4.4 s and 2× memory for 1.9 GB), so
  consumers copy small pieces instead: `tar.ts` decodes copies of header fields, and tar entries
  and single files become Blobs through `blobFromBytes` (16 MiB copies).
- `BlobBuilder` moves streamed data (full downloads, extracted ZIP entries) into the browser's
  blob store every 16 MiB instead of keeping chunks plus a final Blob in the tab.
- `isOutOfMemory` / `toArchiveError`: a `RangeError` from a failed allocation becomes
  `ArchiveError('out-of-memory')` ("not enough free memory" in the UI), not `corrupt`.

Measured peaks before and after: [tests](../testing/tests.md#browser-memory-tests).

## Tests

`tests/unit/engine/*.spec.ts` (tar, zip, rangeReader, gzip, bzip2, xz, single, tree, detect, buffer,
workerClient, resizable), helpers
`tarBuilder.ts`, `bzip2Samples.ts` (libbz2 output) and `xzSamples.ts` (liblzma output). See
[tests](../testing/tests.md).

## When changing

Update this doc, [xz-lzma-decoder](xz-lzma-decoder.md), [viewer-ui](viewer-ui.md),
[dependencies](../tech-stack/dependencies.md), [security](../known-issues/security.md) and
`THIRD-PARTY-NOTICES.md` for ported code.
