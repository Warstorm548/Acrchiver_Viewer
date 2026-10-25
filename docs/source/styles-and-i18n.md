# Styles and Translations

## Styles

- `src/App.vue` uses **Tailwind utility classes** (`flex`, `p-4`, `text-lg`, …); the SDK build runs
  `@tailwindcss/vite`, as in OpenCloud's own extensions. No custom CSS yet.
- OpenCloud design-system components (`oc-icon`, and later `oc-button`, `oc-modal`, `oc-checkbox`,
  `oc-text-input`, `oc-spinner`) are registered globally by the host; they are not imported.
- Theme colours in v8 are `--oc-role-*` CSS variables (e.g. `--oc-role-chrome`). The old viewer's
  `--oc-color-swatch-*` variables don't exist in v8 — replace them when porting.
- The legacy `src/styles/main.css` was deleted in step 1.
- Parked components keep their old scoped styles: `reference/old-views/ArchiveViewer.vue`
  (lines 1005–1232) and `ArchiveViewerLarge.vue` (1021–1305).

## Translations — `l10n/translations.json`

Moved from `src/translations.json` in step 1 (OpenCloud keeps translations in `l10n/`). Shape
`{ "<lang>": { "<English msgid>": "<translation>" } }`, imported by `src/index.ts` and returned as
`translations`. Languages `en`, `de`, `es`, `fr`, 23 keys each — all written for the **old** viewer
UI (e.g. 'Download Selected', 'Extract All'). They are kept for the step 3 port.

Not yet in the file: the strings used by the current code — 'Archive Viewer' (it is there) and
'Archive contents will appear here.' (missing → shown in English).

Strings are wrapped with `$gettext` — in `setup()` via `useGettext()` from `vue3-gettext`, and in
templates via the global `$gettext`.

## Translation tooling (not set up yet)

OpenCloud's `web-extensions` extracts strings with `vue3-gettext` using `gettext.config.cjs`
(input `./src` `**/*.{js,ts,vue}`, output `./l10n/locale`, `potPath ../template.pot`,
`jsonPath ../translations.json`) and syncs with Transifex (`l10n/.tx`). Consider adding the
extraction config when the real UI lands.

## When changing UI text

Wrap new strings in `$gettext`, add them to every language in `l10n/translations.json` (or set up
extraction), and update this file.
