// The 3 GiB ZIP64 from `make-fixtures.sh --large-zip` (3,006 entries: 3,000 small files, a
// 200 MiB text file, 2 × 900 MiB and 1 × 1,200 MiB stored files, a small file after the bulk).
// Skipped with E2E_SKIP_LARGE=1. The archive is removed from the server, trash and disk afterwards.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { FIXTURES, SKIP_LARGE } from '../env'
import { archiveHashes, sha256 } from '../helpers/files'
import { measurePeak } from '../helpers/memory'
import { removeCompletely, upload } from '../helpers/server'
import { expect, phone, test } from '../test'

const GiB = 1024 * 1024 * 1024
const archive = join(FIXTURES, 'big-test.zip')
const checksums = join(FIXTURES, 'big-test.sha256')

test.skip(SKIP_LARGE, 'E2E_SKIP_LARGE=1')
test.describe.configure({ mode: 'serial' })
test.use({ allowedConsole: [/ArchiveError: .*(too large|exceeds)|Selection too large/] })

const expectedSha = (name: string) =>
  readFileSync(checksums, 'utf8')
    .split('\n')
    .find((line) => line.endsWith(`  ${name}`))
    ?.split(' ')[0]

test.beforeAll(async () => {
  test.setTimeout(20 * 60_000)
  if (!existsSync(archive) || !existsSync(checksums)) {
    execFileSync(join(FIXTURES, 'make-fixtures.sh'), ['--large-zip'], { stdio: 'inherit' })
  }
  await upload(archive)
})

test.afterAll(async () => {
  test.setTimeout(5 * 60_000)
  await removeCompletely('big-test.zip')
  rmSync(archive, { force: true })
  rmSync(checksums, { force: true })
})

test('opens with a few range requests, no WebAssembly; the last file previews', async ({
  page,
  viewer
}) => {
  const reads: number[] = []
  const wasm: string[] = []
  page.on('response', (response) => {
    const url = decodeURIComponent(response.url())
    if (
      url.includes('/dav/') &&
      url.includes('big-test.zip') &&
      response.request().method() === 'GET'
    ) {
      reads.push(response.status())
    }
    if (url.endsWith('.wasm')) {
      wasm.push(url)
    }
  })
  await viewer.open('big-test.zip')
  expect(await viewer.names()).toEqual(['bulk', 'late', 'medium', 'small', 'README.txt'])
  expect(reads.length).toBeLessThan(20)
  expect(reads.every((status) => status === 206)).toBe(true)
  expect(wasm).toEqual([])

  await viewer.openFolder('late')
  await viewer.row('notes.md').click()
  await expect(page.locator('.archive-preview-text')).toContainText('Stored after 3 GiB of data.')
})

test('the 200 MiB deflated file downloads intact', async ({ viewer }) => {
  test.setTimeout(10 * 60_000)
  await viewer.open('big-test.zip')
  await viewer.openFolder('medium')
  const download = await viewer.downloadFile('hex-200MiB.txt')
  expect(await sha256(await download.path())).toBe(expectedSha('medium/hex-200MiB.txt'))
})

test('a 900 MiB file downloads intact, peak tab memory under 1.5 GiB', async ({
  viewer
}, testInfo) => {
  test.setTimeout(15 * 60_000)
  await viewer.open('big-test.zip')
  await viewer.openFolder('bulk')
  const { result: path, peak } = await measurePeak(async () => {
    const download = await viewer.downloadFile('stored-900MiB-a.bin')
    return download.path()
  })
  testInfo.annotations.push({
    type: 'peak renderer memory',
    description: `${(peak / 2 ** 20).toFixed(0)} MiB`
  })
  console.log(`peak renderer memory for the 900 MiB download: ${(peak / 2 ** 20).toFixed(0)} MiB`)
  expect(await sha256(path)).toBe(expectedSha('bulk/stored-900MiB-a.bin'))
  expect(peak).toBeLessThan(1.5 * GiB)
})

test('the 1,200 MiB file and the bulk selection are refused (1 GiB cap)', async ({
  page,
  viewer
}) => {
  let downloads = 0
  page.on('download', () => downloads++)
  await viewer.open('big-test.zip')
  await viewer.select('bulk')
  await page.locator('.archive-download-selected').click()
  await expect(viewer.errorNotification()).toContainText('Failed to download the selection')

  await viewer.openFolder('bulk')
  await viewer.row('over-cap-1200MiB.bin').locator('.archive-download').click()
  await expect(viewer.errorNotification()).toContainText(
    'Failed to download "over-cap-1200MiB.bin"'
  )
  expect(downloads).toBe(0)
})

test('the small/ selection holds all 3,000 files intact', async ({ viewer }) => {
  test.setTimeout(10 * 60_000)
  await viewer.open('big-test.zip')
  await viewer.select('small')
  const download = await viewer.downloadSelected()
  expect(download.suggestedFilename()).toBe('big-test-selection.zip')
  const received = archiveHashes(await download.path())
  expect(Object.keys(received)).toHaveLength(3000)
  expect(received).toEqual(archiveHashes(archive, 'small/'))
})

test.describe('mobile', () => {
  test.use(phone)

  test('a 900 MiB file is refused (256 MiB per-file limit)', async ({ page, viewer }) => {
    let downloads = 0
    page.on('download', () => downloads++)
    await viewer.open('big-test.zip')
    await viewer.openFolder('bulk')
    await viewer.row('stored-900MiB-b.bin').locator('.archive-download').click()
    await expect(viewer.errorNotification()).toContainText(
      'Failed to download "stored-900MiB-b.bin"'
    )
    expect(downloads).toBe(0)
  })
})
