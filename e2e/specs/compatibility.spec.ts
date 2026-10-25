import { readFileSync } from 'node:fs'
import { DIST_MANIFEST } from '../env'
import { getJson } from '../helpers/server'
import { expect, test } from '../test'

test('OpenCloud serves this build with its default config', async () => {
  const manifest = JSON.parse(readFileSync(DIST_MANIFEST, 'utf8'))
  const config = await getJson<{
    external_apps: { id: string; version: string; config: unknown }[]
  }>('/config.json')
  const app = config.external_apps.find(({ id }) => id === 'archive-viewer')
  expect(app?.version).toBe(manifest.version)
  // apps.yaml has `config: {}` on the dev stack, so the manifest defaults apply unchanged
  expect(app?.config).toEqual(manifest.config)
})

test('"Open with" offers the Archive Viewer on 8.0.1 and opens it', async ({ page, viewer }) => {
  await page.goto('/files/spaces/personal/admin?view-mode=resource-table&items-per-page=500')
  const file = page.locator('tr', { has: page.locator('[data-test-resource-name="sample.zip"]') })
  await file.click({ button: 'right' })
  await page.getByText('Open with...', { exact: true }).first().hover()
  await page.getByText('Archive Viewer', { exact: true }).last().click()
  await expect(page).toHaveURL(/\/archive-viewer\/personal\/admin\/sample\.zip/)
  await expect(viewer.row('docs')).toBeVisible()
})
