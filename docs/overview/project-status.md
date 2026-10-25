# Project Status

Where the Archive Viewer stands. Branch `feat/opencloud-v8-compat`, rework **step 1 of 6 done**
(clean up and rebuild the setup).

## Summary

The repo is now a single, standalone **OpenCloud v8 web extension** built with OpenCloud's own
toolchain (`@opencloud-eu/extension-sdk` 8.1.0, Vite 8, Vue 3, TypeScript 6, pnpm 11, Node 24).
It builds, type-checks, lints and passes its unit tests. The viewer itself is still a placeholder
that shows the archive's name and size: no archive is read yet. The old pre-v8 viewer is parked
in `reference/` as material for the port. History: the original upload held a legacy vanilla-JS
app, a broken webpack build and an nginx deployment — all removed in step 1.

## Build / run status (verified in step 1)

| Item                          | Status                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| `pnpm install`                | OK (lockfile committed; 2 harmless upstream peer warnings)   |
| `pnpm build`                  | OK → `dist/manifest.json` + `dist/js/remoteEntry-<hash>.mjs` |
| `pnpm check:types`            | OK                                                           |
| `pnpm lint`                   | OK                                                           |
| `pnpm test:unit --run`        | OK, 2/2                                                      |
| Loaded in a running OpenCloud | **Not yet** (step 2)                                         |

## Feature status

| Feature                                                | State                                               |
| ------------------------------------------------------ | --------------------------------------------------- |
| Registered for zip, tar, gz, tgz, bz2, xz, 7z, rar     | Done (`appInfo.extensions`) — untested in OpenCloud |
| Opens via `AppWrapperRoute` with the file's `resource` | Done — untested in OpenCloud                        |
| List archive contents, folders, search, sort           | Not started (step 3; old code in `reference/`)      |
| Preview text/images, download single files             | Not started (step 3)                                |
| More formats with size limits                          | Not started (step 4)                                |
| Large ZIPs via Range requests                          | Not started (step 5)                                |
| Editing, sharing, creating archives                    | Not planned (old README claims)                     |

`README.md` still describes the original, aspirational feature set and the old webpack setup; it
has not been rewritten yet.

## Rework plan

1. ~~Clean up and rebuild the setup~~ (done).
2. Run OpenCloud v8 locally (opencloud-compose), install the app, confirm "Open with" on `.zip`.
3. Port the viewer UI onto `AppWrapperRoute` props; fix V1, V5, V6, V14; pick the archive engine.
4. Remaining formats with size limits from `apps.yaml`.
5. Large ZIPs via the `url` prop + Range reads (if signed URLs allow it).
6. Tests, translations, docs, README.

Pending decisions: scope (viewer vs. also extract), engine (libarchive.js / zip.js / both), size
limits. Details: [opencloud-v8-compatibility](../architecture/opencloud-v8-compatibility.md).

## Metadata

- License **AGPL-3.0** (`LICENSE` = canonical gnu.org text; `package.json`; README; generated
  `dist/manifest.json`).
- Author **Warstorm548**; repo/bugs → `Warstorm548/Acrchiver_Viewer`. README states the project is
  independent and not affiliated with OpenCloud GmbH.
- Version `0.1.0` (never released; the old "1.0.0 Production Ready" changelog in
  `docs/original-docs/` is historical and inaccurate).
