import { join } from 'node:path'
import { FIXTURES, MOBILE_OVER_ARCHIVE, MOBILE_OVER_UNCOMPRESSED } from '../env'
import { sha256 } from '../helpers/files'
import { expect, patchAppConfig, phone, test } from '../test'

// the viewer logs every refusal with console.error (reportError / ArchiveError)
test.use({ allowedConsole: [/ArchiveError: .*(too large|exceeds)/] })

test.describe('desktop, with lowered limits from apps.yaml', () => {
  test('an archive over maxArchiveSize shows the message and can be downloaded whole', async ({
    page,
    viewer
  }) => {
    await patchAppConfig(page, { maxArchiveSize: 1000 })
    await viewer.open('sample.tar')
    await expect(page.locator('.archive-viewer-message')).toContainText(
      'This archive is larger than'
    )
    const download = page.waitForEvent('download')
    await page.locator('.archive-viewer-download').click()
    expect(await sha256(await (await download).path())).toBe(
      await sha256(join(FIXTURES, 'sample.tar'))
    )
  })

  test('ZIPs are read by range, so maxArchiveSize does not apply to them', async ({
    page,
    viewer
  }) => {
    await patchAppConfig(page, { maxArchiveSize: 1000 })
    await viewer.open('sample.zip')
    await expect(viewer.row('docs')).toBeVisible()
  })

  test('a file over maxEntrySize is refused', async ({ consoleEntries, page, viewer }) => {
    await patchAppConfig(page, { maxEntrySize: 1000 })
    await viewer.open('large.zip')
    await viewer.openFolder('big')
    let downloaded = false
    page.on('download', () => (downloaded = true))
    await viewer.row('random-0.bin').locator('.archive-download').click()
    await expect(viewer.errorNotification()).toContainText('Failed to download "random-0.bin"')
    expect(consoleEntries.some(({ text }) => text.includes('"random-0.bin" is too large'))).toBe(
      true
    )
    expect(downloaded).toBe(false)
  })
})

test.describe('mobile (128 MiB archive, 384 MiB decompressed, 256 MiB per file)', () => {
  test.use(phone)

  test('an archive over 128 MiB is not downloaded', async ({ page, viewer }) => {
    await viewer.open(MOBILE_OVER_ARCHIVE)
    await expect(page.locator('.archive-viewer-message')).toContainText(
      'This archive is larger than'
    )
  })

  test('an archive that expands past 384 MiB is refused', async ({ page, viewer }) => {
    await viewer.open(MOBILE_OVER_UNCOMPRESSED)
    await expect(page.locator('.archive-viewer-message')).toHaveText(
      'The archive expands to more data than the browser is allowed to open.'
    )
  })

  test('small archives still open', async ({ viewer }) => {
    await viewer.open('sample.tar.xz')
    await expect(viewer.row('docs')).toBeVisible()
    await viewer.open('large.tar.bz2')
    await expect(viewer.row('big')).toBeVisible()
  })
})
