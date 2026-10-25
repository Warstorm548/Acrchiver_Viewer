import { expect, test } from '../test'

const TOP_LEVEL = [
  'docs',
  'empty-folder',
  'folder with spaces',
  'images',
  'very',
  'binary.bin',
  'README.txt',
  'x" onmouseover="alert(1)".txt'
]

test.beforeEach(async ({ viewer }) => {
  await viewer.open('sample.zip')
})

test('lists folders first, then files', async ({ viewer }) => {
  expect(await viewer.names()).toEqual(TOP_LEVEL)
})

test('navigates folders with the breadcrumb', async ({ page, viewer }) => {
  await viewer.openFolder('docs')
  expect(await viewer.names()).toEqual(['deep', 'notes.md'])
  await viewer.openFolder('deep')
  expect(await viewer.names()).toEqual(['deeper', 'data.json'])
  await page.locator('.archive-crumb').first().click()
  expect(await viewer.names()).toEqual(TOP_LEVEL)
})

test('shows a message for an empty folder', async ({ page, viewer }) => {
  await viewer.openFolder('empty-folder')
  await expect(page.locator('.archive-empty')).toHaveText('This folder is empty')
})

test('searches the whole archive and shows each hit’s folder', async ({ page, viewer }) => {
  await page.locator('.archive-search input').fill('config')
  await expect(page.locator('.archive-search-summary')).toHaveText('1 result')
  await expect(viewer.row('config.yaml').locator('.archive-row-folder')).toHaveText(
    'docs/deep/deeper'
  )
  await page.locator('.archive-search input').fill('no-such-file')
  await expect(page.locator('.archive-empty')).toHaveText('No matching files')
})

test('sorts by name and size', async ({ page, viewer }) => {
  await page.locator('.archive-sort[data-field="name"]').click()
  const descending = await viewer.names()
  expect(descending.slice(0, 5)).toEqual([
    'very',
    'images',
    'folder with spaces',
    'empty-folder',
    'docs'
  ])
  await page.locator('.archive-sort[data-field="size"]').click()
  const bySize = await viewer.names()
  // folders stay first; binary.bin (1 KiB) is the largest file
  expect(bySize.slice(5)[0]).toBe('README.txt')
  await page.locator('.archive-sort[data-field="size"]').click()
  expect((await viewer.names()).slice(5)[0]).toBe('binary.bin')
})

test('a reload (F5) renders the viewer again', async ({ page, viewer }) => {
  await page.reload()
  await expect(viewer.row('docs')).toBeVisible()
})

test('a hostile file name is shown as plain text', async ({ page, viewer }) => {
  const name = 'x" onmouseover="alert(1)".txt'
  const dialogs: string[] = []
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message())
    await dialog.dismiss()
  })
  await viewer.row(name).locator('.archive-name').hover()
  await expect(viewer.row(name).locator('.archive-name')).toHaveText(name)
  expect(await page.locator('[onmouseover]').count()).toBe(0)
  expect(dialogs).toEqual([])
})
