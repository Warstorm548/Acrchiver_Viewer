# Repository Layout

Every tracked file, what it is, and which implementation it belongs to.
**Legend:** `VUE` = OpenCloud Vue/TS app, `LEGACY` = vanilla-JS webpack app, `SHARED` = used by
both or by neither specifically, `DEAD` = present but not referenced.

## Root

| Path | Lines | Belongs to | Purpose |
|------|------:|-----------|---------|
| `README.md` | 335 | SHARED | Project readme; describes mostly the legacy app; many claims unverified |
| `CLAUDE.md` | — | SHARED | Index into `docs/` (this knowledge base) |
| `LICENSE` | 21 | SHARED | MIT, "Copyright (c) 2025 OpenCloud.eu" |
| `package.json` | 44 | LEGACY | npm manifest; only webpack/legacy deps and scripts |
| `manifest.json` | 50 | SHARED | App manifest (id, formats, MIME types, features); says Apache-2.0 |
| `appinfo/info.json` | 33 | SHARED | Nextcloud-style app info (`licence`, `types`, `mimes`) |
| `index.html` | 56 | LEGACY | Standalone test page with a mock OpenCloud context |
| `webpack.config.js` | 53 | LEGACY | Builds `src/index.js` → `dist/app.js` (UMD) |
| `vite.config.ts` | 26 | VUE | Vite config using `@opencloud-eu/extension-sdk` |
| `vitest.config.ts` | 28 | VUE | Test runner config (jsdom, `@` alias → `src`) |
| `tsconfig.json` | 25 | VUE | Strict TS, bundler resolution, `noEmit` |
| `tsconfig.node.json` | 10 | VUE | TS config for `vite.config.ts` only |
| `Dockerfile` | 38 | SHARED | pnpm build → nginx image |
| `docker-compose.yml` | 31 | SHARED | Runs the image on port 8080 |
| `nginx.conf` | 39 | SHARED | Serves `/archive-viewer/` |
| `install.sh` | 146 | SHARED | Interactive build + copy + optional Docker deploy |
| `.nvmrc` | 1 | SHARED | Node version for nvm (`24`); see [build-tooling](../tech-stack/build-tooling.md) |

## `src/`

| Path | Lines | Belongs to | Purpose |
|------|------:|-----------|---------|
| `src/index.ts` | 125 | VUE | `defineWebApplication` entry: extensions, route, translations |
| `src/views/ArchiveViewer.vue` | 1232 | VUE | The viewer component actually routed to |
| `src/views/ArchiveViewerLarge.vue` | 1305 | DEAD | Alternate "large archive" viewer, never imported |
| `src/utils/memory.ts` | 365 | DEAD | Memory/streaming helpers, never imported |
| `src/types.d.ts` | 159 | VUE | Hand-written module types for libarchive.js, web-pkg, extension-sdk |
| `src/translations.json` | 102 | VUE | en/de/es/fr strings (23 keys each) |
| `src/index.js` | 361 | LEGACY | `ArchiveViewerApp` class + `OC.Plugins.register` |
| `src/lib/StreamProcessor.js` | 472 | LEGACY | HTTP Range-based ZIP/TAR reading |
| `src/lib/ArchiveReader.js` | 142 | LEGACY (DEAD) | In-memory ZIP/TAR listing; instantiated but never called |
| `src/lib/ArchiveWriter.js` | 241 | LEGACY | Create ZIP/TAR/TAR.GZ; edit/add/remove are stubs |
| `src/lib/UIManager.js` | 735 | LEGACY | DOM rendering via `innerHTML` templates |
| `src/styles/main.css` | 608 | LEGACY | Styles for `UIManager` markup (Vue views use scoped styles) |

## `tests/`

| Path | Lines | Belongs to | Purpose |
|------|------:|-----------|---------|
| `tests/setup.ts` | 65 | VUE | Mocks libarchive.js, web-pkg, vue-router; stubs observers |
| `tests/unit/ArchiveViewer.spec.ts` | 172 | VUE | Unit tests for `ArchiveViewer.vue` helpers and state |

## `public/`

| Path | Lines | Belongs to | Purpose |
|------|------:|-----------|---------|
| `public/index.html` | 17 | VUE (?) | Loads `/archive-viewer/index.js` as a module (neither build outputs that file; webpack emits `app.js`); favicons it references don't exist. OpenCloud extensions are loaded by the host, so this page is likely unnecessary |

## `docs/`

This knowledge base. See `CLAUDE.md` for the index. Original uploaded docs (API, INSTALL,
CHANGELOG, CONTRIBUTING, PROJECT-SUMMARY, QUICK-REFERENCE) live in `docs/original-docs/`.

## Not in the repo (but referenced)

- `pnpm-lock.yaml` — referenced by `Dockerfile` and `install.sh`.
- `libarchive.worker-bundle.js` — expected at `/archive-viewer/` by `src/index.ts:14`.
- `img/screenshot.png` — referenced by `appinfo/info.json`.
- `favicon.svg` / `favicon.png` — referenced by `public/index.html`.
- `404.html` / `50x.html` — referenced by `nginx.conf`.
- `.eslintrc*`, `.babelrc`, `.gitignore` — none present (`npm run lint` has no config).
- `WEB-APP-ARCHIVE-VIEWER-COMPLETE.md` — referenced by `QUICK-REFERENCE.md`.
