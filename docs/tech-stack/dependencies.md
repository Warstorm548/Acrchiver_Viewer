# Dependencies

State after rework step 3. OpenCloud packages are **devDependencies**, matching OpenCloud's
extensions: the host provides those shared modules at runtime. The one **runtime dependency** is
the ZIP library, which is bundled into the app.

## dependencies (bundled)

| Package          | Range                                  | Role                                                                                                                                                                                                                                                                                                             |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zip.js/zip.js` | `2.24.0` (exact, like `web-app-unzip`) | ZIP reading and writing. Imported **only** from `@zip.js/zip.js/lib/zip-native.js`: the default build uses WebAssembly (`zip-module.wasm`), which OpenCloud's production CSP blocks; the native build uses the browser's `DecompressionStream` in an inline `blob:` worker. Do not import from the package root. |

TAR and gzip need no library (own parser + browser `DecompressionStream`). XZ/LZMA uses our own
decoder (`src/engine/xz.ts`, `lzma/`, partly adapted from xz-compat, MIT). bzip2 uses
**vendored code**, not an npm package: `src/engine/bzip2.ts` is a port of `seek-bzip` 2.0.0 (MIT),
whose npm build depends on Node's `Buffer` and can't run in a browser. License texts:
`THIRD-PARTY-NOTICES.md`.

## devDependencies (installed versions from `pnpm-lock.yaml`)

| Package                          | Range   | Installed | Role                                                                                           |
| -------------------------------- | ------- | --------- | ---------------------------------------------------------------------------------------------- |
| `@opencloud-eu/web-pkg`          | ~8.0.0  | 8.0.0     | `defineWebApplication`, `AppWrapperRoute`, `formatFileSize`, types (host-provided at runtime)  |
| `@opencloud-eu/web-client`       | ~8.0.0  | 8.0.0     | `Resource` type, WebDAV client (host-provided)                                                 |
| `@opencloud-eu/extension-sdk`    | ~8.0.0  | 8.0.0     | `defineConfig` for Vite/Vitest                                                                 |
| `@opencloud-eu/tsconfig`         | ~8.0.0  | 8.0.0     | Base `tsconfig`                                                                                |
| `@opencloud-eu/eslint-config`    | ~8.0.0  | 8.0.0     | ESLint rules                                                                                   |
| `@opencloud-eu/prettier-config`  | ~8.0.0  | 8.0.0     | Prettier rules                                                                                 |
| `@opencloud-eu/web-test-helpers` | ~8.0.0  | 8.0.0     | `mount`, `defaultPlugins` for tests                                                            |
| `vue`                            | ^3.5.10 | 3.5.44    | Host-provided at runtime                                                                       |
| `vue3-gettext`                   | 4.0.1   | 4.0.1     | `useGettext` (host-provided)                                                                   |
| `vite`                           | ^8.0.3  | 8.3.5     | Build                                                                                          |
| `vitest`                         | ^5.0.0  | 5.0.5     | Tests                                                                                          |
| `happy-dom`                      | ^20.0.0 | 20.14.6   | Test DOM                                                                                       |
| `@vue/test-utils`                | ^2.4.6  | 2.5.1     | Component mounting                                                                             |
| `vitest-mock-extended`           | ^5.0.0  | 5.1.1     | `mock<T>()`                                                                                    |
| `@playwright/test`               | 1.64.1  | 1.64.1    | E2E tests in Chromium 156 ([e2e](../testing/e2e.md)); exact pin, its Chromium is bundled to it |
| `typescript`                     | ^6.0.3  | 6.0.3     | Type-check                                                                                     |
| `vue-tsc`                        | ^3.2.6  | 3.3.13    | `.vue` type-check                                                                              |
| `eslint`                         | ^10.1.0 | 10.13.0   | Lint                                                                                           |
| `prettier`                       | ^3.8.1  | 3.9.10    | Format                                                                                         |
| `tailwindcss`                    | ^4.0.0  | 4.3.3     | Utility CSS (SDK runs `@tailwindcss/vite`)                                                     |
| `@types/node`                    | ^24.0.0 | 24.19.2   | Node types for config files                                                                    |

## Server helper (`server/go.mod`)

| Module                    | Version | Role                                                                                                                                                                           |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Go                        | 1.27    | Toolchain (`golang:1.27-alpine` in the Dockerfile; `~/.local/go` 1.27.3 on the dev machine)                                                                                    |
| `github.com/ulikunitz/xz` | v0.5.17 | Raw LZMA2 (`lzma.Reader2`) and legacy `.lzma`; BSD-3-Clause ([notices](../../THIRD-PARTY-NOTICES.md)). Its own xz reader is **not** used (no dictionary limit, no BCJ filters) |

gzip, bzip2, tar, zip (reading in tests), CRC/SHA and HTTP come from Go's standard library. The
runtime image is `gcr.io/distroless/static-debian12` (no shell, no package manager).

## OpenCloud version alignment

The main server runs OpenCloud rolling **8.0.1**, so the `@opencloud-eu/*` packages are pinned to
`~8.0.0` (npm has 8.0.0 and 8.1.0; 8.0.0 is the 8.0 line). Rule: build against the **oldest
OpenCloud version the app is deployed to**, and bump the pins when the server is upgraded.
8.0.0 and 8.1.0 use the same Vite/Vitest ranges and `@module-federation/vite` 1.14.2. All checks
pass on 8.0.0, which confirms `AppWrapperRoute`, `formatFileSize` and `AppConfigObject` exist in 8.0.

## Known install warnings (harmless, upstream)

`pnpm peers check` reports two unmet peers inside OpenCloud's own dependency tree:

- `@module-federation/dts-plugin` wants `typescript ^4.9 || ^5` (we use 6; the SDK sets `dts: false`).
- `focus-trap-vue` wants `focus-trap ^7` (8 installed via web-pkg).

Also two deprecated sub-dependencies (`cron-parser@4`, `node-domexception`). OpenCloud's own repo
has the same tree.

## Removed in step 1

`fflate`, `pako`, `node-7z`, `unrar-js`, `tar-stream` (legacy app / never used), the
`@opencloud/core` peer (doesn't exist), and all webpack/Babel tooling.

## Evaluated decoders (step 4, checked in the npm tarballs)

| Package                  | Verdict                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seek-bzip` 2.0.0 (MIT)  | Pure JS, no WebAssembly, but uses Node `new Buffer()` → **ported** into `src/engine/bzip2.ts`                                                                                                 |
| `xz-decompress` 0.2.3    | Uses WebAssembly → rejected                                                                                                                                                                   |
| `xz-compat` 1.2.11 (MIT) | Node-only as published (`process`, `path`, native-module loader); its LZMA decoder structure was **adapted** in step 4b (`src/engine/lzma/`); the container (28-bit integer cap) was not used |
| `libarchive.js`          | WebAssembly → not usable without a CSP change ([roadmap-considerations](../overview/roadmap-considerations.md))                                                                               |

## When changing dependencies

Update this table (ranges and installed versions), [build-tooling](build-tooling.md) and
[project-status](../overview/project-status.md). Commit the updated `pnpm-lock.yaml`.
