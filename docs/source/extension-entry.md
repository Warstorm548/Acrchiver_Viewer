# Extension Entry and Viewer — `src/index.ts`, `src/App.vue`

The current app code after rework step 1: a minimal OpenCloud v8 viewer that registers for archive
file types and shows a placeholder. The archive engine and real UI arrive in step 3 (port notes:
[reference-old-viewer](reference-old-viewer.md)).

## `src/index.ts`

`export default defineWebApplication({ setup() { … } })` from `@opencloud-eu/web-pkg`, following
`web-app-json-viewer`:

- `applicationId = 'archive-viewer'` (also the `defineConfig({ name })` in `vite.config.ts`).
- `supportedExtensions = ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar']`. Compound
  extensions (`tar.gz`, …) are not listed; whether OpenCloud matches them is an open question.
- `useGettext()` from `vue3-gettext` for `$gettext`.
- `routes`: one route, `name 'archive-viewer'`, `path '/:driveAliasAndItem(.*)?'`,
  `component: AppWrapperRoute(App, { applicationId })`,
  `meta: { authContext: 'hybrid', title: 'Archive Viewer', patchCleanPath: true }`.
- `appInfo`: `name 'Archive Viewer'`, `id`, `icon 'file-zip'`, `defaultExtension 'zip'`,
  `extensions: supportedExtensions.map(extension => ({ extension, routeName: applicationId }))`.
- `translations` from `../l10n/translations.json`.

No `extensions` (registry) key yet — no menu items or file actions.

## `src/App.vue`

Options-API component `name: 'ArchiveViewer'`, rendered by `AppWrapperRoute`.

| Prop                | Type                                        | Source                        |
| ------------------- | ------------------------------------------- | ----------------------------- |
| `resource`          | `Resource` (`@opencloud-eu/web-client`)     | the opened file               |
| `applicationConfig` | `AppConfigObject` (`@opencloud-eu/web-pkg`) | `apps.yaml` / manifest config |

It deliberately declares **neither `currentContent` nor `url`**, so the wrapper downloads nothing.
Step 3 adds one of them (see the `AppWrapperRoute` section of
[opencloud-v8-compatibility](../architecture/opencloud-v8-compatibility.md)).

Template: `oc-icon file-zip`, `.archive-viewer-name` (resource name), `.archive-viewer-size`
(`formatFileSize(resource.size, currentLanguage)` from web-pkg), `.archive-viewer-placeholder`
("Archive contents will appear here."). Uses Tailwind utility classes provided by the SDK build.

## Tests

`tests/unit/App.spec.ts` — see [tests](../testing/tests.md).

## When changing

Keep this doc, [opencloud-integration](../architecture/opencloud-integration.md) and the "still
open" rows of [opencloud-v8-compatibility](../architecture/opencloud-v8-compatibility.md) in sync.
