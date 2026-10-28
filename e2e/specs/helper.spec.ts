// The server helper (deploy/compose/archive-helper.yml) must be running in the local stack.
// Lowering maxArchiveSize sends the small fixtures through the helper without a restart.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Page } from '@playwright/test'
import { FIXTURES, HELPER_TEMP_DIR } from '../env'
import { archiveHashes, sha256 } from '../helpers/files'
import { expect, patchAppConfig, test } from '../test'

const serverMode = (page: Page) => patchAppConfig(page, { maxArchiveSize: 1000 })

/** Folder pages arrive from the server: wait until the spinner is gone. */
const listed = (page: Page) => expect(page.locator('.archive-listing')).toHaveCount(0)

/** The helper's temp files (it names them ah-…; the folder is world-readable). */
const tempFiles = () => readdirSync(HELPER_TEMP_DIR).filter((name) => name.startsWith('ah-'))

// Other archives may be open on the stack (another browser, an earlier run within the helper's
// timeout), so each test only looks at the temp files it created itself.
let before = new Set<string>()
const ownTempFiles = () => tempFiles().filter((name) => !before.has(name))
const waitForNoOwnTempFiles = () => expect.poll(ownTempFiles, { timeout: 15_000 }).toEqual([])

test.describe('archives opened by the server helper', () => {
  test.beforeEach(() => {
    before = new Set(tempFiles())
  })

  // leaving the viewer closes the session, and the helper deletes its temp file at once
  test.afterEach(async ({ page }) => {
    await page.goto('/files/spaces/personal')
    await waitForNoOwnTempFiles()
  })

  test('lists, navigates and searches like the browser does', async ({ page, viewer }) => {
    // the browser's own listing as the reference
    await viewer.open('sample.tar.xz')
    const rootInBrowser = await viewer.names()
    await viewer.openFolder('docs')
    const docsInBrowser = await viewer.names()

    await serverMode(page)
    const opened = page.waitForRequest((r) => r.url().endsWith('/archive-api/sessions'))
    await viewer.open('sample.tar.xz')
    await opened
    expect(await viewer.names()).toEqual(rootInBrowser)
    expect(ownTempFiles()).toHaveLength(1)
    await viewer.openFolder('docs')
    await listed(page)
    expect(await viewer.names()).toEqual(docsInBrowser)

    await page.locator('.archive-search input').fill('config')
    await expect(page.locator('.archive-search-summary')).toHaveText('1 result')
    await expect(page.locator('.archive-row-folder')).toHaveText('docs/deep/deeper')

    // the hostile name is shown as text, as in browser mode
    await page.locator('.archive-search input').fill('')
    await page.locator('.archive-crumb').first().click()
    await listed(page)
    await expect(viewer.row('x" onmouseover="alert(1)".txt')).toBeVisible()
  })

  test('previews a text file read on the server', async ({ page, viewer }) => {
    await serverMode(page)
    await viewer.open('sample.tar.xz')
    await viewer.row('README.txt').locator('.archive-preview').click()
    await expect(page.locator('.archive-preview-text')).toContainText(
      'Archive Viewer test archive.'
    )
  })

  test('downloads one file and a selection byte-identical', async ({ page, viewer }) => {
    await serverMode(page)
    await viewer.open('large.tar.bz2')
    await viewer.openFolder('big')
    const expected = archiveHashes(join(FIXTURES, 'large.tar.bz2'), 'big/')

    const single = await viewer.downloadFile('random-2.bin')
    expect(single.suggestedFilename()).toBe('random-2.bin')
    expect(await sha256(await single.path())).toBe(expected['big/random-2.bin'])

    await viewer.select('random-0.bin', 'random-3.bin', 'readme.txt')
    const zip = await viewer.downloadSelected()
    expect(zip.suggestedFilename()).toBe('large-selection.zip')
    expect(archiveHashes(await zip.path())).toEqual({
      'big/random-0.bin': expected['big/random-0.bin'],
      'big/random-3.bin': expected['big/random-3.bin'],
      'big/readme.txt': expected['big/readme.txt']
    })
  })

  test('asks before a download over the confirmation size', async ({ page, viewer }) => {
    await serverMode(page)
    // the helper's threshold is 1 GB; pretend it is 1 byte by rewriting its answer
    await page.route('**/archive-api/sessions/*/downloads', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      await route.fulfill({ response, json: { ...body, confirm: true } })
    })
    await viewer.open('large.tar.bz2')
    await viewer.openFolder('big')
    await viewer.row('readme.txt').locator('.archive-download').click()
    await expect(page.locator('.archive-confirm-text')).toContainText('1 file')
    await page.locator('.archive-confirm-cancel').click()
    await expect(page.locator('.archive-confirm-text')).toHaveCount(0)

    const download = page.waitForEvent('download')
    await viewer.row('readme.txt').locator('.archive-download').click()
    await page.locator('.archive-confirm-accept').click()
    expect((await download).suggestedFilename()).toBe('readme.txt')
  })

  test('deletes the temp file when the viewer is left', async ({ page, viewer }) => {
    await serverMode(page)
    await viewer.open('sample.tar.xz')
    expect(ownTempFiles()).toHaveLength(1)
    await page.goto('/files/spaces/personal')
    await waitForNoOwnTempFiles()
  })

  test('can be cancelled while the server prepares the archive', async ({ page }) => {
    await serverMode(page)
    // hold the status answers so the archive stays "being prepared"
    await page.route('**/archive-api/sessions/*', (route) =>
      route.request().method() === 'GET' ? undefined : route.fallback()
    )
    await page.goto('/archive-viewer/personal/admin/large.tar.bz2')
    await page.locator('.archive-viewer-cancel').click()
    await expect(page.locator('.archive-viewer-message')).toHaveText(
      'Opening the archive was cancelled.'
    )
    await expect(page.locator('.archive-viewer-retry')).toBeVisible()
    await waitForNoOwnTempFiles()
  })
})

// 0.4.0: sample.7z and sample-deflate64.zip (make-fixtures.sh, made by 7-Zip) hold sample.tar's
// tree; Python can't read them, so downloads are compared with sample.tar's files.
test.describe('ZIP and 7z on the server', () => {
  test.beforeEach(() => {
    before = new Set(tempFiles())
  })

  test.afterEach(async ({ page }) => {
    await page.goto('/files/spaces/personal')
    await waitForNoOwnTempFiles()
  })

  const opensOnServer = (page: Page) =>
    page.waitForRequest((r) => r.url().endsWith('/archive-api/sessions') && r.method() === 'POST')

  test('a 7z opens on the server at any size and downloads byte-identical', async ({
    page,
    viewer
  }) => {
    await viewer.open('sample.tar')
    const rootInBrowser = await viewer.names()
    await viewer.openFolder('docs')
    const docsInBrowser = await viewer.names()

    const opened = opensOnServer(page)
    await viewer.open('sample.7z')
    await opened
    expect(await viewer.names()).toEqual(rootInBrowser)
    // the session is ready once it is listed, so its temp file exists
    expect(ownTempFiles()).toHaveLength(1)
    await viewer.openFolder('docs')
    await listed(page)
    expect(await viewer.names()).toEqual(docsInBrowser)

    await viewer.row('notes.md').locator('.archive-preview').click()
    await expect(page.locator('.archive-preview-text')).toContainText('Nested folder test.')
    await page.keyboard.press('Escape')

    const expected = archiveHashes(join(FIXTURES, 'sample.tar'), 'docs/')
    await viewer.select('notes.md', 'deep')
    const zip = await viewer.downloadSelected()
    expect(zip.suggestedFilename()).toBe('sample-selection.zip')
    expect(archiveHashes(await zip.path())).toEqual(expected)
  })

  test('a ZIP over the browser limit opens on the server like in range mode', async ({
    page,
    viewer
  }) => {
    await viewer.open('sample.zip')
    const rootByRange = await viewer.names()

    await serverMode(page)
    const opened = opensOnServer(page)
    await viewer.open('sample.zip')
    await opened
    expect(await viewer.names()).toEqual(rootByRange)
    expect(ownTempFiles()).toHaveLength(1)

    const expected = archiveHashes(join(FIXTURES, 'sample.zip'), 'images/')
    await viewer.select('images')
    const zip = await viewer.downloadSelected()
    expect(archiveHashes(await zip.path())).toEqual(expected)
  })

  test('a ZIP with Deflate64 entries moves to the server', async ({ page, viewer }) => {
    const opened = opensOnServer(page)
    await viewer.open('sample-deflate64.zip')
    await opened
    await expect(page.locator('.archive-viewer-notice')).toHaveCount(0)
    const expected = archiveHashes(join(FIXTURES, 'sample.tar'))
    // binary.bin is one of the Deflate64 entries
    const file = await viewer.downloadFile('binary.bin')
    expect(await sha256(await file.path())).toBe(expected['binary.bin'])
  })
})

test.describe('without a working helper', () => {
  // the simulated outage itself shows up in the console
  test.use({ allowedConsole: [/status of 502 \(Bad Gateway\)/] })

  test('falls back to the browser limits when the helper does not answer', async ({
    page,
    viewer
  }) => {
    await serverMode(page)
    await page.route('**/archive-api/health', (route) => route.fulfill({ status: 502 }))
    await viewer.open('sample.tar.xz')
    await expect(page.locator('.archive-viewer-message')).toContainText(
      'This archive is larger than'
    )
  })
})

test.describe('a helper that refuses a big ZIP', () => {
  // the simulated refusal itself shows up in the console
  test.use({ allowedConsole: [/status of 507/] })

  test('the ZIP is still read by range, with a notice', async ({ page, viewer }) => {
    await serverMode(page)
    await page.route('**/archive-api/sessions', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 507, json: { code: 'server-busy', message: 'busy' } })
        : route.fallback()
    )
    await viewer.open('sample.zip')
    await expect(page.locator('.archive-viewer-notice')).toContainText(
      'read in the browser, where some files may not open'
    )
    await expect(viewer.row('README.txt')).toBeVisible()
  })
})
