# ZIP Range Reading and Device Limits — `src/engine/rangeReader.ts`, `src/limits.ts`

Added in rework step 5. ZIPs keep their index (central directory) at the end, so the viewer
reads them with **HTTP Range requests**: listing a multi-GB ZIP costs a few requests and each file
is fetched only when the user previews or downloads it. All other formats are still downloaded in
full (see [viewer-ui](viewer-ui.md)).

## What OpenCloud's signed URL does (verified on rolling 8.0.1)

| Request                    | Answer                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `GET` + `Range: bytes=a-b` | **206** with exactly those bytes (also suffix ranges like `bytes=-22`)               |
| `HEAD`                     | **401**: the signature is only valid for GET, so the size comes from `resource.size` |
| after 30 minutes           | **401**: `oc-jwt-sig` has `exp − iat = 1800`                                         |
| public link (password)     | same behaviour; range reads work in a private window                                 |

## `HttpRangeReader` (`src/engine/rangeReader.ts`)

A zip.js `Reader` (native build) over a URL:

- `size` comes from the constructor (the file's metadata), not from a `HEAD` request.
- `readUint8Array(offset, length)` sends `Range: bytes=offset-end` (clamped at the end of the file)
  and requires **206** with exactly the requested length. A 200 is accepted only if the range
  covered the whole file.
- **401/403** → asks `renewUrl()` once for a fresh URL (App passes the wrapper's
  `getUrlForResource(space, resource)`), then retries; later requests use the new URL.
- **200 for a partial range** (server ignores Range) → `ArchiveError('range-unsupported')`.
- Other HTTP errors, network failures, short bodies → `RangeRequestError` (shown as "could not be
  loaded"). `AbortError` passes through untouched, so unmounting cancels everything quietly.
- `onBytes(count)` after each response drives the extraction progress.

`openZip` sets zip.js `chunkSize` to **4 MiB** (default 512 KiB) so big entries need fewer requests.

## App flow (`src/App.vue`)

1. Extension `zip` and `url` not a `blob:` URL (vault files arrive as in-memory blobs) →
   **range mode**, status "Reading archive index…". **No archive size limit** applies.
2. Read the first 262 bytes by range → `resolveFormat('zip', head)`. Content that isn't a ZIP
   is rejected right away with the usual "not supported" message (content over extension),
   without downloading the file.
3. `openZip(reader, { maxEntrySize })` lists the entries.
4. `range-unsupported` → falls back to the full-download path, which applies the archive limit.

## Device-aware limits (`src/limits.ts`)

| Limit (`apps.yaml` key)                   | Desktop | Mobile (`…Mobile` key) | Applies to                                            |
| ----------------------------------------- | ------- | ---------------------- | ----------------------------------------------------- |
| `maxArchiveSize` / `maxArchiveSizeMobile` | 1 GiB   | 256 MiB                | whole-file downloads (every format except ranged ZIP) |
| `maxUncompressedSize` / `…Mobile`         | 2 GiB   | 512 MiB                | decompressed output of gzip/bzip2/xz/lzma             |
| `maxEntrySize` / `maxEntrySizeMobile`     | 1 GiB   | 256 MiB                | one extracted file, and the total of a selection      |

- `isMobileDevice()`: `navigator.userAgentData.mobile`, else the user agent
  (`Android|iPhone|iPad|iPod|Mobile`), plus iPadOS (Mac user agent with `maxTouchPoints > 1`).
  DevTools device emulation counts as mobile.
- `resolveLimits(config, mobile)`: on desktop the plain keys, on mobile the `…Mobile` keys;
  missing, non-numeric or non-positive values → default. Defaults are also in `src/manifest.json`.
- Sizes in messages use `formatFileSize` (decimal units): 1 GiB shows as "1.1 GB", 256 MiB as
  "268.4 MB".

## Entry cap (`src/engine/zip.ts`, `ArchiveBrowser.vue`)

- `ArchiveBrowser.readEntry` refuses up front when the declared size is over `maxEntrySize`;
  "Download selected" refuses when the declared total is over it. Both explain the limit.
- `readLimited` in `zip.ts` refuses a declared size over the cap, then writes through a
  `WritableStream` that aborts once the **real** output passes the cap.
- zip.js itself already stops when an entry's output exceeds its declared size ("Invalid
  uncompressed size"); that is mapped to `ArchiveError('corrupt')`. So a ZIP lying about a size
  can't exceed the cap either way.
- Progress: while an entry is read, the browser shows "Extracting <name>… N%" (bytes fetched by
  range since the start ÷ the entry's compressed size); without range reads it shows no percent.

## Verification (step 5, local 8.0.1 stack)

`big-test.zip` from `make-fixtures.sh --large-zip` (3.04 GiB, ZIP64, 3,006 entries: 3,000 small
files, a 200 MiB deflated text file, 2 × 900 MiB and 1 × 1,200 MiB stored files, a small file
after the bulk data):

- Opened in about a second with only a few 206 requests; no `.wasm` requested.
- Previews of the last file in the archive and of small files worked.
- The 200 MiB file downloaded with progress; SHA-256 matched the generator's.
- The 1,200 MiB file and the `bulk` selection were refused (desktop cap); the `small` selection
  zip held all 3,000 files byte-identical.
- Mobile emulation: 900 MiB file refused with the 268.4 MB message; 200 MiB file and
  `large.tar.bz2` still worked.
- Password-protected public links: `big-test.zip` read by range, `sample.tar.xz` opened.
- Afterwards the file was deleted locally, on the server and from the trash bin, and the test
  links were removed (procedure in [local-dev-environment](../deployment/local-dev-environment.md)).

## When changing

Run `pnpm test:unit --run` (`rangeReader.spec.ts`, `limits.spec.ts`, `zip.spec.ts`,
`App.spec.ts`, `ArchiveBrowser.spec.ts`; mock server in `tests/unit/rangeServer.ts`). Update this
doc, [viewer-ui](viewer-ui.md), [security](../known-issues/security.md) and
[deploying-to-opencloud](../deployment/deploying-to-opencloud.md) for config keys.
