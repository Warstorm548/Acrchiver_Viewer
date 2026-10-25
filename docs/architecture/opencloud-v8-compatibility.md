# OpenCloud v8 Compatibility

**Verdict: not compatible** with OpenCloud v8.1.0 (latest, released 2026-10-05).
Checked 2026-10-25 against OpenCloud's own extensions in `opencloud-eu/web-extensions`
(`web-app-json-viewer`, `web-app-unzip`, both on `@opencloud-eu/web-pkg ^8.0.0`) and the
`opencloud-eu/web` source (`packages/extension-sdk`, `packages/web-client`).

## Blockers

| # | Area | This repo | v8 reality |
|---|------|-----------|-----------|
| C1 | Build config | `vite.config.ts` imports `defaultConfig` from `@opencloud-eu/extension-sdk` and overrides `plugins`/`build` | SDK 8.1.0 exports only `defineConfig({ name })`, which sets up Module Federation, shared host modules and manifest generation |
| C2 | File-type registration | `appInfo.extensions` is a string list; `ApplicationFileExtension` objects with a `handler` go in top-level `extensions` | File types go in `appInfo.extensions` as `{ extension, routeName }`; top-level `extensions` is the extension registry (`appMenuItem`, actions…) |
| C3 | Route / component wiring | Route `/:driveAliasAndItem*` → bare `ArchiveViewer`; component reads `route.query.fileId` + `resourcesStore.getResource` | Route `/:driveAliasAndItem(.*)?` → `AppWrapperRoute(App, { applicationId })`, `meta: { authContext: 'hybrid', patchCleanPath: true }`; the wrapper passes `resource`, `currentContent`, `applicationConfig`, `isReadOnly` as props |
| C4 | Fetching the file | `clientService.webdav.getFileContents(resource)` then `.arrayBuffer()` / `.body.getReader()` | `getFileContents(space, { fileId, path }, { responseType })` returns `{ response, body, headers }` (axios). Missing 2nd argument → `TypeError` on destructuring |
| C5 | Types | Hand-written stubs in `src/types.d.ts` | Real types ship with `@opencloud-eu/web-pkg` / `web-client`; stubs conflict |

## Mismatches

| # | Area | Note |
|---|------|------|
| C6 | i18n | Official apps use `useGettext()` from `vue3-gettext`; translations live in `l10n/translations.json` |
| C7 | Theme tokens | `--oc-color-swatch-*` vars not found in the current web repo; v8 uses `--oc-role-*` (e.g. `--oc-role-chrome`) |
| C8 | Shared modules | Host provides `vue`, `pinia`, `luxon`, `vue3-gettext`, `@opencloud-eu/web-pkg`, `@opencloud-eu/web-client/*`, `yjs` (`extension-sdk/src/externalModules.ts`); official apps list them as devDependencies |
| C9 | Deployment | v8: copy built app folder into `$OC_DATA_DIR/web/assets/apps` (or `opencloud-compose/config/opencloud/apps`) and restart; config via `$OC_CONFIG_DIR/apps.yaml` or the app's `config.json`. This repo's `install.sh`, nginx container and `appinfo/info.json` don't follow this |
| C10 | License | Official extensions are AGPL-3.0; this repo says MIT/Apache-2.0 (a choice for the owner, not a technical blocker) |

## Still compatible

- `defineWebApplication` from `@opencloud-eu/web-pkg`.
- Design-system components used: `OcButton`, `OcModal`, `OcCheckbox`, `OcTextInput`, `OcSpinner`,
  `OcIcon` all exist in v8.

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

## Related official extension

`web-app-unzip` (v2.2.1, uses `@zip.js/zip.js`) already handles ZIP extraction inside OpenCloud via
registry extensions. Review it before re-implementing ZIP support.

## Sources

- https://github.com/opencloud-eu/opencloud/releases
- https://docs.opencloud.eu/docs/dev/web/extension-system/viewer-editor-apps
- https://docs.opencloud.eu/docs/admin/configuration/web-applications
- https://github.com/opencloud-eu/web-extensions
- https://github.com/opencloud-eu/web (`packages/extension-sdk`, `packages/web-client/src/webdav/getFileContents.ts`)

## When changing

Re-check against the latest OpenCloud release before relying on this table; update the verdict
and the date above. Also update [opencloud-integration](opencloud-integration.md) and
[bugs](../known-issues/bugs.md).
