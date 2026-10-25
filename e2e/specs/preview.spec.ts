import { expect, test } from '../test'

const modal = '.archive-preview-modal'

test.beforeEach(async ({ viewer }) => {
  await viewer.open('sample.tar.xz')
})

test('previews text files', async ({ page, viewer }) => {
  await viewer.row('README.txt').click()
  await expect(page.locator(`${modal} .archive-preview-text`)).toHaveText(
    'Archive Viewer test archive.'
  )
  await page.locator('.archive-preview-close').click()
  await expect(page.locator(modal)).toBeHidden()

  await viewer.openFolder('docs')
  await viewer.openFolder('deep')
  await viewer.row('data.json').click()
  await expect(page.locator(`${modal} .archive-preview-text`)).toHaveText('{"hello": "world"}')
})

for (const image of ['pixel.png', 'logo.svg']) {
  test(`previews ${image}`, async ({ page, viewer }) => {
    await viewer.openFolder('images')
    await viewer.row(image).click()
    const img = page.locator(`${modal} .archive-preview-image`)
    await expect(img).toBeVisible()
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0)
  })
}

test('binary files have no preview but can be downloaded from the modal', async ({
  page,
  viewer
}) => {
  await viewer.row('binary.bin').click()
  await expect(page.locator(`${modal} .archive-preview-message`)).toHaveText(
    'No preview available for this file type.'
  )
  await expect(page.locator('.archive-preview-download')).toBeVisible()
})
