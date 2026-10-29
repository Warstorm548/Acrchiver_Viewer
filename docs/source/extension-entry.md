# Extension Entry — `src/index.ts`, `src/manifest.json`

How the app registers with OpenCloud. The viewer itself is described in
[viewer-ui](viewer-ui.md), the archive reading in [archive-engine](archive-engine.md).

## `src/index.ts`

`export default defineWebApplication({ setup({ applicationConfig }) { … } })` from
`@opencloud-eu/web-pkg`, following `web-app-json-viewer`:

- First line: `import '@opencloud-eu/extension-sdk/tailwind.css'` — the SDK's Tailwind build
  (utilities prefixed `ext:`), same as OpenCloud's own extensions (e.g. `web-app-notes`).
- `applicationId = 'archive-viewer'` (also the `defineConfig({ name })` in `vite.config.ts` and
  the install folder name).
- `supportedExtensions = ['zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz', 'tgz', 'tbz2', 'tbz', 'txz',
'tlz', 'gz', 'bz2', 'xz', 'lzma', '7z', 'rar']`. OpenCloud treats `tar.gz`/`tar.bz2`/`tar.xz` as single extensions,
  so they are listed explicitly (found in step 2). All of them get "Open in Archive Viewer";
  formats the engine can't read (7z, rar) open to a "not supported yet" message
  with a download button.
- **OpenCloud version check** (top of the module and start of `setup`), see the section below.
- `useGettext()` from `vue3-gettext` for `$gettext`.
- `routes`: one route, `name 'archive-viewer'`, `path '/:driveAliasAndItem(.*)?'`,
  `component: AppWrapperRoute(App, { applicationId })`,
  `meta: { authContext: 'hybrid', title: 'Archive Viewer', patchCleanPath: true }`.
- `appInfo`: `name 'Archive Viewer'`, `id`, `icon 'file-zip'`, `defaultExtension 'zip'`,
  `extensions: supportedExtensions.map(extension => ({ extension, routeName: applicationId }))`.
- `translations` from `../l10n/translations.json`.

No `extensions` (registry) key — no menu items or file actions.

## OpenCloud version check — `src/compatibility.ts`

The viewer runs only on the exact OpenCloud versions in `SUPPORTED_OPENCLOUD_VERSIONS`
(currently `['8.0.1']`). That's deliberate, so an untested OpenCloud upgrade can't leave a
half-working viewer.

- Top level of `src/index.ts`: `await waitForProductVersion(useCapabilityStore())`. OpenCloud
  loads capabilities in parallel with the apps, so this waits for `isInitialized` (10 s timeout,
  then the version counts as unknown). OpenCloud awaits the module, top-level `await` included,
  before it calls `setup()`.
- Only `status.productversion` is used, with build info stripped (`8.0.1+abc` → `8.0.1`), as
  OpenCloud itself does. `status.version` / `versionstring` are a legacy ownCloud number (10.x).
- `setup()` calls `checkCompatibility({ productVersion, config: applicationConfig })`:
  - supported → registers as usual;
  - unsupported or unknown → **throws** with a message like "Archive Viewer 0.2.0 supports
    OpenCloud 8.0.1; this server runs 8.1.0. Set allowUnsupportedOpenCloud: true in apps.yaml to
    run it anyway." OpenCloud then records an app loading failure and never registers the app,
    so there's no "Open in Archive Viewer", no file types and no route (see
    [opencloud-integration](../architecture/opencloud-integration.md));
  - unsupported but `allowUnsupportedOpenCloud: true` (or `'true'`) in `apps.yaml` → registers
    and logs the message with `console.warn`.

To support a new OpenCloud version: test it, add it to `SUPPORTED_OPENCLOUD_VERSIONS`, bump the
version and note it in `ArchiveViewerChangelog.md`. Tests: `tests/unit/compatibility.spec.ts`,
`tests/unit/index.spec.ts`.

## `src/manifest.json`

```json
{
  "config": {
    "maxArchiveSize": 1073741824,
    "maxUncompressedSize": 2147483648,
    "maxEntrySize": 1073741824,
    "maxArchiveSizeMobile": 134217728,
    "maxUncompressedSizeMobile": 402653184,
    "maxEntrySizeMobile": 268435456,
    "allowUnsupportedOpenCloud": false,
    "allowUnsupportedHelper": false,
    "archiveHelperUrl": "/archive-api"
  }
}
```

The SDK merges it into `dist/manifest.json` (with name, version, license, author and
`entrypoint`). OpenCloud merges the `config` block with `apps.yaml`, and the result reaches the
viewer as `applicationConfig`. The same limit defaults are hard-coded in `src/limits.ts` as a
fallback; a missing `allowUnsupportedOpenCloud` or `allowUnsupportedHelper` means `false` (the
latter lets the viewer use a server helper outside its supported version range,
`src/helper/gate.ts`); a missing `archiveHelperUrl`
means `/archive-api` (`src/helper/client.ts` `resolveHelperUrl`; `""` turns the server helper
off, other origins are refused).

## When changing

Keep this doc, [opencloud-integration](../architecture/opencloud-integration.md) and
[opencloud-v8-compatibility](../architecture/opencloud-v8-compatibility.md) in sync.
