import { readFileSync } from 'node:fs'
import { setLanguage } from '../helpers/server'
import { expect, test } from '../test'

const translations: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(new URL('../../l10n/translations.json', import.meta.url), 'utf8')
)

test.afterAll(async () => {
  await setLanguage('en')
})

for (const language of ['de', 'es', 'fr'] as const) {
  test(`the viewer is translated to ${language}`, async ({ page, viewer }) => {
    const t = translations[language]
    await setLanguage(language)
    await viewer.open('sample.zip')
    await expect(page.locator('.archive-download-selected')).toHaveText(t['Download selected'])
    await expect(page.locator('.archive-sort[data-field="name"]')).toHaveText(t['Name'])
    await viewer.row('binary.bin').click()
    await expect(page.locator('.archive-preview-message')).toHaveText(
      t['No preview available for this file type.']
    )
  })
}

test('English again after resetting the language', async ({ page, viewer }) => {
  await setLanguage('en')
  await viewer.open('sample.zip')
  await expect(page.locator('.archive-download-selected')).toHaveText('Download selected')
})
