// vue3-gettext extraction/compilation (`pnpm l10n:extract`, `pnpm l10n:compile`), same layout as
// OpenCloud's web-extensions. Extraction needs GNU gettext (msginit/msgmerge/msgattrib).
module.exports = {
  input: {
    path: './src',
    include: ['**/*.js', '**/*.ts', '**/*.vue']
  },
  output: {
    path: './l10n/locale',
    potPath: '../template.pot',
    jsonPath: '../translations.json',
    locales: ['de', 'es', 'fr'],
    locations: false,
    linguas: false,
    flat: false
  }
}
