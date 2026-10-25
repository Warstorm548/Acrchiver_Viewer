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

| Script                          | Command                                 | Purpose                                    |
| ------------------------------- | --------------------------------------- | ------------------------------------------ |
| `build`                         | `vite build`                            | Production build to `dist/`                |
| `build:w`                       | `vite build --watch --mode development` | Rebuild on change (for a mounted apps dir) |
| `check:types`                   | `vue-tsc --noEmit`                      | Type-check `.ts` and `.vue`                |
| `lint`                          | `eslint .`                              | `@opencloud-eu/eslint-config`              |
| `format:check` / `format:write` | `prettier . --check/--write`            | `@opencloud-eu/prettier-config`            |
| `test:unit`                     | `vitest`                                | Unit tests (watch; add `--run` for once)   |

## Vite — `vite.config.ts`

`defineConfig({ name: 'archive-viewer', test: { exclude: ['reference/**'] } })` from
`@opencloud-eu/extension-sdk` 8.0.0 (pinned to the server's 8.0 line). The SDK supplies:

- `@vitejs/plugin-vue`, `@tailwindcss/vite`, `@vitejs/plugin-basic-ssl` (dev server).
- Module Federation (`@module-federation/vite`): exposes `./src/index.ts`, output
  `js/remoteEntry-[hash].mjs`, shares the host's `vue`, `pinia`, `luxon`, `vue3-gettext`,
  `@opencloud-eu/web-pkg`, `@opencloud-eu/web-client/*`, `yjs` as singletons (not bundled).
- Manifest generation (`dist/manifest.json`), see [deploying-to-opencloud](../deployment/deploying-to-opencloud.md).
- Dev server at `https://host.docker.internal:9210`, registering with an OpenCloud web host at
  `https://host.docker.internal:9201` (`OPENCLOUD_WEB_HOST_URL`) — not used; the local stack
  ([local-dev-environment](../deployment/local-dev-environment.md)) mounts `dist/` instead.
- Vitest config: `happy-dom`, globals, `clearMocks`, `**/*.spec.ts`, v8 coverage to `./coverage`.
  Overrides are merged with Vite's `mergeConfig`, so `test.exclude` **adds** `reference/**` to the
  SDK's excludes.

Build-time notes seen in step 1 (harmless, from the SDK/its deps): "Yjs was already imported" and a
Vite deprecation warning about `resolve.alias` `customResolver`. The build creates `.__mf__temp/`
(gitignored, ignored by ESLint/Prettier).

## TypeScript — `tsconfig.json`, `extension.d.ts`

- `extends @opencloud-eu/tsconfig`: ES2022, `module: preserve`, `strict` with
  `strictNullChecks: false` and `useUnknownInCatchVariables: false`, `resolveJsonModule`,
  `isolatedModules`, `types: ['vitest/globals']`.
- `exclude: ['node_modules', 'dist', 'reference']`.
- `extension.d.ts`: `/// <reference types="vite/client" />`.
- `typescript ^6` (TypeScript 7 exists but OpenCloud stays on 6; `vue-tsc ^3`).

## Lint / format

- `eslint.config.js`: `[...openCloudConfig, { ignores: ['dist', 'coverage', 'reference', '.__mf__temp'] }]`.
- `.prettierrc.json`: `"@opencloud-eu/prettier-config"`.
- `.prettierignore`: dist, coverage, reference, `pnpm-lock.yaml`, LICENSE, `docs/original-docs`,
  `.__mf__temp`.

## `.gitignore`

node_modules, dist, coverage, logs, `.env`/`.envrc`, `.DS_Store`, `.idea`, `.vscode`, `.__mf__temp/`.

## When changing

Update this file and [dependencies](dependencies.md).
