# Repository Layout

Every tracked file after rework step 1, what it is, and its line count. `REF` = parked old code
(not built). Generated/ignored: `node_modules/`, `dist/`, `coverage/`, `.__mf__temp/`.

## Root

| Path               | Lines | Purpose                                                                    |
| ------------------ | ----: | -------------------------------------------------------------------------- |
| `README.md`        |   347 | Project readme (still describes the original feature set; rewrite pending) |
| `CLAUDE.md`        |   114 | Index into `docs/`                                                         |
| `LICENSE`          |   661 | GNU AGPL-3.0 (canonical gnu.org text); copyright notice is in `README.md`  |
| `package.json`     |    58 | Package metadata, scripts, devDependencies, `packageManager`               |
| `pnpm-lock.yaml`   |  5346 | Locked dependency tree                                                     |
| `.nvmrc`           |     1 | Node version for nvm (`24`)                                                |
| `vite.config.ts`   |     9 | `defineConfig` from extension-sdk (+ excludes `reference/` from tests)     |
| `tsconfig.json`    |     4 | Extends `@opencloud-eu/tsconfig`; excludes `reference/`                    |
| `extension.d.ts`   |     1 | Vite client types                                                          |
| `eslint.config.js` |     3 | OpenCloud ESLint config + ignores                                          |
| `.prettierrc.json` |     1 | OpenCloud Prettier config                                                  |
| `.prettierignore`  |     7 | dist, coverage, reference, lockfile, LICENSE, original docs, `.__mf__temp` |
| `.gitignore`       |    13 | node_modules, dist, coverage, editor/env files, `.__mf__temp/`             |

## `src/`

| Path           | Lines | Purpose                                                                       |
| -------------- | ----: | ----------------------------------------------------------------------------- |
| `src/index.ts` |    60 | `defineWebApplication`: file types, route via `AppWrapperRoute`, translations |
| `src/App.vue`  |    32 | Placeholder viewer (name + size)                                              |

Details: [extension-entry](../source/extension-entry.md).

## `l10n/`

| Path                     | Lines | Purpose                                                   |
| ------------------------ | ----: | --------------------------------------------------------- |
| `l10n/translations.json` |   102 | en/de/es/fr strings (23 keys each, mostly for the old UI) |

## `tests/`

| Path                     | Lines | Purpose                  |
| ------------------------ | ----: | ------------------------ |
| `tests/unit/App.spec.ts` |    34 | Unit tests for `App.vue` |

## `reference/` (REF — parked for the step 3 port, then deleted)

| Path                                         | Lines | Purpose                                                                             |
| -------------------------------------------- | ----: | ----------------------------------------------------------------------------------- |
| `reference/README.md`                        |    12 | What's parked and why                                                               |
| `reference/old-views/ArchiveViewer.vue`      |  1232 | Old viewer ([port notes](../source/reference-old-viewer.md))                        |
| `reference/old-views/ArchiveViewerLarge.vue` |  1305 | Old unused large-archive variant ([notes](../source/reference-old-viewer-large.md)) |
| `reference/old-tests/setup.ts`               |    65 | Old vitest mocks                                                                    |
| `reference/old-tests/ArchiveViewer.spec.ts`  |   172 | Old spec                                                                            |

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
