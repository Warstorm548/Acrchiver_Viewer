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

## Specs (141 tests, all passing after the CodeRabbit fixes)

| File                                    | Covers                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/engine/tar.spec.ts`         | listing, sizes/dates, reading, GNU long names, pax paths (incl. non-ASCII), symlinks unsupported, corrupt and truncated archives, non-numeric size rejected, two members with the same path                                                                                                     |
| `tests/unit/engine/zip.spec.ts`         | listing with folders, reading with MIME type, encrypted entries unsupported, non-zip rejected, opening and reading through `HttpRangeReader`, declared size over the cap, entry bigger than it claims                                                                                           |
| `tests/unit/engine/rangeReader.spec.ts` | 206 reads + byte callback, clamping at the end, 200 → `range-unsupported`, 200 accepted for the whole file, 401 → renew URL once → retry, HTTP error and short body → `RangeRequestError`, abort                                                                                                |
| `tests/unit/limits.spec.ts`             | mobile detection (Android, iPhone, `userAgentData`, iPadOS as Mac + touch), desktop; defaults per device, config overrides incl. `…Mobile` keys, invalid values                                                                                                                                 |
| `tests/unit/translations.spec.ts`       | `template.pot` matches every `$gettext`/`$ngettext` string in `src/`; de/es/fr translate every string, non-empty, same `%{…}` placeholders (plural forms too)                                                                                                                                   |
| `tests/unit/download.spec.ts`           | `selectionPath` drops `..`/`.`, sanitizes and numbers clashes; `zipEntries` writes safe paths                                                                                                                                                                                                   |
| `tests/unit/engine/gzip.spec.ts`        | decompression, size-limit abort (`too-large`), corrupt data, gzip header name/date                                                                                                                                                                                                              |
| `tests/unit/engine/bzip2.spec.ts`       | 8 libbz2-generated samples (text at block sizes 1 and 9, runs, random, empty, multi-stream, tar, 1 MB of zeros) byte-identical; trailing bytes; size limit; bad magic; damaged CRC; truncation                                                                                                  |
| `tests/unit/engine/xz.spec.ts`          | 24 liblzma samples (presets, all check types, all supported filters, delta chains, concatenated+padded streams, multi-chunk, tar, 1 MB zeros) and 3 legacy `.lzma` samples byte-identical; damaged CRC64/SHA-256 data; damaged header; truncation; size limits; ARM64 filter named in the error |
| `tests/unit/engine/single.spec.ts`      | single-file naming, one-entry handle, `.gz` → one file, gzipped tar without `.tar`, `.bz2`, `.tar.bz2`, `.xz`, `.tar.xz`, `.lzma` via `openArchive`                                                                                                                                             |
| `tests/unit/engine/tree.spec.ts`        | path normalization, parent paths, synthesized folders, direct children, `filesBelow`, duplicates keep the last (file vs folder keeps the first)                                                                                                                                                 |
| `tests/unit/engine/detect.spec.ts`      | zip/gzip/bzip2/xz/tar signatures, legacy lzma header, extension + content resolution, unsupported formats, gzip/bzip2/xz content under a wrong extension                                                                                                                                        |
| `tests/unit/ArchiveBrowser.spec.ts`     | folders first, folder navigation + breadcrumb, whole-archive search with folder path, size sort toggle, single download, selected folder → one zip, selection-zip naming for zip/tgz/tar.bz2, file and selection over the entry cap refused, extraction progress                                |
| `tests/unit/App.spec.ts`                | non-zip size limit blocks download, zip read by range (no archive limit), expired URL renewed, fallback when ranges are ignored, `blob:` URL downloaded, single `.gz` file, `.zip` holding gzip opened by content, mobile limits, damaged archive, unsupported format, HTTP failure             |

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
  `decompressAsync` falls back to the main thread there, so the decompression worker itself is only
  exercised in the browser checklist.
- Network: `serveFile(blob, { ranges, expired })` from `tests/unit/rangeServer.ts` mocks `fetch`
  as a file server (206 for `Range`, 200 otherwise, 401 for listed URLs) and records requests.
- Downloads: `vi.spyOn(download, 'triggerDownload' | 'zipEntries')`.

## Not covered by unit tests

`PreviewModal.vue` rendering, the decompression Web Worker, `download.ts` in a real browser and
`src/index.ts` registration. These are covered by the manual checklist on the local stack
([local-dev-environment](../deployment/local-dev-environment.md)). E2E tests (Playwright, as in
`web-extensions`) could automate it later.

## When changing tests

Update the table above with each new spec and the total count.
