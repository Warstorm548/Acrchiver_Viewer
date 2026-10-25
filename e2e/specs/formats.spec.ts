import { expect, test } from '../test'

/** Every sample archive has the same tree (make-fixtures.sh). */
const SAMPLES = [
  'sample.zip',
  'sample.tar',
  'sample.tar.gz',
  'sample.tgz',
  'sample.tar.bz2',
  'sample.tbz2',
  'sample.tar.xz',
  'sample.txz',
  'sample.tar.lzma',
  'archive-in-disguise.gz'
]

for (const name of SAMPLES) {
  test(`${name} opens as a folder tree`, async ({ viewer }) => {
    await viewer.open(name)
    expect(await viewer.names()).toContain('docs')
    expect(await viewer.names()).toContain('README.txt')
    await viewer.openFolder('folder with spaces')
    expect(await viewer.names()).toEqual(['Ünïcödé file.txt'])
  })
}

const SINGLE_FILES: [string, string][] = [
  ['notes.txt.gz', 'notes.txt'],
  ['notes.txt.xz', 'notes.txt'],
  ['data.json.bz2', 'data.json'],
  ['data.json.lzma', 'data.json'],
  ['filters-x86.bin.xz', 'filters-x86.bin']
]

for (const [archive, entry] of SINGLE_FILES) {
  test(`${archive} opens as the single file ${entry}`, async ({ viewer }) => {
    await viewer.open(archive)
    expect(await viewer.names()).toEqual([entry])
  })
}

for (const name of ['large.tar.bz2', 'large.tar.xz']) {
  test(`${name} shows progress and opens`, async ({ page, viewer }) => {
    await page.goto(`/archive-viewer/personal/admin/${name}`)
    await expect(page.locator('.archive-viewer-progress')).toBeVisible()
    await expect(viewer.row('big')).toBeVisible({ timeout: 60_000 })
  })
}

test('large.zip is read by range requests, not downloaded whole', async ({ page, viewer }) => {
  const statuses: number[] = []
  page.on('response', (response) => {
    const url = decodeURIComponent(response.url())
    if (
      url.includes('/dav/') &&
      url.includes('large.zip') &&
      response.request().method() === 'GET'
    ) {
      statuses.push(response.status())
    }
  })
  await viewer.open('large.zip')
  await expect(viewer.row('big')).toBeVisible()
  expect(statuses.length).toBeGreaterThan(0)
  expect(statuses.every((status) => status === 206)).toBe(true)
})

test('the worker decompresses bzip2/xz (no main-thread fallback)', async ({
  consoleEntries,
  viewer
}) => {
  await viewer.open('sample.tar.xz')
  await viewer.open('sample.tar.bz2')
  expect(consoleEntries.filter(({ text }) => text.includes('worker unavailable'))).toEqual([])
})
