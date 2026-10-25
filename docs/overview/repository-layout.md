# Repository Layout

Every tracked file after rework step 6, what it is, and its line count. Generated/ignored: `node_modules/`, `dist/`, `coverage/`, `.__mf__temp/`.

## Root

| Path                     | Lines | Purpose                                                                                   |
| ------------------------ | ----: | ----------------------------------------------------------------------------------------- |
| `README.md`              |   122 | User-facing readme (rewritten in step 6)                                                  |
| `CLAUDE.md`              |   127 | Index into `docs/`                                                                        |
| `LICENSE`                |   661 | GNU AGPL-3.0 (canonical gnu.org text); copyright notice is in `README.md`                 |
| `THIRD-PARTY-NOTICES.md` |   134 | Licenses of ported (seek-bzip) and bundled (zip.js) code                                  |
| `package.json`           |    64 | Package metadata, scripts, `@zip.js/zip.js` dependency, devDependencies, `packageManager` |
| `pnpm-lock.yaml`         |  5356 | Locked dependency tree                                                                    |
| `.nvmrc`                 |     1 | Node version for nvm (`24`)                                                               |
| `vite.config.ts`         |     5 | `defineConfig({ name: 'archive-viewer' })` from extension-sdk                             |
| `gettext.config.cjs`     |    17 | vue3-gettext extract/compile config (de/es/fr)                                            |
| `scripts/package.mjs`    |    64 | `pnpm package`: release zip + SHA-256 from `dist/`                                        |
| `tsconfig.json`          |     4 | Extends `@opencloud-eu/tsconfig`                                                          |
| `extension.d.ts`         |     1 | Vite client types                                                                         |
| `eslint.config.js`       |     3 | OpenCloud ESLint config + ignores                                                         |
| `.prettierrc.json`       |     1 | OpenCloud Prettier config                                                                 |
| `.prettierignore`        |     9 | dist, coverage, lockfile, LICENSE, original docs, `.__mf__temp`                           |
| `.gitignore`             |    16 | node_modules, dist, coverage, editor/env files, `.__mf__temp/`                            |

## `src/`

| Path                                | Lines | Purpose                                                                                        |
| ----------------------------------- | ----: | ---------------------------------------------------------------------------------------------- |
| `src/index.ts`                      |    66 | `defineWebApplication`: Tailwind import, file types, route via `AppWrapperRoute`, translations |
| `src/manifest.json`                 |    10 | Default `config` (6 size limits) merged into `dist/manifest.json`                              |
| `src/limits.ts`                     |    59 | Desktop/mobile limits: `isMobileDevice`, `resolveLimits`                                       |
| `src/App.vue`                       |   243 | Viewer shell: ZIP range mode, size check, streamed download, detect + open, error states       |
| `src/components/ArchiveBrowser.vue` |   454 | File table: folders, breadcrumb, search, sort, selection, downloads, cap, progress             |
| `src/components/PreviewModal.vue`   |   126 | Text/image preview in `oc-modal` (reads via the capped `read` prop)                            |
| `src/download.ts`                   |    61 | `sanitizeFileName`, `triggerDownload`, `zipEntries` (selection → zip)                          |
| `src/engine/index.ts`               |    67 | `openArchive` + re-exports (incl. range reader)                                                |
| `src/engine/types.ts`               |    49 | Entry/handle/limit types, `ArchiveError` (incl. `range-unsupported`)                           |
| `src/engine/detect.ts`              |   107 | Extension + signature → format                                                                 |
| `src/engine/zip.ts`                 |   128 | ZIP via zip.js native build (no WebAssembly), Blob or range source, capped entry reads         |
| `src/engine/rangeReader.ts`         |    79 | `HttpRangeReader`: zip.js Reader over HTTP Range, URL renewal                                  |
| `src/engine/tar.ts`                 |   159 | Own TAR parser (ustar, pax, GNU long names)                                                    |
| `src/engine/gzip.ts`                |    66 | Browser `DecompressionStream` gunzip with size limit                                           |
| `src/engine/tree.ts`                |    78 | Path normalization and folder index                                                            |
| `src/engine/fileTypes.ts`           |    44 | Text/image detection and MIME types                                                            |
| `src/engine/bzip2.ts`               |   430 | bzip2 decoder, TypeScript port of seek-bzip (MIT)                                              |
| `src/engine/decompress.worker.ts`   |    36 | Web Worker running bzip2/xz/lzma decoders                                                      |
| `src/engine/workerClient.ts`        |    35 | `decompressAsync`: worker or main-thread fallback                                              |
| `src/engine/single.ts`              |    35 | Single compressed file as a one-entry archive                                                  |
| `src/engine/xz.ts`                  |   267 | XZ container decoder (from the spec)                                                           |
| `src/engine/lzmaAlone.ts`           |    41 | Legacy .lzma reader                                                                            |
| `src/engine/decompressors.ts`       |    25 | `decompress(kind)` for bzip2/xz/lzma                                                           |
| `src/engine/lzma/lzmaDecoder.ts`    |   227 | LZMA decoder (adapted from xz-compat, MIT)                                                     |
| `src/engine/lzma/lzma2.ts`          |    91 | LZMA2 chunk decoder                                                                            |
| `src/engine/lzma/rangeDecoder.ts`   |   103 | Range decoder + bit trees                                                                      |
| `src/engine/lzma/filters.ts`        |   182 | Delta + BCJ filters (liblzma logic)                                                            |
| `src/engine/lzma/checks.ts`         |    70 | CRC32, CRC64, SHA-256                                                                          |
| `src/engine/lzma/output.ts`         |    58 | Growable output / dictionary buffer                                                            |

Details: [extension-entry](../source/extension-entry.md), [viewer-ui](../source/viewer-ui.md),
[archive-engine](../source/archive-engine.md).

## `l10n/`

| Path                     | Lines | Purpose                                                                 |
| ------------------------ | ----: | ----------------------------------------------------------------------- |
| `l10n/translations.json` |   131 | Compiled de/es/fr translations (41 strings), imported by `src/index.ts` |
| `l10n/template.pot`      |   171 | All msgids (`pnpm l10n:extract`)                                        |
| `l10n/locale/de/app.po`  |   149 | German translations (AI-drafted)                                        |
| `l10n/locale/es/app.po`  |   150 | Spanish translations (AI-drafted)                                       |
| `l10n/locale/fr/app.po`  |   148 | French translations (AI-drafted)                                        |

## `tests/`

| Path                                    | Lines | Purpose                                                     |
| --------------------------------------- | ----: | ----------------------------------------------------------- |
| `tests/unit/App.spec.ts`                |   167 | Viewer flow: range mode, renewal, fallbacks, limits, errors |
| `tests/unit/ArchiveBrowser.spec.ts`     |   131 | Navigation, search, sort, downloads, entry cap, progress    |
| `tests/unit/limits.spec.ts`             |    46 | Device detection and limit resolution                       |
| `tests/unit/translations.spec.ts`       |    50 | Translation completeness and placeholders                   |
| `tests/unit/download.spec.ts`           |    48 | Safe selection-zip paths                                    |
| `tests/unit/rangeServer.ts`             |    38 | Test helper: `fetch` mock serving byte ranges               |
| `tests/unit/engine/tar.spec.ts`         |    84 | TAR parser                                                  |
| `tests/unit/engine/zip.spec.ts`         |    87 | ZIP reader, range source, entry cap                         |
| `tests/unit/engine/rangeReader.spec.ts` |    80 | Range reader: 206/200/401/errors/abort                      |
| `tests/unit/engine/gzip.spec.ts`        |    56 | gunzip + limit                                              |
| `tests/unit/engine/tree.spec.ts`        |    71 | Folder index                                                |
| `tests/unit/engine/detect.spec.ts`      |    66 | Format detection                                            |
| `tests/unit/engine/tarBuilder.ts`       |    94 | Test helper: builds tar/gzip bytes                          |
| `tests/unit/engine/bzip2.spec.ts`       |    49 | bzip2 decoder vs libbz2 samples                             |
| `tests/unit/engine/single.spec.ts`      |    66 | Single compressed files, .bz2/.tar.bz2 via openArchive      |
| `tests/unit/engine/bzip2Samples.ts`     |    48 | Test data: libbz2 output (base64) + SHA-256                 |
| `tests/unit/engine/xz.spec.ts`          |    86 | xz and legacy lzma decoders vs liblzma                      |
| `tests/unit/engine/xzSamples.ts`        |   140 | Test data: liblzma output (base64) + SHA-256                |

## `docs/`

This knowledge base; see `CLAUDE.md`. `docs/original-docs/` holds the original uploaded docs
(historical, unverified).

## Outside the repo

The local OpenCloud test stack lives next to the repo in `~/Projects/OpenCloud/`
(`opencloud-compose/`, `test-fixtures/`, `README.md`) and is not versioned here; see
[local-dev-environment](../deployment/local-dev-environment.md).

## Removed in step 1

Legacy app (`src/index.js`, `src/lib/*`, `src/styles/main.css`, root `index.html`,
`webpack.config.js`), `src/types.d.ts`, `src/utils/memory.ts`, `vitest.config.ts`,
`tsconfig.node.json`, `public/index.html`, root `manifest.json`, `appinfo/info.json`, `Dockerfile`,
`docker-compose.yml`, `nginx.conf`, `install.sh`. All recoverable from commit `3a2ed58`.

## Removed in step 3

`reference/` (old pre-v8 views and tests, ported then deleted) and the two port-notes docs;
`src/App.vue` placeholder replaced. Recoverable from commit `619d40a`.
