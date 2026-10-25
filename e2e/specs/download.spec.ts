import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIXTURES } from '../env'
import { archiveHashes, sha256 } from '../helpers/files'
import { expect, test } from '../test'

const fixture = (name: string) => join(FIXTURES, name)

/** The files of an archive below `prefixes` (all files without prefixes). */
const subset = (hashes: Record<string, string>, ...prefixes: string[]) =>
  Object.fromEntries(
    Object.entries(hashes).filter(
      ([path]) => !prefixes.length || prefixes.some((p) => path.startsWith(p))
    )
  )

test('downloads a single file byte for byte', async ({ viewer }) => {
  await viewer.open('sample.tar.xz')
  const download = await viewer.downloadFile('README.txt')
  expect(download.suggestedFilename()).toBe('README.txt')
  expect(readFileSync(await download.path(), 'utf8')).toBe('Archive Viewer test archive.\n')
})

test('downloads the file from a single-file archive', async ({ viewer }) => {
  await viewer.open('notes.txt.gz')
  const download = await viewer.downloadFile('notes.txt')
  expect(readFileSync(await download.path(), 'utf8')).toBe(
    'Plain text inside a .gz file.\nSecond line.\n'
  )
})

test('selected folders from a zip become one zip', async ({ viewer }) => {
  await viewer.open('sample.zip')
  await viewer.select('docs', 'images')
  const download = await viewer.downloadSelected()
  expect(download.suggestedFilename()).toBe('sample-selection.zip')
  expect(archiveHashes(await download.path())).toEqual(
    subset(archiveHashes(fixture('sample.zip')), 'docs/', 'images/')
  )
})

test('"select all" in a tar.bz2 packs every file (names, Unicode and long paths intact)', async ({
  page,
  viewer
}) => {
  await viewer.open('sample.tar.bz2')
  await page.locator('.archive-table thead input[type="checkbox"]').check()
  const download = await viewer.downloadSelected()
  expect(download.suggestedFilename()).toBe('sample-selection.zip')
  expect(archiveHashes(await download.path())).toEqual(archiveHashes(fixture('sample.tar.bz2')))
})

for (const name of ['large.tar.xz', 'large.tar.bz2', 'large.zip']) {
  test(`${name}: the big/ folder downloads as large-selection.zip`, async ({ viewer }) => {
    await viewer.open(name)
    await viewer.select('big')
    const download = await viewer.downloadSelected()
    expect(download.suggestedFilename()).toBe('large-selection.zip')
    expect(archiveHashes(await download.path())).toEqual(archiveHashes(fixture(name)))
  })
}

test('a 1.5 MB file from large.tar.xz matches the original', async ({ viewer }) => {
  await viewer.open('large.tar.xz')
  await viewer.openFolder('big')
  const download = await viewer.downloadFile('random-2.bin')
  expect(await sha256(await download.path())).toBe(
    archiveHashes(fixture('large.tar.xz'))['big/random-2.bin']
  )
})
