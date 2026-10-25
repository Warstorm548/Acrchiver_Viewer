# Build Tooling

Two build systems coexist, one per app. Neither is wired up end to end.

## npm scripts (`package.json`)

| Script | Command | Target |
|--------|---------|--------|
| `build` | `webpack --mode production` | LEGACY |
| `dev` | `webpack serve --mode development` | LEGACY (port 9000) |
| `watch` | `webpack --mode development --watch` | LEGACY |
| `lint` | `eslint src/` | both (no ESLint config present) |

There is **no** script for Vite, `vue-tsc`, or `vitest`.

## Webpack (legacy app) — `webpack.config.js`

- Entry `./src/index.js` → `dist/app.js`, UMD library `ArchiveViewer`, `libraryExport: 'default'`.
- Loaders: `babel-loader` (`@babel/preset-env`) for `.js`; `style-loader` + `css-loader` for `.css`.
  No loader for `.ts` or `.vue`, so webpack cannot build the Vue app.
- `resolve.fallback` calls `require.resolve` on `stream-browserify`, `buffer/`, `util/`,
  `path-browserify`. None are installed, so **loading the config throws** before any build.
  None of these polyfills are actually needed by the legacy source.
- `devServer` serves `dist/` on port 9000 with HMR.
- `performance.hints: false`.

Root `index.html` loads `dist/app.js` and starts the app with a mock context, for standalone testing.
It links `styles/main.css`, which doesn't exist at that path (the CSS is at `src/styles/main.css`
and is bundled by webpack anyway).

## Vite (Vue app) — `vite.config.ts`

- Spreads `defaultConfig` from `@opencloud-eu/extension-sdk`, then **overrides** `plugins` and
  `build` entirely, which likely discards the SDK's own plugins/build settings (unverified —
  depends on what `defaultConfig` contains).
- `plugins: [vue()]`.
- `build.rollupOptions.external: ['vue']` with global `Vue`. `vue-router` and
  `@opencloud-eu/web-pkg` are not externalized, so they would be bundled into the extension
  instead of shared with the host (**verify** what the SDK's `defaultConfig` already handles).
- `optimizeDeps.include: ['libarchive.js']`.
- `server.fs.allow: ['..']`.
- No entry/lib config of its own; no step copies the libarchive.js worker bundle into the output.

## TypeScript

- `tsconfig.json`: ES2020, `moduleResolution: bundler`, `strict`, `noUnusedLocals`,
  `noUnusedParameters`, `noEmit`, includes `src/**/*.{ts,d.ts,tsx,vue}`.
- `tsconfig.node.json`: composite config for `vite.config.ts`.
- Type-check would currently flag (once deps exist), for example:
  - `src/index.ts` imports `useClientService`, `useResourcesStore`, `useLoadingService` unused,
    and `applicationConfig` is unused.
  - `ArchiveViewer.vue` `downloadFileStreaming` declares `chunks`/`totalExtracted` unused.
  - `global` is not a browser global (no `@types/node`).

## Vitest — `vitest.config.ts`

`globals: true`, `environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`, v8 coverage,
alias `@` → `./src`. See [tests](../testing/tests.md).

## Node version

`.nvmrc` pins Node **24** (LTS, matching OpenCloud web's Volta pin `24.22.1` and `engines >=22`).
With nvm: `nvm use` in the repo root (or automatic on `cd` if the nvm auto-use shell hook is set
up). Node 24 bundles Corepack, so `corepack enable` provides pnpm; Node 25+ no longer bundles it.

## Package manager

`Dockerfile` and `install.sh` use **pnpm** (`pnpm@9.0.0` in Docker) with `--frozen-lockfile`,
but no `pnpm-lock.yaml` is committed, so both fail at install. No `packageManager` field yet;
OpenCloud's own repos pin `pnpm@11.28.x`, which Corepack would pick up once added.

## Minimum to get a working build (Vue app)

1. Add the undeclared packages listed in [dependencies](dependencies.md).
2. Add scripts, e.g. `build: vite build`, `test: vitest`, `typecheck: vue-tsc --noEmit`.
3. Commit a lockfile.
4. Ship `libarchive.js`'s worker bundle (and WASM) at the URL `src/index.ts` points to.
5. Remove `webpack.config.js` and webpack deps if the legacy app is dropped.
