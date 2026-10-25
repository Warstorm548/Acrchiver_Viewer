// The viewer runs only on the OpenCloud versions it supports (src/compatibility.ts); the version is
// faked through the capabilities response.
import { Page } from '@playwright/test'
import { expect, patchAppConfig, patchProductVersion, test } from '../test'

const openWithEntries = async (page: Page) => {
  await page.goto('/files/spaces/personal/admin?view-mode=resource-table&items-per-page=500')
  const file = page.locator('tr', { has: page.locator('[data-test-resource-name="sample.zip"]') })
  await file.click({ button: 'right' })
  const openWith = page.getByText('Open with...', { exact: true }).first()
  if (await openWith.isVisible()) {
    await openWith.hover()
  }
  await page.waitForTimeout(500)
  return page.getByText('Archive Viewer', { exact: true })
}

test.describe('unsupported version (8.1.0)', () => {
  // OpenCloud logs the app's refusal as a failed app load
  test.use({
    allowedConsole: [/Archive Viewer .* supports OpenCloud 8\.0\.1; this server runs 8\.1\.0/]
  })

  test('hides the viewer', async ({ consoleEntries, page }) => {
    await patchProductVersion(page, '8.1.0')
    expect(await (await openWithEntries(page)).count()).toBe(0)
    expect(consoleEntries.some(({ text }) => text.includes('this server runs 8.1.0'))).toBe(true)
  })

  test('allowUnsupportedOpenCloud brings it back with a warning', async ({
    consoleEntries,
    page,
    viewer
  }) => {
    await patchProductVersion(page, '8.1.0')
    await patchAppConfig(page, { allowUnsupportedOpenCloud: true })
    await viewer.open('sample.zip')
    await expect(viewer.row('docs')).toBeVisible()
    expect(
      consoleEntries.some(({ type, text }) => type === 'warning' && text.includes('Running anyway'))
    ).toBe(true)
  })
})

test('the supported version shows the viewer without warnings', async ({
  consoleEntries,
  page
}) => {
  expect(await (await openWithEntries(page)).count()).toBeGreaterThan(0)
  expect(consoleEntries.filter(({ text }) => text.includes('Archive Viewer'))).toEqual([])
})
