# OpenCloud Integration

How the extension plugs into OpenCloud Web v8 after rework step 1. Comparison with the full v8 API
and what is still missing: [opencloud-v8-compatibility](opencloud-v8-compatibility.md).

## Loading path

1. OpenCloud reads `dist/manifest.json` from its web apps directory
   ([deploying-to-opencloud](../deployment/deploying-to-opencloud.md)) and loads the
   `entrypoint` (`js/remoteEntry-<hash>.mjs`) via Module Federation.
2. The remote exposes `./src/index.ts`, whose default export is `defineWebApplication(...)`.
3. `setup()` returns `appInfo`, `routes`, `translations` (details in
   [extension-entry](../source/extension-entry.md)).

## File types

`appInfo.extensions` registers `zip, tar, gz, tgz, bz2, xz, 7z, rar`, each
`{ extension, routeName: 'archive-viewer' }`. This is what puts "Open with Archive Viewer" on
those files and allows the app to be the default for them. MIME types are not declared; OpenCloud
matches by extension. Compound extensions (`tar.gz`, `tar.bz2`, `tar.xz`) are an open question —
`.tar.gz` files may only match via `gz`.

## Route and wrapper

Route `archive-viewer`, `path '/:driveAliasAndItem(.*)?'`, component
`AppWrapperRoute(App, { applicationId: 'archive-viewer' })`, `meta.authContext 'hybrid'`
(works for logged-in users and public links), `patchCleanPath: true`.

`AppWrapperRoute` resolves the space and resource from the route, checks permissions, shows the
loading/error UI, and renders `App` with props. `App` currently takes only `resource` and
`applicationConfig`; it declares neither `currentContent` nor `url`, so no file content is
fetched yet.

## Configuration

`applicationConfig` comes from `apps.yaml` (`archive-viewer: config: …`) or an app `config.json`.
No options are read yet; a size limit is planned for step 4.

## Shared modules

`vue`, `vue3-gettext`, `@opencloud-eu/web-pkg`, `@opencloud-eu/web-client` (and others, see
[build-tooling](../tech-stack/build-tooling.md)) are taken from the host at runtime, not bundled.

## Removed in step 1

The old integration (extensions with a `handler` in the registry key, route query `fileId`,
`resourcesStore.getResource`, direct `webdav.getFileContents(resource)`, `Archive.init` worker URL,
hand-written `manifest.json`, `appinfo/info.json`) is gone. The old viewer's behaviour is recorded
in [reference-old-viewer](../source/reference-old-viewer.md).

## When changing integration

Update this file, [extension-entry](../source/extension-entry.md) and
[opencloud-v8-compatibility](opencloud-v8-compatibility.md).
