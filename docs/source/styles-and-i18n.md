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

## Translations — `l10n/`

German, Spanish and French cover **all 41 strings** (step 6). They were **drafted by Claude (AI)**
and not yet reviewed by native speakers (noted in each `.po` header and the README). English needs
no table: the msgids are the English text. Formal register (Sie / usted / vous); Spanish uses
"archivo comprimido" for archive ("archivo" alone means file); French puts a space before `%`.

| File                        | Role                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `gettext.config.cjs`        | vue3-gettext config: `src/**/*.{js,ts,vue}` → `l10n/locale`, de/es/fr, `flat: false`, no locations |
| `l10n/template.pot`         | All msgids, written by `pnpm l10n:extract`                                                         |
| `l10n/locale/<lang>/app.po` | Translations per language (edit these)                                                             |
| `l10n/translations.json`    | Compiled `{ lang: { msgid: text or [plural forms] } }`, imported by `src/index.ts`                 |

All four are committed, so building needs no gettext tools.

Strings are wrapped with `$gettext` (or `$ngettext` for plurals, e.g. `%{count} result(s)`) — in
`setup()` via `useGettext()` from `vue3-gettext`, and in templates via the globals. Placeholders
use `%{name}` with string values. Same layout as OpenCloud's `web-extensions` (which also sync
with Transifex; this repo doesn't).

## Translation workflow

1. Prerequisite for extraction: GNU gettext (`sudo apt install gettext`) — `vue-gettext-extract`
   calls `msginit` / `msgmerge` / `msgattrib`.
2. `pnpm l10n:extract` → updates `template.pot` and merges new strings into each `app.po`.
3. Translate the new entries in `l10n/locale/<lang>/app.po`.
4. `pnpm l10n:compile` → `l10n/translations.json`; then build.

`tests/unit/translations.spec.ts` fails when a `$gettext`/`$ngettext` string in `src/` is missing
from `template.pot`, or when a language lacks a string or changes its `%{…}` placeholders.

## When changing UI text

Wrap new strings in `$gettext`, run the translation workflow above (all three languages), and
update this file. Use prefixed Tailwind classes only.
