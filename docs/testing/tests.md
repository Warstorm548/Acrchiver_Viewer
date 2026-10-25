# Tests

## Running

```
pnpm test:unit          # watch mode
pnpm test:unit --run    # once (used in verification)
pnpm test:unit --run --coverage
```

Config comes from `@opencloud-eu/extension-sdk` (`defineConfig` in `vite.config.ts`): `happy-dom`,
globals, `clearMocks`, includes `**/*.spec.ts`, excludes `node_modules`, `dist`, `e2e`. The SDK's
setup file adds a `<base href="/">` to the document. Node 24 provides `CompressionStream` /
`DecompressionStream`, which the engine and tests rely on.

## Specs (200 tests, all passing after the memory fixes)

| File                                     | Covers                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/engine/tar.spec.ts`          | listing, sizes/dates, reading, GNU long names, pax paths (incl. non-ASCII), symlinks unsupported, corrupt and truncated archives, non-numeric size rejected, two members with the same path                                                                                                                                                           |
| `tests/unit/engine/zip.spec.ts`          | listing with folders, reading with MIME type, encrypted entries unsupported, non-zip rejected, opening and reading through `HttpRangeReader`, declared size over the cap, entry bigger than it claims, lower cap for one read                                                                                                                         |
| `tests/unit/engine/rangeReader.spec.ts`  | 206 reads + byte callback, clamping at the end, 200 → `range-unsupported`, 200 accepted for the whole file, 401 → renew URL once → retry, HTTP error and short body → `RangeRequestError`, abort                                                                                                                                                      |
| `tests/unit/limits.spec.ts`              | mobile detection (Android, iPhone, `userAgentData`, iPadOS as Mac + touch), desktop; defaults per device, manifest `config` equals the defaults, config overrides incl. `…Mobile` keys, invalid values                                                                                                                                                |
| `tests/unit/translations.spec.ts`        | `template.pot` matches every `$gettext`/`$ngettext` string in `src/`; de/es/fr translate every string, non-empty, same `%{…}` placeholders (plural forms too)                                                                                                                                                                                         |
| `tests/unit/download.spec.ts`            | `selectionPath` drops `..`/`.`, sanitizes and numbers clashes; `zipEntries` writes safe paths, gives each read what is left of the allowance, stops when the real total exceeds it (lying sizes, or a reader returning too much)                                                                                                                      |
| `tests/unit/engine/gzip.spec.ts`         | decompression, empty file, one buffer of the recorded size, size-limit abort (`too-large`), corrupt data, gzip header name/date                                                                                                                                                                                                                       |
| `tests/unit/engine/bzip2.spec.ts`        | 8 libbz2-generated samples (text at block sizes 1 and 9, runs, random, empty, multi-stream, tar, 1 MB of zeros) byte-identical; trailing bytes; size limit; bad magic; damaged CRC; truncation                                                                                                                                                        |
| `tests/unit/engine/xz.spec.ts`           | 24 liblzma samples (presets, all check types, all supported filters, delta chains, concatenated+padded streams, multi-chunk, tar, 1 MB zeros) and 3 legacy `.lzma` samples byte-identical; damaged CRC64/SHA-256 data; damaged header; truncation; size limits; ARM64 filter named in the error; `recordedSize` equals every sample's size            |
| `tests/unit/engine/buffer.spec.ts`       | `GrowableBuffer` with resizable and copying buffers (growth, exact hint without copy, too-small hint, `maxSize`, never above `MAX_BUFFER_SIZE`), `BlobBuilder` order and multi-part, `isOutOfMemory` / `toArchiveError` mapping                                                                                                                       |
| `tests/unit/engine/workerClient.spec.ts` | with a fake worker: CSP-blocked worker → main-thread result, `out-of-memory` passed on, abort terminates the worker                                                                                                                                                                                                                                   |
| `tests/unit/engine/resizable.spec.ts`    | with browser-strict `Blob`/`TextDecoder` stand-ins (reject resizable views): tar listing incl. GNU/pax names and reading, single-file read, `.tar.gz` end to end on resizable output                                                                                                                                                                  |
| `tests/unit/engine/single.spec.ts`       | single-file naming, one-entry handle, `.gz` → one file, gzipped tar without `.tar`, `.bz2`, `.tar.bz2`, `.xz`, `.tar.xz`, `.lzma` via `openArchive`                                                                                                                                                                                                   |
| `tests/unit/engine/tree.spec.ts`         | path normalization, parent paths, synthesized folders, direct children, `filesBelow`, duplicates keep the last (file vs folder keeps the first)                                                                                                                                                                                                       |
| `tests/unit/engine/detect.spec.ts`       | zip/gzip/bzip2/xz/tar signatures, legacy lzma header, extension + content resolution, unsupported formats, gzip/bzip2/xz content under a wrong extension                                                                                                                                                                                              |
| `tests/unit/ArchiveBrowser.spec.ts`      | folders first, folder navigation + breadcrumb, whole-archive search with folder path, size sort toggle, single download, selected folder → one zip, selection-zip naming for zip/tgz/tar.bz2, file and selection over the entry cap refused, selection zip gets the entry cap as its real-size allowance, extraction progress                         |
| `tests/unit/App.spec.ts`                 | non-zip size limit blocks download, zip read by range (no archive limit), expired URL renewed, fallback when ranges are ignored, `blob:` URL downloaded, single `.gz` file, `.zip` holding gzip opened by content, mobile limits, download stopped when bigger than the limit despite the metadata, damaged archive, unsupported format, HTTP failure |

Helpers:

- `tests/unit/engine/tarBuilder.ts` builds tar bytes (ustar, GNU `L`, pax `x`) and gzips them with
  `CompressionStream`.
- `tests/unit/engine/bzip2Samples.ts` holds bzip2 data produced by Python's `bz2` module (the
  reference libbz2) as base64, plus the SHA-256 and size of the original data.
- `tests/unit/engine/xzSamples.ts` holds xz and legacy lzma data produced by Python's `lzma` module
  (reference liblzma), each sample also checked with the `xz` command-line tool.
- ZIP archives are built in tests with zip.js `ZipWriter`.

A one-off multi-block stress check (1.8 MB of mixed data at block sizes 100k and 900k) also matched
libbz2 byte-for-byte during step 4, and a 9.4 MB real-source tar compressed by `xz` (-9e, -0,
--x86, --format=lzma) matched during step 4b; neither is kept as a test.

## Patterns

- Components: `mount` + `defaultPlugins()` from `@opencloud-eu/web-test-helpers` (provides pinia
  for `useMessages`, gettext, design system), `mock<T>()` from `vitest-mock-extended`.
- `OcIcon` is stubbed (`global.stubs: { OcIcon: true }`): the real component fetches its SVG over
  HTTP, which fails in happy-dom with `ECONNREFUSED 127.0.0.1:3000` noise. `PreviewModal` is
  stubbed in browser tests.
- zip.js: `configureZip({ useWebWorkers: false })` in `beforeAll` (no workers in happy-dom).
  `decompressAsync` falls back to the main thread there; `workerClient.spec.ts` mocks the
  `?worker&inline` import with a fake `Worker`, so the real worker is only exercised in a browser.
- Network: `serveFile(blob, { ranges, expired })` from `tests/unit/rangeServer.ts` mocks `fetch`
  as a file server (206 for `Range`, 200 otherwise, 401 for listed URLs) and records requests.
- Downloads: `vi.spyOn(download, 'triggerDownload' | 'zipEntries')`.

## Not covered by unit tests

`PreviewModal.vue` rendering, the decompression Web Worker, `download.ts` in a real browser and
`src/index.ts` registration. These are covered by the manual checklist on the local stack
([local-dev-environment](../deployment/local-dev-environment.md)). E2E tests (Playwright, as in
`web-extensions`) could automate it later.

## Browser memory tests

Memory can't be unit-tested, so it was measured in a real browser (October 2026): OpenCloud
rolling 8.0.1 in Docker (`opencloudeu/opencloud-rolling:8.0.1`, `dist/` mounted as in
[local-dev-environment](../deployment/local-dev-environment.md), opencloud-compose `csp.yaml`),
headless Chromium 153 via Playwright on a 15 GB machine. A script logs in, opens each archive at
`/archive-viewer/personal/admin/<file>`, optionally downloads an entry, and samples the RSS of the
tab's renderer process (which also hosts its workers) every 200 ms. The 2 GB run put the browser
in a cgroup with `memory.limit_in_bytes` = 2 GiB.

Desktop limits, compose CSP, peak tab memory (idle tab: about 245 MiB):

| Archive                                     | Before the fixes                  | After                |
| ------------------------------------------- | --------------------------------- | -------------------- |
| 3 GiB ZIP: open, preview a file             | 1 s, ~130 KB fetched, 244 MiB     | same (246 MiB)       |
| ZIP, download a 1.5 GiB entry               | refused at once (entry cap)       | same                 |
| ZIP, download a 900 MiB entry               | 40.5 s, 2,388 MiB                 | 36.1 s, **717 MiB**  |
| 900 MiB `.tar.gz` (random data)             | 13.1 s, 2,074 MiB                 | 11.3 s, 2,189 MiB    |
| `.tar.gz` → 1.9 GiB                         | 8.7 s, 4,085 MiB                  | 6.7 s, **3,223 MiB** |
| `.tar.xz` → 1.9 GiB                         | **"damaged"** (allocation failed) | 17.1 s, 2,186 MiB    |
| `.tar.bz2` → 1.9 GiB                        | **"damaged"** (allocation failed) | 8.5 s, 2,138 MiB     |
| small `.tar.xz` / `.tar.bz2` + text preview | worked                            | worked               |

Mobile limits (Android user agent), browser capped at 1.5 GiB — old build with archives at the old
limits (256 / 512 / 256 MiB), new build at the new ones (128 / 384 / 256 MiB); data size in
brackets:

| Archive                               | Old build                | New build           |
| ------------------------------------- | ------------------------ | ------------------- |
| random `.tar.gz` at the archive limit | 782 MiB (240 MiB)        | 528 MiB (120 MiB)   |
| `.tar.gz` at the decompressed limit   | 1,249 MiB (500 MiB)      | 1,010 MiB (380 MiB) |
| `.tar.xz` at the decompressed limit   | **tab killed** (500 MiB) | 825 MiB (380 MiB)   |
| `.tar.bz2` at the decompressed limit  | 1,477 MiB (500 MiB)      | 617 MiB (380 MiB)   |
| ZIP, download a 250 MiB entry         | 1,173 MiB                | 710 MiB             |

Desktop limits on a browser capped at 2 GiB: the 3 GiB ZIP still worked; the 900 MiB `.tar.gz`,
the 1.9 GiB `.tar.gz` and the 900 MiB entry download got the tab killed before the fixes (desktop
limits assume a desktop's memory; phones use the mobile limits).

Built-in CSP (no `csp.yaml`): before, every bzip2/xz/lzma file failed at once as "damaged"; now
they open on the main thread (1.9 GiB `.tar.xz` in 22 s, page frozen meanwhile).

Remaining overhead: gzip output arrives as fresh chunks from `DecompressionStream`, and garbage
collection reclaims them only later, so gzip peaks at about 1.5× the decompressed size (forcing a
GC afterwards freed 0.6–1 GiB; yielding to the event loop did not help). Avoiding it would need an
own inflate implementation.

## When changing tests

Update the table above with each new spec and the total count.
