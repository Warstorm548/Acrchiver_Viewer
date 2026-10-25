# Repository Layout

Every tracked file after rework step 3, what it is, and its line count. Generated/ignored: `node_modules/`, `dist/`, `coverage/`, `.__mf__temp/`.

## Root

| Path                     | Lines | Purpose                                                                                   |
| ------------------------ | ----: | ----------------------------------------------------------------------------------------- |
| `README.md`              |   347 | Project readme (still describes the original feature set; rewritten in step 6)            |
| `CLAUDE.md`              |   120 | Index into `docs/`                                                                        |
| `LICENSE`                |   661 | GNU AGPL-3.0 (canonical gnu.org text); copyright notice is in `README.md`                 |
| `THIRD-PARTY-NOTICES.md` |   132 | Licenses of ported (seek-bzip) and bundled (zip.js) code                                  |
| `package.json`           |    61 | Package metadata, scripts, `@zip.js/zip.js` dependency, devDependencies, `packageManager` |
| `pnpm-lock.yaml`         |  5356 | Locked dependency tree                                                                    |
| `.nvmrc`                 |     1 | Node version for nvm (`24`)                                                               |
| `vite.config.ts`         |     5 | `defineConfig({ name: 'archive-viewer' })` from extension-sdk                             |
| `tsconfig.json`          |     4 | Extends `@opencloud-eu/tsconfig`                                                          |
| `extension.d.ts`         |     1 | Vite client types                                                                         |
| `eslint.config.js`       |     3 | OpenCloud ESLint config + ignores                                                         |
| `.prettierrc.json`       |     1 | OpenCloud Prettier config                                                                 |
| `.prettierignore`        |     6 | dist, coverage, lockfile, LICENSE, original docs, `.__mf__temp`                           |
| `.gitignore`             |    13 | node_modules, dist, coverage, editor/env files, `.__mf__temp/`                            |

## `src/`

| Path                                | Lines | Purpose                                                                                        |
| ----------------------------------- | ----: | ---------------------------------------------------------------------------------------------- |
| `src/index.ts`                      |    66 | `defineWebApplication`: Tailwind import, file types, route via `AppWrapperRoute`, translations |
| `src/manifest.json`                 |     6 | Default `config` (size limits) merged into `dist/manifest.json`                                |
| `src/App.vue`                       |   191 | Viewer shell: size check, streamed download with progress, detect + open, error states         |
| `src/components/ArchiveBrowser.vue` |   363 | File table: folders, breadcrumb, search, sort, selection, downloads                            |
| `src/components/PreviewModal.vue`   |   120 | Text/image preview in `oc-modal`                                                               |
| `src/download.ts`                   |    35 | `sanitizeFileName`, `triggerDownload`, `zipEntries` (selection → zip)                          |
| `src/engine/index.ts`               |    65 | `openArchive` + re-exports                                                                     |
| `src/engine/types.ts`               |    41 | Entry/handle types, `ArchiveError`                                                             |
| `src/engine/detect.ts`              |    96 | Extension + signature → format                                                                 |
| `src/engine/zip.ts`                 |    64 | ZIP via zip.js native build (no WebAssembly)                                                   |
| `src/engine/tar.ts`                 |   152 | Own TAR parser (ustar, pax, GNU long names)                                                    |
| `src/engine/gzip.ts`                |    66 | Browser `DecompressionStream` gunzip with size limit                                           |
| `src/engine/tree.ts`                |    66 | Path normalization and folder index                                                            |
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

| Path                     | Lines | Purpose                                                 |
| ------------------------ | ----: | ------------------------------------------------------- |
| `l10n/translations.json` |    38 | de/es/fr/en entries for strings still in use (7 msgids) |

## `tests/`

| Path                                | Lines | Purpose                                                |
| ----------------------------------- | ----: | ------------------------------------------------------ |
| `tests/unit/App.spec.ts`            |   103 | Viewer flow: limit, download/open/list, errors         |
| `tests/unit/ArchiveBrowser.spec.ts` |    96 | Navigation, search, sort, downloads                    |
| `tests/unit/engine/tar.spec.ts`     |    60 | TAR parser                                             |
| `tests/unit/engine/zip.spec.ts`     |    49 | ZIP reader                                             |
| `tests/unit/engine/gzip.spec.ts`    |    56 | gunzip + limit                                         |
| `tests/unit/engine/tree.spec.ts`    |    57 | Folder index                                           |
| `tests/unit/engine/detect.spec.ts`  |    62 | Format detection                                       |
| `tests/unit/engine/tarBuilder.ts`   |    92 | Test helper: builds tar/gzip bytes                     |
| `tests/unit/engine/bzip2.spec.ts`   |    49 | bzip2 decoder vs libbz2 samples                        |
| `tests/unit/engine/single.spec.ts`  |    66 | Single compressed files, .bz2/.tar.bz2 via openArchive |
| `tests/unit/engine/bzip2Samples.ts` |    48 | Test data: libbz2 output (base64) + SHA-256            |
| `tests/unit/engine/xz.spec.ts`      |    86 | xz and legacy lzma decoders vs liblzma                 |
| `tests/unit/engine/xzSamples.ts`    |   140 | Test data: liblzma output (base64) + SHA-256           |

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
