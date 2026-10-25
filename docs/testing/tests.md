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

## Specs (69 tests, all passing after step 4)

| File                                | Covers                                                                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/engine/tar.spec.ts`     | listing, sizes/dates, reading, GNU long names, pax paths, symlinks unsupported, corrupt and truncated archives                                                                                 |
| `tests/unit/engine/zip.spec.ts`     | listing with folders, reading with MIME type, encrypted entries unsupported, non-zip rejected                                                                                                  |
| `tests/unit/engine/gzip.spec.ts`    | decompression, size-limit abort (`too-large`), corrupt data, gzip header name/date                                                                                                             |
| `tests/unit/engine/bzip2.spec.ts`   | 8 libbz2-generated samples (text at block sizes 1 and 9, runs, random, empty, multi-stream, tar, 1 MB of zeros) byte-identical; trailing bytes; size limit; bad magic; damaged CRC; truncation |
| `tests/unit/engine/single.spec.ts`  | single-file naming, one-entry handle, `.gz` → one file, gzipped tar without `.tar`, `.bz2` and `.tar.bz2` via `openArchive`                                                                    |
| `tests/unit/engine/tree.spec.ts`    | path normalization, parent paths, synthesized folders, direct children, `filesBelow`, duplicates                                                                                               |
| `tests/unit/engine/detect.spec.ts`  | zip/gzip/bzip2/tar signatures, extension + content resolution, unsupported formats                                                                                                             |
| `tests/unit/ArchiveBrowser.spec.ts` | folders first, folder navigation + breadcrumb, whole-archive search with folder path, size sort toggle, single download, selected folder → one zip, selection-zip naming for zip/tgz/tar.bz2   |
| `tests/unit/App.spec.ts`            | size limit blocks download, download → open → list, single `.gz` file, damaged archive, unsupported format, HTTP failure                                                                       |

Helpers:

- `tests/unit/engine/tarBuilder.ts` builds tar bytes (ustar, GNU `L`, pax `x`) and gzips them with
  `CompressionStream`.
- `tests/unit/engine/bzip2Samples.ts` holds bzip2 data produced by Python's `bz2` module (the
  reference libbz2) as base64, plus the SHA-256 and size of the original data.
- ZIP archives are built in tests with zip.js `ZipWriter`.

A one-off multi-block stress check (1.8 MB of mixed data at block sizes 100k and 900k) also matched
libbz2 byte-for-byte during step 4; it isn't kept as a test.

## Patterns

- Components: `mount` + `defaultPlugins()` from `@opencloud-eu/web-test-helpers` (provides pinia
  for `useMessages`, gettext, design system), `mock<T>()` from `vitest-mock-extended`.
- `OcIcon` is stubbed (`global.stubs: { OcIcon: true }`): the real component fetches its SVG over
  HTTP, which fails in happy-dom with `ECONNREFUSED 127.0.0.1:3000` noise. `PreviewModal` is
  stubbed in browser tests.
- zip.js: `configureZip({ useWebWorkers: false })` in `beforeAll` (no workers in happy-dom).
  `bunzip2Async` falls back to the main thread there, so the bzip2 worker itself is only
  exercised in the browser checklist.
- Network: `vi.spyOn(globalThis, 'fetch')` returning a `Response`.
- Downloads: `vi.spyOn(download, 'triggerDownload' | 'zipEntries')`.

## Not covered by unit tests

`PreviewModal.vue` rendering, the bzip2 Web Worker, `download.ts` in a real browser and
`src/index.ts` registration. These are covered by the manual checklist on the local stack
([local-dev-environment](../deployment/local-dev-environment.md)). E2E tests (Playwright, as in
`web-extensions`) could automate it later.

## When changing tests

Update the table above with each new spec and the total count.
