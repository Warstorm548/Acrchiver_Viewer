# OpenCloud v8 Compatibility

**Verdict (after rework step 6): compatible and functional on OpenCloud 8.0.1** for ZIP, TAR,
TAR.GZ/TGZ, TAR.BZ2/TBZ2, TAR.XZ/TXZ, legacy TAR.LZMA/TLZ and single .gz/.bz2/.xz/.lzma files
(pure JavaScript, no CSP change; bzip2/xz/lzma run in a `blob:` Web Worker). ZIPs of any size
are read by HTTP Range requests (step 5). The toolchain, app registration and route wiring match OpenCloud v8. The app is built
against the 8.0 packages (the main server runs rolling **8.0.1**; latest is 8.1.0) and was
verified on a local opencloud-compose stack: "Open in Archive Viewer" works for zip, tar and
tar.gz. Researched 2026-10-25 against `opencloud-eu/web-extensions` (`web-app-json-viewer`,
`web-app-unzip`) and the `opencloud-eu/web` source (`packages/extension-sdk`,
`packages/web-client`, `packages/web-pkg`).

## Resolved in step 1

| #   | Area           | Before                                                 | Now                                                                                                                                      |
| --- | -------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Build config   | `defaultConfig` import (doesn't exist)                 | `defineConfig({ name: 'archive-viewer' })` from extension-sdk 8.1.0                                                                      |
| C2  | File types     | String list + `handler` objects in the registry key    | `appInfo.extensions: [{ extension, routeName }]`                                                                                         |
| C3  | Route wiring   | Bare component, `route.query.fileId`, `resourcesStore` | `AppWrapperRoute(App, { applicationId })`, `/:driveAliasAndItem(.*)?`, `authContext: 'hybrid'`, `patchCleanPath`                         |
| C5  | Types          | Hand-written `src/types.d.ts`                          | Deleted; real package types                                                                                                              |
| C6  | i18n           | Global `$gettext` only, `src/translations.json`        | `useGettext()`, `l10n/translations.json`                                                                                                 |
| C8  | Shared modules | Undeclared                                             | Host modules as devDependencies; SDK marks them shared                                                                                   |
| C9  | Deployment     | nginx container, `install.sh`, `appinfo/`              | Removed; v8 apps-dir install documented in [deploying-to-opencloud](../deployment/deploying-to-opencloud.md) (to be exercised in step 2) |
| C10 | License        | MIT/Apache mix                                         | AGPL-3.0                                                                                                                                 |

## Resolved in step 3

| #   | Area               | Now                                                                                                  |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| C4  | Fetching the file  | Viewer declares the `url` prop (pre-signed `downloadURL`) and fetches it itself after a size check   |
| C7  | Theme tokens       | Tailwind (`ext:` prefix) with OpenCloud role colours; no `--oc-color-swatch-*`                       |
| C11 | Archive worker     | zip.js **native** build: inline `blob:` worker, no WebAssembly, nothing to ship separately           |
| C12 | Dialogs / messages | `oc-modal` preview, `useMessages().showErrorMessage`; no `confirm()`, no full-page error on failures |

## How `AppWrapperRoute` feeds a v8 viewer

From `packages/web-pkg/src/components/AppTemplates/AppWrapper.vue` / `AppWrapperRoute.ts`:

- Options: `applicationId`, `fileContentOptions` (`responseType: 'arraybuffer' | 'blob' | 'text'`),
  `urlForResourceOptions`, `importResourceWithExtension`, `disableAutoSave`, `yjs`.
- It resolves the file and space from the route, checks permissions (`isReadOnly`), shows loading
  and error states, then renders the component with props, **depending on which props it declares**:
  - declares `currentContent` → wrapper calls `getFileContents` and passes the **whole file**
    (binary if `fileContentOptions.responseType` is `arraybuffer`/`blob`; default `text`).
  - declares `url` → wrapper calls `getUrlForResource` → `webdav.getFileUrl(space, resource, …)`
    and passes a URL (a signed URL when the server supports URL signing; vault files become an
    in-memory blob URL). **Verified (step 5):** the signed URL answers `Range` with 206 (also
    through Traefik and on public links), `HEAD` with 401, and expires after 30 minutes — see
    [zip-range-reading](../source/zip-range-reading.md).
  - always available: `resource`, `space`, `applicationConfig`, `currentFileContext`,
    `isReadOnly`, `isDirty`, `activeFiles`, `isFolderLoading`.
- Declaring `update:currentContent` in `emits` turns the app into an editor (autosave etc.); a
  viewer should not.

## Archive engine facts

| Library          | Version (2026-10)           | Notes                                                                                                                                                                                                                                                         |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libarchive.js`  | 2.0.2, released 2024-01-27  | Many formats (zip, tar, 7z, rar, …) via WASM worker. Needs the whole archive as a `File`/`Blob`. Worker file is `dist/worker-bundle.js`. `getFilesArray()` returns `{ file: CompressedFile, path: 'dir/' }`; extract one file with `compressedFile.extract()` |
| `@zip.js/zip.js` | 2.24.0, released 2026-10-16 | ZIP only, actively maintained, web-worker based. Has HTTP Range readers, so a ZIP's index and single entries can be read without downloading the whole file. Used by `web-app-unzip`                                                                          |

TAR.GZ, BZ2, XZ, 7z and RAR cannot practically be read piecewise in the browser; they need the whole
file in memory (with a size limit) or server-side work.

## Overlap with the official `web-app-unzip`

`web-app-unzip` 2.2.1 registers an `action` extension on `global.files.context-actions` ("Unzip"):
downloads the ZIP via `getFileContents`, reads it with zip.js (`BlobReader`/`ZipReader`), and
uploads the extracted files into a folder via the upload service. ZIP only; limit
`maxArchiveSize` (default 64 MB) from `apps.yaml`. It does **not** browse or preview contents, so a
viewer is complementary rather than duplicate.

## Still compatible (carried over)

- `defineWebApplication` from `@opencloud-eu/web-pkg`.
- Design-system components used: `OcButton`, `OcModal`, `OcCheckbox`, `OcTextInput`, `OcSpinner`,
  `OcIcon` all exist in v8.
- The viewer UI logic (file list, breadcrumb, search, sort, selection, preview) can be ported.

## Reference shape (from `web-app-json-viewer`)

```ts
// vite.config.ts
import { defineConfig } from '@opencloud-eu/extension-sdk'
export default defineConfig({ name: 'json-viewer' })
```

```ts
// src/index.ts
export default defineWebApplication({
  setup() {
    const { $gettext } = useGettext()
    return {
      appInfo: {
        name: $gettext('JSON Viewer'),
        id,
        icon: 'file-code',
        defaultExtension: 'json',
        extensions: [{ extension: 'json', routeName: id }]
      },
      routes: [
        {
          name: id,
          path: '/:driveAliasAndItem(.*)?',
          component: AppWrapperRoute(App, { applicationId: id }),
          meta: { authContext: 'hybrid', title: $gettext('JSON Viewer'), patchCleanPath: true }
        }
      ],
      translations
    }
  }
})
```

`package.json`: `"type": "module"`, scripts `build: pnpm vite build`, `check:types: vue-tsc --noEmit`,
`test:unit: vitest`; devDeps `@opencloud-eu/web-client ^8`, `@opencloud-eu/web-pkg ^8`, `vue ^3.4`,
`vue3-gettext ^4`. Monorepo root adds `extension-sdk ^8.1.0`, `vite ^8`, `vitest ^5`,
`vue-tsc ^3`, `typescript ^6`, `happy-dom`, `@opencloud-eu/web-test-helpers`; `pnpm@11`.

## Answered in step 2

- **Compound extensions**: OpenCloud's `extractExtensionFromFile` (web-client
  `helpers/resource/functions.ts`) treats `tar.bz2`, `tar.gz`, `tar.xz` as single extensions, so
  `sample.tar.gz` did _not_ match `gz`. They are now registered explicitly; verified.
- **Production CSP** (opencloud-compose `config/opencloud/csp.yaml`, seen on 8.0.1):
  `worker-src 'self' blob:`, but `script-src 'self' 'unsafe-inline' https://keycloak…` — no
  `'wasm-unsafe-eval'`. **WebAssembly is blocked** on a default production server, so
  libarchive.js (WASM) would need a server CSP change; a pure-JS engine (zip.js) works as is.

## Open questions to test

- ~~Does the signed URL honour HTTP `Range`?~~ Yes (step 5).
- If a WASM engine is chosen: does it work once `'wasm-unsafe-eval'` is added to the server CSP?

## Migration outline (decisions pending)

1. **Done (step 1):** stripped legacy app/webpack/appinfo/nginx; v8 `package.json`,
   `vite.config.ts`, lockfile; minimal viewer builds, type-checks, lints and passes tests.
2. **Done (step 2):** local opencloud-compose stack on rolling 8.0.1, packages pinned to 8.0,
   app installed, "Open in Archive Viewer" verified (zip, tar, tar.gz).
3. **Done (step 3):** pure-JS engine (zip.js native, own TAR reader, browser gzip) and ported
   viewer UI on the `url` prop; old bugs V1, V5, V6, V14 fixed by design.
4. **Done (step 4):** bzip2 via a ported pure-JS decoder in an inline worker; single `.gz`/`.bz2`
   files; size limits from `apps.yaml` (since step 3). Step 4b: XZ.
5. **Done (step 5):** large ZIPs via Range reads with signed-URL renewal; device-aware limits
   (1 GiB desktop / 256 MiB mobile).
6. **Done (step 6):** de/es/fr translations with vue3-gettext tooling, README rewrite, release zip
   (`pnpm package`), final docs pass.

Decided: approach A (pure JS), view + download, range reads for ZIP, 1 GiB / 256 MiB limits. Alternatives (server
helper, libarchive as plain JS, extract-to-folder) are parked in
[roadmap-considerations](../overview/roadmap-considerations.md).

## Sources

- https://github.com/opencloud-eu/opencloud/releases
- https://docs.opencloud.eu/docs/dev/web/extension-system/viewer-editor-apps
- https://docs.opencloud.eu/docs/admin/configuration/web-applications
- https://github.com/opencloud-eu/web-extensions (`web-app-json-viewer`, `web-app-unzip`)
- https://github.com/opencloud-eu/web (`packages/extension-sdk`, `packages/web-client/src/webdav/getFileContents.ts`,
  `packages/web-pkg/src/components/AppTemplates/`, `packages/web-pkg/src/composables/appDefaults/useAppFileHandling.ts`)
- https://www.npmjs.com/package/libarchive.js, https://www.npmjs.com/package/@zip.js/zip.js

## When changing

Re-check against the latest OpenCloud release before relying on this table; update the verdict
and the date above. Also update [opencloud-integration](opencloud-integration.md) and
[bugs](../known-issues/bugs.md).
