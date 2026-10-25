// OpenCloud's built-in CSP (no csp.yaml) blocks blob: workers; bzip2/xz/lzma must still open on
// the main thread.
import { join } from 'node:path'
import { FIXTURES } from '../env'
import { archiveHashes } from '../helpers/files'
import { expect, test, useBuiltInCsp } from '../test'

// the blocked worker is expected to be reported by the browser
test.use({ allowedConsole: [/worker/i] })

test.beforeEach(async ({ page }) => {
  await useBuiltInCsp(page)
})

for (const name of ['sample.tar.bz2', 'sample.tar.xz', 'sample.tar.lzma', 'data.json.bz2']) {
  test(`${name} opens on the main thread`, async ({ consoleEntries, viewer }) => {
    await viewer.open(name)
    expect((await viewer.names()).length).toBeGreaterThan(0)
    expect(consoleEntries.some(({ text }) => text.includes('worker unavailable'))).toBe(true)
  })
}

test('a selection from large.tar.xz is still byte-identical', async ({ viewer }) => {
  await viewer.open('large.tar.xz')
  await viewer.select('big')
  const download = await viewer.downloadSelected()
  expect(archiveHashes(await download.path())).toEqual(
    archiveHashes(join(FIXTURES, 'large.tar.xz'))
  )
})
