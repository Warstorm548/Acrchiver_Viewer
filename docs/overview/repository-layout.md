# Repository Layout

Every tracked file after rework step 6, what it is, and its line count. Generated/ignored: `node_modules/`, `dist/`, `coverage/`, `.__mf__temp/`.

## Root

| Path                     | Lines | Purpose                                                                                   |
| ------------------------ | ----: | ----------------------------------------------------------------------------------------- |
| `README.md`              |   141 | User-facing readme (rewritten in step 6)                                                  |
| `CLAUDE.md`              |   138 | Index into `docs/`                                                                        |
| `LICENSE`                |   661 | GNU AGPL-3.0 (canonical gnu.org text); copyright notice is in `README.md`                 |
| `THIRD-PARTY-NOTICES.md` |   134 | Licenses of ported (seek-bzip) and bundled (zip.js) code                                  |
| `package.json`           |    67 | Package metadata, scripts, `@zip.js/zip.js` dependency, devDependencies, `packageManager` |
| `pnpm-lock.yaml`         |  5384 | Locked dependency tree                                                                    |
| `.nvmrc`                 |     1 | Node version for nvm (`24`)                                                               |
| `CHANGELOG.md`           |    86 | SemVer rules and per-version changes                                                      |
| `playwright.config.ts`   |    30 | E2E config: Chromium, one worker, login project, global setup/teardown                    |
| `vite.config.ts`         |    17 | extension-sdk `defineConfig`, plus the version banner on compiled JS                      |
| `gettext.config.cjs`     |    17 | vue3-gettext extract/compile config (de/es/fr)                                            |
| `scripts/package.mjs`    |    64 | `pnpm package`: release zip + SHA-256 from `dist/`                                        |
| `tsconfig.json`          |     4 | Extends `@opencloud-eu/tsconfig`                                                          |
| `extension.d.ts`         |     1 | Vite client types                                                                         |
| `eslint.config.js`       |     3 | OpenCloud ESLint config + ignores                                                         |
| `.prettierrc.json`       |     1 | OpenCloud Prettier config                                                                 |
| `.prettierignore`        |    14 | dist, coverage, lockfile, LICENSE, original docs, `.__mf__temp`, Playwright output        |
| `.gitignore`             |    21 | node_modules, dist, coverage, editor/env files, `.__mf__temp/`, Playwright output + login |

## `src/`

| Path                                | Lines | Purpose                                                                                          |
| ----------------------------------- | ----: | ------------------------------------------------------------------------------------------------ |
| `src/index.ts`                      |    80 | `defineWebApplication`: version check, Tailwind import, file types, route, translations          |
| `src/compatibility.ts`              |    91 | OpenCloud version check: supported versions, `waitForProductVersion`, `checkCompatibility`       |
| `src/manifest.json`                 |    11 | Default `config` (6 size limits + `allowUnsupportedOpenCloud`) merged into `dist/manifest.json`  |
| `src/limits.ts`                     |    65 | Desktop/mobile limits: `isMobileDevice`, `resolveLimits`, defaults rationale                     |
| `src/App.vue`                       |   273 | Viewer shell: ZIP range mode, size check, capped streamed download, detect + open, errors        |
| `src/components/ArchiveBrowser.vue` |   469 | File table: folders, breadcrumb, search, sort, selection, downloads, cap, progress               |
| `src/components/PreviewModal.vue`   |   132 | Text/image preview in `oc-modal` (reads via the capped `read` prop)                              |
| `src/download.ts`                   |    80 | `sanitizeFileName`, `triggerDownload`, `zipEntries` (selection → zip)                            |
| `src/engine/index.ts`               |    72 | `openArchive` + re-exports (incl. range reader)                                                  |
| `src/engine/types.ts`               |    55 | Entry/handle/limit types, `ArchiveError` (incl. `range-unsupported`, `out-of-memory`)            |
| `src/engine/buffer.ts`              |   171 | `GrowableBuffer` (resizable, size hint), `BlobBuilder`, `MAX_BUFFER_SIZE`, out-of-memory mapping |
| `src/engine/detect.ts`              |   107 | Extension + signature → format                                                                   |
| `src/engine/zip.ts`                 |   125 | ZIP via zip.js native build (no WebAssembly), Blob or range source, capped entry reads           |
| `src/engine/rangeReader.ts`         |    79 | `HttpRangeReader`: zip.js Reader over HTTP Range, URL renewal                                    |
| `src/engine/tar.ts`                 |   162 | Own TAR parser (ustar, pax, GNU long names)                                                      |
| `src/engine/gzip.ts`                |    66 | Browser `DecompressionStream` gunzip into one buffer sized from ISIZE, size limit                |
| `src/engine/tree.ts`                |    78 | Path normalization and folder index                                                              |
| `src/engine/fileTypes.ts`           |    44 | Text/image detection and MIME types                                                              |
| `src/engine/bzip2.ts`               |   411 | bzip2 decoder, TypeScript port of seek-bzip (MIT)                                                |
| `src/engine/decompress.worker.ts`   |    34 | Web Worker running bzip2/xz/lzma decoders                                                        |
| `src/engine/workerClient.ts`        |    93 | `decompressAsync`: worker, main-thread fallback (no Worker / CSP), abort                         |
| `src/engine/single.ts`              |    36 | Single compressed file as a one-entry archive                                                    |
| `src/engine/xz.ts`                  |   306 | XZ container decoder (from the spec)                                                             |
| `src/engine/lzmaAlone.ts`           |    41 | Legacy .lzma reader                                                                              |
| `src/engine/decompressors.ts`       |    25 | `decompress(kind)` for bzip2/xz/lzma                                                             |
| `src/engine/lzma/lzmaDecoder.ts`    |   227 | LZMA decoder (adapted from xz-compat, MIT)                                                       |
| `src/engine/lzma/lzma2.ts`          |    91 | LZMA2 chunk decoder                                                                              |
| `src/engine/lzma/rangeDecoder.ts`   |   103 | Range decoder + bit trees                                                                        |
| `src/engine/lzma/filters.ts`        |   182 | Delta + BCJ filters (liblzma logic)                                                              |
| `src/engine/lzma/checks.ts`         |    70 | CRC32, CRC64, SHA-256                                                                            |
| `src/engine/lzma/output.ts`         |    26 | Output / dictionary buffer on `GrowableBuffer`                                                   |

Details: [extension-entry](../source/extension-entry.md), [viewer-ui](../source/viewer-ui.md),
[archive-engine](../source/archive-engine.md).

## `l10n/`

| Path                     | Lines | Purpose                                                                 |
| ------------------------ | ----: | ----------------------------------------------------------------------- |
| `l10n/translations.json` |   140 | Compiled de/es/fr translations (44 strings), imported by `src/index.ts` |
| `l10n/template.pot`      |   183 | All msgids (`pnpm l10n:extract`)                                        |
| `l10n/locale/de/app.po`  |   167 | German translations (AI-drafted)                                        |
| `l10n/locale/es/app.po`  |   167 | Spanish translations (AI-drafted)                                       |
| `l10n/locale/fr/app.po`  |   165 | French translations (AI-drafted)                                        |

## `tests/`

| Path                                     | Lines | Purpose                                                          |
| ---------------------------------------- | ----: | ---------------------------------------------------------------- |
| `tests/unit/App.spec.ts`                 |   173 | Viewer flow: range mode, renewal, fallbacks, limits, errors      |
| `tests/unit/ArchiveBrowser.spec.ts`      |   133 | Navigation, search, sort, downloads, entry cap, progress         |
| `tests/unit/limits.spec.ts`              |    52 | Device detection, limit resolution, manifest = defaults          |
| `tests/unit/compatibility.spec.ts`       |   101 | OpenCloud version check                                          |
| `tests/unit/index.spec.ts`               |    44 | Entry module: register, hide, override                           |
| `tests/unit/translations.spec.ts`        |    50 | Translation completeness and placeholders                        |
| `tests/unit/download.spec.ts`            |    85 | Safe selection-zip paths                                         |
| `tests/unit/rangeServer.ts`              |    38 | Test helper: `fetch` mock serving byte ranges                    |
| `tests/unit/engine/tar.spec.ts`          |    84 | TAR parser                                                       |
| `tests/unit/engine/zip.spec.ts`          |    95 | ZIP reader, range source, entry cap                              |
| `tests/unit/engine/rangeReader.spec.ts`  |    80 | Range reader: 206/200/401/errors/abort                           |
| `tests/unit/engine/gzip.spec.ts`         |    67 | gunzip + limit                                                   |
| `tests/unit/engine/buffer.spec.ts`       |   118 | Buffers, blob builder, out-of-memory mapping                     |
| `tests/unit/engine/workerClient.spec.ts` |    81 | Worker fallback (CSP), errors, abort                             |
| `tests/unit/engine/resizable.spec.ts`    |    78 | Engine on resizable buffers with browser-strict Blob/TextDecoder |
| `tests/unit/engine/tree.spec.ts`         |    71 | Folder index                                                     |
| `tests/unit/engine/detect.spec.ts`       |    66 | Format detection                                                 |
| `tests/unit/engine/tarBuilder.ts`        |    94 | Test helper: builds tar/gzip bytes                               |
| `tests/unit/engine/bzip2.spec.ts`        |    49 | bzip2 decoder vs libbz2 samples                                  |
| `tests/unit/engine/single.spec.ts`       |    66 | Single compressed files, .bz2/.tar.bz2 via openArchive           |
| `tests/unit/engine/bzip2Samples.ts`      |    48 | Test data: libbz2 output (base64) + SHA-256                      |
| `tests/unit/engine/xz.spec.ts`           |    94 | xz and legacy lzma decoders vs liblzma                           |
| `tests/unit/engine/xzSamples.ts`         |   140 | Test data: liblzma output (base64) + SHA-256                     |

## `e2e/`

Playwright suite, see [e2e](../testing/e2e.md).

| Path                              | Lines | Purpose                                                                              |
| --------------------------------- | ----: | ------------------------------------------------------------------------------------ |
| `e2e/test.ts`                     |   142 | Shared `test`: console guard, `Viewer` helpers, config/version/CSP rewrites, `phone` |
| `e2e/env.ts`                      |    23 | Base URL, credentials, fixture dir, `E2E_SKIP_LARGE`                                 |
| `e2e/login.setup.ts`              |    12 | Signs in once, saves the session                                                     |
| `e2e/global-setup.ts`             |    53 | Checks the served build, uploads fixtures, generates mobile-limit archives           |
| `e2e/global-teardown.ts`          |    12 | Deletes generated files, resets the language                                         |
| `e2e/helpers/server.ts`           |   109 | WebDAV upload/delete, trash purge, language (node:https)                             |
| `e2e/helpers/files.ts`            |    43 | SHA-256, archive contents via Python zipfile/tarfile                                 |
| `e2e/helpers/generate.ts`         |    49 | Streamed tar(.gz) of zeros                                                           |
| `e2e/helpers/memory.ts`           |    37 | Peak Chromium renderer RSS from /proc                                                |
| `e2e/specs/compatibility.spec.ts` |    25 | Spec (table in e2e.md)                                                               |
| `e2e/specs/browse.spec.ts`        |    80 | Spec (table in e2e.md)                                                               |
| `e2e/specs/formats.spec.ts`       |    75 | Spec (table in e2e.md)                                                               |
| `e2e/specs/preview.spec.ts`       |    44 | Spec (table in e2e.md)                                                               |
| `e2e/specs/download.spec.ts`      |    70 | Spec (table in e2e.md)                                                               |
| `e2e/specs/limits.spec.ts`        |    73 | Spec (table in e2e.md)                                                               |
| `e2e/specs/csp-fallback.spec.ts`  |    30 | Spec (table in e2e.md)                                                               |
| `e2e/specs/version-gate.spec.ts`  |    51 | Spec (table in e2e.md)                                                               |
| `e2e/specs/i18n.spec.ts`          |    31 | Spec (table in e2e.md)                                                               |
| `e2e/specs/large-zip.spec.ts`     |   143 | Spec (table in e2e.md)                                                               |

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
