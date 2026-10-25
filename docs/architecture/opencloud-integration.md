# OpenCloud Integration

How the extension plugs into OpenCloud Web v8 after rework step 1. Comparison with the full v8 API
and what is still missing: [opencloud-v8-compatibility](opencloud-v8-compatibility.md).

## Loading path

1. OpenCloud reads `dist/manifest.json` from its web apps directory
   ([deploying-to-opencloud](../deployment/deploying-to-opencloud.md)) and loads the
   `entrypoint` (`js/remoteEntry-<hash>.mjs`) via Module Federation.
2. The remote exposes `./src/index.ts`, whose default export is `defineWebApplication(...)`.
   OpenCloud loads the apps **in parallel** with the capabilities (web-runtime `bootstrapApp`),
   and `loadRemote` awaits the module including its top-level `await`. The viewer uses that to
   wait for the server version before `setup()` runs.
3. `setup()` returns `appInfo`, `routes`, `translations` (details in
   [extension-entry](../source/extension-entry.md)). It runs inside `app.runWithContext` and
   inside `buildApplication`'s try/catch. **If `setup()` throws**, OpenCloud calls
   `appsStore.registerAppLoadingFailure` and never registers the app: no file types, no menu
   entry, no route. The OpenCloud version check uses this to hide the viewer on unsupported
   versions (checked against web v8.0.0 source).

## File types

`appInfo.extensions` registers `zip, tar, tar.gz, tar.bz2, tar.xz, tgz, gz, bz2, xz, 7z, rar`, each
`{ extension, routeName: 'archive-viewer' }`. This is what puts "Open with Archive Viewer" on
those files and allows the app to be the default for them. MIME types are not declared; OpenCloud
matches by extension as computed by web-client `extractExtensionFromFile`, which treats
`tar.gz`, `tar.bz2`, `tar.xz` as single extensions — hence they're listed separately. Verified on
8.0.1 for zip, tar and tar.gz.

## Route and wrapper

Route `archive-viewer`, `path '/:driveAliasAndItem(.*)?'`, component
`AppWrapperRoute(App, { applicationId: 'archive-viewer' })`, `meta.authContext 'hybrid'`
(works for logged-in users and public links), `patchCleanPath: true`.

`AppWrapperRoute` resolves the space and resource from the route, checks permissions, shows the
loading/error UI, and renders `App` with props. `App` declares `resource`, `applicationConfig` and
**`url`** (not `currentContent`). With the default `urlForResourceOptions` (`null`), web-client
`getFileUrl` uses `disposition: 'attachment'` and returns the resource's **pre-signed
`downloadURL`** without downloading anything (only vault files become in-memory blob URLs). The
viewer checks the size limit first, then fetches that URL itself with progress — see
[viewer-ui](../source/viewer-ui.md).

## Configuration

`applicationConfig` = manifest `config` (defaults from `src/manifest.json`) merged with
`apps.yaml` (`archive-viewer: config: …`) or an app `config.json`. Read options:
`maxArchiveSize`, `maxUncompressedSize`, `maxEntrySize` and their `…Mobile` variants (defaults
and meaning: [zip-range-reading](../source/zip-range-reading.md)), and
`allowUnsupportedOpenCloud` (default `false`), the admin override for the version check
([extension-entry](../source/extension-entry.md)). The override is the one option read in
`setup()` (from its `applicationConfig` argument); the others are read in `App`.

## Shared modules

`vue`, `vue3-gettext`, `@opencloud-eu/web-pkg`, `@opencloud-eu/web-client` (and others, see
[build-tooling](../tech-stack/build-tooling.md)) are taken from the host at runtime, not bundled.

## Removed in step 1

The old integration (extensions with a `handler` in the registry key, route query `fileId`,
`resourcesStore.getResource`, direct `webdav.getFileContents(resource)`, `Archive.init` worker URL,
hand-written `manifest.json`, `appinfo/info.json`) is gone. The old viewer's useful UI was ported
in step 3 and the old code deleted (recoverable from git history, commit `619d40a`).

## When changing integration

Update this file, [extension-entry](../source/extension-entry.md) and
[opencloud-v8-compatibility](opencloud-v8-compatibility.md).
