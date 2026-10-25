# Styles and Translations

## Styles

- **Tailwind** comes from the SDK: `src/index.ts` imports `@opencloud-eu/extension-sdk/tailwind.css`
  and the build (`@tailwindcss/vite`) emits only the utilities we use into
  `dist/assets/*.css`. The SDK configures Tailwind with **`prefix(ext)`**, so every utility is
  written `ext:<class>` (`ext:flex`, `ext:p-2`, `ext:hover:underline`, `ext:max-h-[60vh]`).
  Unprefixed utilities are **not generated**. Spacing unit is 4px.
- OpenCloud theme colours are Tailwind role colours (`ext:bg-role-surface-container`,
  `…-high`, `…-low`, `role-chrome`, …), backed by `--oc-role-*` CSS variables; light/dark themes
  follow automatically. The old `--oc-color-swatch-*` variables don't exist in v8.
- Own hook classes use the `archive-` prefix (`archive-row`, `archive-name`, …); they carry no
  styles and are used by tests and for readability.
- OpenCloud design-system components are registered globally by the host and not imported:
  `oc-icon`, `oc-button`, `oc-checkbox`, `oc-text-input`, `oc-spinner`, `oc-modal`. Props used
  were checked against design-system **8.0.0** (the server's line); e.g. `oc-modal` has no custom
  cancel-button text there, so the preview hides its actions and renders its own buttons.
  `oc-checkbox` and `oc-text-input` require a `label` (checkboxes use `label-hidden`).
- Icons are Remix icon names (`folder`, `file`, `file-text`, `image`, `eye`, `download`, `lock`,
  `arrow-up-s`, `arrow-down-s`, `arrow-right-s`, `file-zip`).

## Translations — `l10n/translations.json`

Shape `{ "<lang>": { "<English msgid>": "<translation>" } }`, imported by `src/index.ts` and
returned as `translations`. After step 3 it keeps only the de/es/fr/en entries still used by the
new UI ('Actions', 'Archive Viewer', 'Close', 'Download', 'Modified', 'Name', 'Size'). The other
~28 new strings have no translations yet and show in English.

Strings are wrapped with `$gettext` — in `setup()` via `useGettext()` from `vue3-gettext`, and in
templates via the global `$gettext`. Placeholders use `%{name}` with string values.

## Translation tooling (step 6)

OpenCloud's `web-extensions` extracts strings with `vue3-gettext` using `gettext.config.cjs`
(input `./src` `**/*.{js,ts,vue}`, output `./l10n/locale`, `potPath ../template.pot`,
`jsonPath ../translations.json`) and syncs with Transifex (`l10n/.tx`). Plan: add the extraction
config and fill translations in step 6.

## When changing UI text

Wrap new strings in `$gettext`, add translations to `l10n/translations.json` when available, and
update this file. Use prefixed Tailwind classes only.
