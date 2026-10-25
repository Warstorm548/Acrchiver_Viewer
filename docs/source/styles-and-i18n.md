# Styles and Translations

## Vue app styles

Each view has its own `<style scoped>` block:
- `src/views/ArchiveViewer.vue` lines 1005–1232.
- `src/views/ArchiveViewerLarge.vue` lines 1021–1305 (unused component).

They use OpenCloud design-system CSS variables (e.g. `--oc-color-swatch-warning-default`,
`--oc-color-swatch-warning-contrast`) and `oc-*` components (`oc-icon`, `oc-button`,
`oc-checkbox`, `oc-text-input`, `oc-spinner`, `oc-modal`) that the OpenCloud host provides
globally — they are not imported in the component.

## Legacy styles — `src/styles/main.css` (608 lines)

Imported by `src/index.js` (bundled by webpack via `style-loader`). Applies only to the legacy
`UIManager` markup; it also styles `body` globally, which would leak into a host page.

- `:root` variables: `--primary-color #0082c9`, `--secondary-color`, `--background-color`,
  `--surface-color`, `--text-color`, `--text-secondary`, `--border-color`, `--hover-color`,
  `--selected-color`, `--success-color`, `--error-color`, `--warning-color`.
- Sections: layout (`.archive-viewer`, `.toolbar`), buttons (`.btn*`), search/sort, breadcrumb,
  status bar, file table (`.file-table`, `.file-row`, `.col-*`), viewer/editor (`.file-viewer`,
  `.code-viewer`, `.file-editor`), info panel, loading overlay + spinner keyframes, modal,
  forms, share link, notifications (`.notification-*`).
- Media queries: `max-width: 1024px`, `max-width: 768px`, `prefers-color-scheme: dark`, `print`.

## Translations — `src/translations.json`

Shape: `{ "<lang>": { "<English msgid>": "<translation>" } }`, passed as `translations` from
`src/index.ts`. Languages: `en`, `de`, `es`, `fr` — 23 keys each.

Coverage against `$gettext('...')` calls (checked with a script):
- `ArchiveViewer.vue`: all 15 keys used are present.
- `ArchiveViewerLarge.vue`: 15 of its 30 keys are missing (e.g. 'Retry', 'Clear Cache',
  'Extracting', 'Large File').
- 8 keys in the file are not used by `ArchiveViewer.vue` via `$gettext` (e.g. 'Loading archive...',
  'Resource not found'); the script sets those strings as plain English instead of translating.

Whether OpenCloud expects this flat `{lang: {msgid: str}}` shape or gettext JSON produced by
its tooling is **unverified**.

## Legacy app i18n

None — all strings are hard-coded English.

## When changing UI text

Add new msgids to every language in `translations.json` and wrap them in `$gettext`; update the
coverage notes above.
