# Repository Layout

Every tracked file after rework step 3, what it is, and its line count. Generated/ignored: `node_modules/`, `dist/`, `coverage/`, `.__mf__temp/`.

## Root

| Path               | Lines | Purpose                                                                                   |
| ------------------ | ----: | ----------------------------------------------------------------------------------------- |
| `README.md`        |   347 | Project readme (still describes the original feature set; rewritten in step 6)            |
| `CLAUDE.md`        |   115 | Index into `docs/`                                                                        |
| `LICENSE`          |   661 | GNU AGPL-3.0 (canonical gnu.org text); copyright notice is in `README.md`                 |
| `package.json`     |    61 | Package metadata, scripts, `@zip.js/zip.js` dependency, devDependencies, `packageManager` |
| `pnpm-lock.yaml`   |  5356 | Locked dependency tree                                                                    |
| `.nvmrc`           |     1 | Node version for nvm (`24`)                                                               |
| `vite.config.ts`   |     5 | `defineConfig({ name: 'archive-viewer' })` from extension-sdk                             |
| `tsconfig.json`    |     4 | Extends `@opencloud-eu/tsconfig`                                                          |
| `extension.d.ts`   |     1 | Vite client types                                                                         |
| `eslint.config.js` |     3 | OpenCloud ESLint config + ignores                                                         |
| `.prettierrc.json` |     1 | OpenCloud Prettier config                                                                 |
| `.prettierignore`  |     6 | dist, coverage, lockfile, LICENSE, original docs, `.__mf__temp`                           |
| `.gitignore`       |    13 | node_modules, dist, coverage, editor/env files, `.__mf__temp/`                            |

## `src/`

| Path                                | Lines | Purpose                                                                                        |
| ----------------------------------- | ----: | ---------------------------------------------------------------------------------------------- |
| `src/index.ts`                      |    61 | `defineWebApplication`: Tailwind import, file types, route via `AppWrapperRoute`, translations |
| `src/manifest.json`                 |     6 | Default `config` (size limits) merged into `dist/manifest.json`                                |
| `src/App.vue`                       |   181 | Viewer shell: size check, streamed download with progress, detect + open, error states         |
| `src/components/ArchiveBrowser.vue` |   360 | File table: folders, breadcrumb, search, sort, selection, downloads                            |
| `src/components/PreviewModal.vue`   |   120 | Text/image preview in `oc-modal`                                                               |
| `src/download.ts`                   |    35 | `sanitizeFileName`, `triggerDownload`, `zipEntries` (selection → zip)                          |
| `src/engine/index.ts`               |    24 | `openArchive` + re-exports                                                                     |
| `src/engine/types.ts`               |    40 | Entry/handle types, `ArchiveError`                                                             |
| `src/engine/detect.ts`              |    68 | Extension + signature → format                                                                 |
| `src/engine/zip.ts`                 |    64 | ZIP via zip.js native build (no WebAssembly)                                                   |
| `src/engine/tar.ts`                 |   152 | Own TAR parser (ustar, pax, GNU long names)                                                    |
| `src/engine/gzip.ts`                |    39 | Browser `DecompressionStream` gunzip with size limit                                           |
| `src/engine/tree.ts`                |    66 | Path normalization and folder index                                                            |
| `src/engine/fileTypes.ts`           |    44 | Text/image detection and MIME types                                                            |

Details: [extension-entry](../source/extension-entry.md), [viewer-ui](../source/viewer-ui.md),
[archive-engine](../source/archive-engine.md).

## `l10n/`

| Path                     | Lines | Purpose                                                 |
| ------------------------ | ----: | ------------------------------------------------------- |
| `l10n/translations.json` |    38 | de/es/fr/en entries for strings still in use (7 msgids) |

## `tests/`

| Path                                | Lines | Purpose                                        |
| ----------------------------------- | ----: | ---------------------------------------------- |
| `tests/unit/App.spec.ts`            |    91 | Viewer flow: limit, download/open/list, errors |
| `tests/unit/ArchiveBrowser.spec.ts` |    83 | Navigation, search, sort, downloads            |
| `tests/unit/engine/tar.spec.ts`     |    60 | TAR parser                                     |
| `tests/unit/engine/zip.spec.ts`     |    49 | ZIP reader                                     |
| `tests/unit/engine/gzip.spec.ts`    |    22 | gunzip + limit                                 |
| `tests/unit/engine/tree.spec.ts`    |    57 | Folder index                                   |
| `tests/unit/engine/detect.spec.ts`  |    45 | Format detection                               |
| `tests/unit/engine/tarBuilder.ts`   |    92 | Test helper: builds tar/gzip bytes             |

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
