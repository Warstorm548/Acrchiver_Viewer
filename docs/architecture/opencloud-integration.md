# OpenCloud Integration

How the Vue app plugs into OpenCloud Web, plus the metadata files. This describes what the code
*does*; for how that compares with the real OpenCloud v8 API (it doesn't match) see
[opencloud-v8-compatibility](opencloud-v8-compatibility.md).

## `src/index.ts`

1. Calls `Archive.init({ workerUrl: '/archive-viewer/libarchive.worker-bundle.js' })` at module load
   (`src/index.ts:13`). Nothing in the build copies that worker (or its WASM) to that URL, and the
   absolute path assumes the app is served at `/archive-viewer/`.
2. `defineWebApplication({ setup({ applicationConfig }) { ... } })` returns:
   - `appInfo`: `name 'Archive Viewer'`, `id 'archive-viewer'`, `icon 'file-zip'`, `color '#FFA500'`,
     `defaultExtension 'zip'`, `extensions ['zip','tar','gz','tgz','bz2','7z','rar','xz']`.
   - `extensions`: 8 `ApplicationFileExtension` objects built by spreading one template and
     overriding `extension`/`name`. **Every entry carries the full MIME list**, not just its own type.
     `canBeDefault: true`.
   - `routes`: one route `name 'archive-viewer'`, `path '/:driveAliasAndItem*'`, component
     `ArchiveViewer`, `meta.title 'Archive Viewer'`.
   - `translations` from `src/translations.json`.
3. Imports `useClientService`, `useResourcesStore`, `useLoadingService` but never uses them.

### Extension handler

```ts
handler: async ({ space, resource }) => ({
  app: appId,
  route: { name: 'archive-viewer',
           params: { driveAliasAndItem: space.driveAlias, fileId: resource.fileId },
           query:  { fileId: resource.fileId } }
})
```
- `driveAliasAndItem` is set to only the drive alias, not alias + item path.
- `fileId` is passed as a route param, but the route path has no `:fileId` segment.
- The component reads only `route.query.fileId`.
- Whether `handler`/`ApplicationFileExtension` match the real web-pkg API is **unverified** — the
  shapes come from the hand-written `src/types.d.ts`, not from the package.

## How the component gets the file

`ArchiveViewer.vue:401` `loadArchive`:
1. `fileId = route.query.fileId` — error if missing.
2. `resource = resourcesStore.getResource(fileId)` — this only finds resources already loaded in
   the store (e.g. the current folder listing). Opening the viewer via a direct link or after a
   page reload would likely give "Resource not found" (**plausible, unverified**).
3. `clientService.webdav.getFileContents(resource)` then `.arrayBuffer()` or `.body.getReader()`.
   Assumes a fetch `Response`; see [dependencies](../tech-stack/dependencies.md) type-stub notes.

## MIME types

Same list appears in `src/index.ts`, `manifest.json` and (minus `application/x-gtar`)
`appinfo/info.json`:
`application/zip`, `application/x-zip-compressed`, `application/x-tar`, `application/x-gtar`,
`application/x-gzip`, `application/gzip`, `application/x-bzip2`, `application/x-7z-compressed`,
`application/x-rar-compressed`, `application/vnd.rar`, `application/x-xz`.

## `manifest.json`

`name`, `id 'archive-viewer'`, `version 1.0.0`, `category 'Productivity'`, `icon 'file-zip'`,
`license 'Apache-2.0'`, `repository` → `opencloud-eu/web-app-archive-viewer`,
`entrypoint 'index.js'`, `supportedFormats`, `mimeTypes`, `features` (lists "encrypted archives"
and "batch operations", neither implemented), `permissions ['files.read','files.download']`,
`minVersion 1.0.0`, `screenshots []`. Whether OpenCloud reads any of these fields beyond
`entrypoint` is **unverified**.

## `appinfo/info.json`

Nextcloud-style app descriptor: `licence 'MIT'` (British spelling), `namespace 'OpenCloud'`,
`category 'files'`, `types ['filesystem']`, `mimes [...]`, `screenshot 'img/screenshot.png'`
(missing), `bugs`/`repository` → `opencloud-eu/web-extensions`. OpenCloud Web does not use
`appinfo/`; this file serves the legacy approach at most.

## Legacy app context (for completeness)

The legacy app expects a host-provided `context` with `fileId`, `fileName`, `fileUrl`,
`getFileInfo(id)`, `getAuthToken()`, `saveFile(id, data)`, `uploadFile(name, data)`,
`createShare(id)`. No real host provides this object; only the mock in root `index.html` does.

## When changing integration

Update this file, [two-app-split](two-app-split.md), and the MIME/metadata notes in
[project-status](../overview/project-status.md).
