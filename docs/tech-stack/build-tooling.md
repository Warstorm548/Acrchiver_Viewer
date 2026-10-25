# Build Tooling

Copied from OpenCloud's own extensions (`opencloud-eu/web-extensions`), adapted to a standalone
repo. Everything below was run successfully in rework step 1.

## Node and pnpm

- `.nvmrc` pins Node **24** (LTS; OpenCloud web pins `24.22.1`, `engines >=22`). With nvm:
  `nvm use` in the repo root, or automatic on `cd` with the nvm auto-use shell hook.
- `package.json` `packageManager: pnpm@11.28.8`; Corepack (bundled with Node 24) provides it after
  `corepack enable`. Node 25+ no longer bundles Corepack.
- `engines.node >=22`.
- `pnpm-lock.yaml` is committed; install with `pnpm install` (CI: `--frozen-lockfile`).

## Scripts (`package.json`)

| Script                          | Command                                 | Purpose                                            |
| ------------------------------- | --------------------------------------- | -------------------------------------------------- |
| `build`                         | `vite build`                            | Production build to `dist/`                        |
| `build:w`                       | `vite build --watch --mode development` | Rebuild on change (for a mounted apps dir)         |
| `check:types`                   | `vue-tsc --noEmit`                      | Type-check `.ts` and `.vue`                        |
| `lint`                          | `eslint .`                              | `@opencloud-eu/eslint-config`                      |
| `format:check` / `format:write` | `prettier . --check/--write`            | `@opencloud-eu/prettier-config`                    |
| `test:unit`                     | `vitest`                                | Unit tests (watch; add `--run` for once)           |
| `package`                       | `node scripts/package.mjs`              | Release zip from `dist/` (see below)               |
| `l10n:extract`                  | `vue-gettext-extract`                   | Strings → `l10n/template.pot` + `.po` files        |
| `l10n:compile`                  | `vue-gettext-compile` + Prettier        | `.po` files → `l10n/translations.json` (formatted) |

## Vite — `vite.config.ts`

`defineConfig({ name: 'archive-viewer', build })` from
`@opencloud-eu/extension-sdk` 8.0.0 (pinned to the server's 8.0 line). Our only override is
`build.rollupOptions.output.postBanner`, which stamps `/*! archive-viewer v<version> */` (read from
`package.json`) on every compiled JS file. It must be `postBanner`: Rolldown adds a plain `banner`
before minifying, and the minifier strips it. The SDK supplies:

- `@vitejs/plugin-vue`, `@tailwindcss/vite`, `@vitejs/plugin-basic-ssl` (dev server).
- Module Federation (`@module-federation/vite`): exposes `./src/index.ts`, output
  `js/remoteEntry-[hash].mjs`, shares the host's `vue`, `pinia`, `luxon`, `vue3-gettext`,
  `@opencloud-eu/web-pkg`, `@opencloud-eu/web-client/*`, `yjs` as singletons (not bundled).
- Manifest generation (`dist/manifest.json`), see [deploying-to-opencloud](../deployment/deploying-to-opencloud.md).
- Dev server at `https://host.docker.internal:9210`, registering with an OpenCloud web host at
  `https://host.docker.internal:9201` (`OPENCLOUD_WEB_HOST_URL`) — not used; the local stack
  ([local-dev-environment](../deployment/local-dev-environment.md)) mounts `dist/` instead.
- Vitest config: `happy-dom`, globals, `clearMocks`, `**/*.spec.ts`, v8 coverage to `./coverage`.
  Overrides would be merged with Vite's `mergeConfig` (a `test.exclude` **adds** to the SDK's
  excludes).

Build-time notes seen in step 1 (harmless, from the SDK/its deps): "Yjs was already imported" and a
Vite deprecation warning about `resolve.alias` `customResolver`. The build creates `.__mf__temp/`
(gitignored, ignored by ESLint/Prettier).

## TypeScript — `tsconfig.json`, `extension.d.ts`

- `extends @opencloud-eu/tsconfig`: ES2022, `module: preserve`, `strict` with
  `strictNullChecks: false` and `useUnknownInCatchVariables: false`, `resolveJsonModule`,
  `isolatedModules`, `types: ['vitest/globals']`.
- `exclude: ['node_modules', 'dist']`.
- `extension.d.ts`: `/// <reference types="vite/client" />`.
- `typescript ^6` (TypeScript 7 exists but OpenCloud stays on 6; `vue-tsc ^3`).

## Lint / format

- `eslint.config.js`: `[...openCloudConfig, { ignores: ['dist', 'coverage', '.__mf__temp'] }]`
  (also lints `scripts/package.mjs`).
- `.prettierrc.json`: `"@opencloud-eu/prettier-config"`.
- `.prettierignore`: dist, coverage, `pnpm-lock.yaml`, LICENSE, `docs/original-docs`,
  `.__mf__temp`, `release`, `l10n/template.pot`, `l10n/locale` (gettext's own format).

## `.gitignore`

node_modules, dist, coverage, logs, `.env`/`.envrc`, `.DS_Store`, `.idea`, `.vscode`, `.__mf__temp/`,
`release/`.

## Release zip — `scripts/package.mjs`

`pnpm build && pnpm package` writes `release/archive-viewer-<version>.zip` (top folder
`archive-viewer/` holding the contents of `dist/` plus `LICENSE` and `THIRD-PARTY-NOTICES.md`,
ready to unzip into an apps folder) and
`release/archive-viewer-<version>.zip.sha256`. Uses zip.js (Node, no workers) — no extra package
or system `zip`. Stops if `dist/` is missing or its manifest version differs from `package.json`.
Verified in step 6: checksum OK, unzipped folder identical to `dist/` plus the two notices.
The root path uses `fileURLToPath`, so checkouts in folders with spaces work.

## Translations — `gettext.config.cjs`

See [styles-and-i18n](../source/styles-and-i18n.md). Extraction needs GNU gettext
(`sudo apt install gettext`); compiling and building don't.

## When changing

Update this file and [dependencies](dependencies.md).
