# Dependencies

Declared packages (`package.json`) versus what the source actually imports.

## Declared in `package.json`

### `dependencies`

| Package | Range | Used by | Notes |
|---------|-------|---------|-------|
| `fflate` | ^0.8.1 | LEGACY | `unzip`, `ungzip`, `inflate`, `zip`, `gzip` via dynamic `import()` |
| `pako` | ^2.1.0 | LEGACY | Imported in `StreamProcessor.decompress` but never used |
| `node-7z` | ^3.0.0 | none | Node-only wrapper for the 7z CLI; cannot run in a browser |
| `unrar-js` | ^2.0.0 | none | Never imported |
| `tar-stream` | ^3.1.6 | none | Never imported (Node streams) |

### `devDependencies`

`@babel/core`, `@babel/preset-env`, `babel-loader`, `webpack`, `webpack-cli`,
`webpack-dev-server`, `css-loader`, `style-loader`, `eslint` (^8.52). All serve the legacy
webpack build. There is no ESLint config file, so `npm run lint` would use defaults/fail.

### `peerDependencies`

`@opencloud/core: "*"` — not imported anywhere, and the Vue code uses `@opencloud-eu/web-pkg`
instead (a different scope).

## Imported but NOT declared

These are needed by the Vue app, its build or its tests:

| Package | Imported in |
|---------|-------------|
| `vue` | `ArchiveViewer.vue`, `ArchiveViewerLarge.vue`, `types.d.ts` |
| `vue-router` | both `.vue` views, `tests/setup.ts`, `types.d.ts` |
| `@opencloud-eu/web-pkg` | `src/index.ts`, both views, `tests/setup.ts` |
| `@opencloud-eu/extension-sdk` | `vite.config.ts` |
| `libarchive.js` | `src/index.ts`, both views, `tests/setup.ts` (imports `libarchive.js/main.js`) |
| `vite` | `vite.config.ts` |
| `@vitejs/plugin-vue` | `vite.config.ts`, `vitest.config.ts` |
| `vitest` | `vitest.config.ts`, tests |
| `@vue/test-utils` | `tests/unit/ArchiveViewer.spec.ts` |
| `jsdom` | `vitest.config.ts` (`environment: 'jsdom'`) |
| `@vitest/coverage-v8` | `vitest.config.ts` (`coverage.provider: 'v8'`) |
| `typescript` (+ `vue-tsc`) | implied by `tsconfig.json` / `.vue` `lang="ts"` |
| `stream-browserify`, `buffer`, `util`, `path-browserify` | `webpack.config.js` `resolve.fallback` |

## Runtime/browser APIs relied on

- `fetch` with `Range` header (legacy `StreamProcessor.fetchRange`).
- `ReadableStream` reader (`ArchiveViewer.vue` streaming path).
- `Blob`, `URL.createObjectURL`, `TextDecoder`/`TextEncoder`, `FileReader`.
- `performance.memory` (Chrome-only, non-standard) for memory warnings.
- `document.execCommand('copy')` (deprecated) in legacy share dialog.
- Web Worker + WASM for `libarchive.js` (worker file must be served; see
  [opencloud-integration](../architecture/opencloud-integration.md)).

## Hand-written type stubs

`src/types.d.ts` declares modules for `libarchive.js/main.js`, `@opencloud-eu/web-pkg` and
`@opencloud-eu/extension-sdk`. These are the author's guesses, not the packages' real types:
- `ArchiveEntry` is typed as `{ file }` only; libarchive.js entries also carry a `path`.
- `useClientService().webdav.getFileContents(resource)` is typed as returning a fetch `Response`;
  the real v8 signature is `getFileContents(space, { fileId, path }, { responseType })` returning
  `{ response, body, headers }` — confirmed, see
  [opencloud-v8-compatibility](../architecture/opencloud-v8-compatibility.md).
- If the real packages are installed, their own types would conflict with or shadow these.

## When changing dependencies

Update this file, [build-tooling](build-tooling.md), and the dependency sections of
[project-status](../overview/project-status.md).
