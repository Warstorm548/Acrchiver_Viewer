# Extension Entry — `src/index.ts`, `src/manifest.json`

How the app registers with OpenCloud. The viewer itself is described in
[viewer-ui](viewer-ui.md), the archive reading in [archive-engine](archive-engine.md).

## `src/index.ts`

`export default defineWebApplication({ setup() { … } })` from `@opencloud-eu/web-pkg`, following
`web-app-json-viewer`:

- First line: `import '@opencloud-eu/extension-sdk/tailwind.css'` — the SDK's Tailwind build
  (utilities prefixed `ext:`), same as OpenCloud's own extensions (e.g. `web-app-notes`).
- `applicationId = 'archive-viewer'` (also the `defineConfig({ name })` in `vite.config.ts` and
  the install folder name).
- `supportedExtensions = ['zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz', 'tgz', 'gz', 'bz2', 'xz',
'7z', 'rar']`. OpenCloud treats `tar.gz`/`tar.bz2`/`tar.xz` as single extensions, so they are
  listed explicitly (found in step 2). All of them get "Open in Archive Viewer"; formats the
  engine can't read yet (bz2, xz, plain gz, 7z, rar) open to a "not supported yet" message with a
  download button.
- `useGettext()` from `vue3-gettext` for `$gettext`.
- `routes`: one route, `name 'archive-viewer'`, `path '/:driveAliasAndItem(.*)?'`,
  `component: AppWrapperRoute(App, { applicationId })`,
  `meta: { authContext: 'hybrid', title: 'Archive Viewer', patchCleanPath: true }`.
- `appInfo`: `name 'Archive Viewer'`, `id`, `icon 'file-zip'`, `defaultExtension 'zip'`,
  `extensions: supportedExtensions.map(extension => ({ extension, routeName: applicationId }))`.
- `translations` from `../l10n/translations.json`.

No `extensions` (registry) key — no menu items or file actions.

## `src/manifest.json`

```json
{ "config": { "maxArchiveSize": 268435456, "maxUncompressedSize": 1073741824 } }
```

The SDK merges it into `dist/manifest.json` (with name, version, license, author and
`entrypoint`). OpenCloud merges the `config` block with `apps.yaml`, and the result reaches the
viewer as `applicationConfig`. The same defaults are hard-coded in `App.vue` as a fallback.

## When changing

Keep this doc, [opencloud-integration](../architecture/opencloud-integration.md) and
[opencloud-v8-compatibility](../architecture/opencloud-v8-compatibility.md) in sync.
