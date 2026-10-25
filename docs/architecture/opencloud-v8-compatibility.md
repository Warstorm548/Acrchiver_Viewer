# OpenCloud v8 Compatibility

**Verdict: not compatible** with OpenCloud v8.1.0 (latest, released 2026-10-05).
Checked 2026-10-25 against OpenCloud's own extensions in `opencloud-eu/web-extensions`
(`web-app-json-viewer`, `web-app-unzip`, both on `@opencloud-eu/web-pkg ^8.0.0`) and the
`opencloud-eu/web` source (`packages/extension-sdk`, `packages/web-client`, `packages/web-pkg`).

## Blockers

| # | Area | This repo | v8 reality |
|---|------|-----------|-----------|
| C1 | Build config | `vite.config.ts` imports `defaultConfig` from `@opencloud-eu/extension-sdk` and overrides `plugins`/`build` | SDK 8.1.0 exports only `defineConfig({ name })`, which sets up Module Federation, shared host modules, hashed output and manifest generation |
| C2 | File-type registration | `appInfo.extensions` is a string list; `ApplicationFileExtension` objects with a `handler` go in top-level `extensions` | File types go in `appInfo.extensions` as `{ extension, routeName }`; top-level `extensions` is the extension registry (`appMenuItem`, `action`…) |
| C3 | Route / component wiring | Route `/:driveAliasAndItem*` → bare `ArchiveViewer`; component reads `route.query.fileId` + `resourcesStore.getResource` | Route `/:driveAliasAndItem(.*)?` → `AppWrapperRoute(App, { applicationId })`, `meta: { authContext: 'hybrid', patchCleanPath: true }` (see below) |
| C4 | Fetching the file | `clientService.webdav.getFileContents(resource)` then `.arrayBuffer()` / `.body.getReader()` | `getFileContents(space, { fileId, path }, { responseType })` returns `{ response, body, headers }` (axios). Missing 2nd argument → `TypeError` on destructuring |
| C5 | Types | Hand-written stubs in `src/types.d.ts` | Real types ship with `@opencloud-eu/web-pkg` / `web-client`; stubs conflict |
| C11 | Archive worker | `Archive.init({ workerUrl: '/archive-viewer/libarchive.worker-bundle.js' })` | Worker must ship inside the extension build and be referenced relative to it (Vite `?worker&url` / `new URL(..., import.meta.url)`), as `web-app-unzip` does for zip.js |

## Mismatches

| # | Area | Note |
|---|------|------|
| C6 | i18n | Official apps use `useGettext()` from `vue3-gettext`; translations live in `l10n/translations.json` |
| C7 | Theme tokens | `--oc-color-swatch-*` vars not found in the current web repo; v8 uses `--oc-role-*` (e.g. `--oc-role-chrome`) |
| C8 | Shared modules | Host provides `vue`, `pinia`, `luxon`, `vue3-gettext`, `@opencloud-eu/web-pkg`, `@opencloud-eu/web-client/*`, `yjs` (`extension-sdk/src/externalModules.ts`); official apps list them as devDependencies |
| C9 | Deployment | Copy the built app folder into `$OC_DATA_DIR/web/assets/apps` (or `opencloud-compose/config/opencloud/apps`) and restart; config via `$OC_CONFIG_DIR/apps.yaml` (`<app-id>: config: …`, arrives as `applicationConfig`) or the app's `config.json`. This repo's `install.sh`, nginx container and `appinfo/info.json` don't follow this |
| C12 | Dialogs / messages | Uses `confirm()` and a full-page error; v8 apps use the host modal service and `useMessages()` |

C10 (license) is resolved: the project is now AGPL-3.0, the same as OpenCloud's extensions.

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
    in-memory blob URL). A signed URL is what would allow HTTP Range reads of large archives —
    **Range support on it is untested**.
  - always available: `resource`, `space`, `applicationConfig`, `currentFileContext`,
    `isReadOnly`, `isDirty`, `activeFiles`, `isFolderLoading`.
- Declaring `update:currentContent` in `emits` turns the app into an editor (autosave etc.); a
  viewer should not.

## Archive engine facts

| Library | Version (2026-10) | Notes |
|---------|------------------|-------|
| `libarchive.js` | 2.0.2, released 2024-01-27 | Many formats (zip, tar, 7z, rar, …) via WASM worker. Needs the whole archive as a `File`/`Blob`. Worker file is `dist/worker-bundle.js`. `getFilesArray()` returns `{ file: CompressedFile, path: 'dir/' }`; extract one file with `compressedFile.extract()` |
| `@zip.js/zip.js` | 2.24.0, released 2026-10-16 | ZIP only, actively maintained, web-worker based. Has HTTP Range readers, so a ZIP's index and single entries can be read without downloading the whole file. Used by `web-app-unzip` |

TAR.GZ, BZ2, XZ, 7z and RAR cannot practically be read piecewise in the browser; they need the whole
file in memory (with a size limit) or server-side work.

## Overlap with the official `web-app-unzip`

`web-app-unzip` 2.2.1 registers an `action` extension on `global.files.context-actions` ("Unzip"):
downloads the ZIP via `getFileContents`, reads it with zip.js (`BlobReader`/`ZipReader`), and
uploads the extracted files into a folder via the upload service. ZIP only; limit
`maxArchiveSize` (default 64 MB) from `apps.yaml`. It does **not** browse or preview contents, so a
viewer is complementary rather than duplicate.

## Still compatible

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
      appInfo: { name: $gettext('JSON Viewer'), id, icon: 'file-code',
                 defaultExtension: 'json',
                 extensions: [{ extension: 'json', routeName: id }] },
      routes: [{ name: id, path: '/:driveAliasAndItem(.*)?',
                 component: AppWrapperRoute(App, { applicationId: id }),
                 meta: { authContext: 'hybrid', title: $gettext('JSON Viewer'), patchCleanPath: true } }],
      translations
    }
  }
})
```
`package.json`: `"type": "module"`, scripts `build: pnpm vite build`, `check:types: vue-tsc --noEmit`,
`test:unit: vitest`; devDeps `@opencloud-eu/web-client ^8`, `@opencloud-eu/web-pkg ^8`, `vue ^3.4`,
`vue3-gettext ^4`. Monorepo root adds `extension-sdk ^8.1.0`, `vite ^8`, `vitest ^5`,
`vue-tsc ^3`, `typescript ^6`, `happy-dom`, `@opencloud-eu/web-test-helpers`; `pnpm@11`.

## Open questions to test

- Do compound extensions (`tar.gz`) match in `appInfo.extensions`, or only the last part (`gz`)?
- Does the signed URL from the `url` prop honour HTTP `Range` requests?
- Can libarchive.js's WASM worker load under Module Federation from the apps directory?

## Migration outline (decisions pending)

1. Strip legacy app/webpack/appinfo/nginx; v8 `package.json`, `vite.config.ts`, lockfile; minimal
   viewer builds and type-checks.
2. Run OpenCloud v8 locally (opencloud-compose), install it, confirm "Open with" for `.zip`.
3. Port the UI onto `AppWrapperRoute` props; fix V1, V5, V6, V14 from [bugs](../known-issues/bugs.md).
4. Add remaining formats with size limits from `apps.yaml`.
5. Large ZIPs via the `url` prop + Range reads, if the open question above checks out.
6. Tests (`web-test-helpers`), translations, docs, README.

Pending decisions: scope (viewer vs. also extract), engine (libarchive.js, zip.js, or both),
size limits, repo layout.

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
