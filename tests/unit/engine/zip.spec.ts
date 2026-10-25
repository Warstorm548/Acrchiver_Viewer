import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js/lib/zip-native.js'
import { configureZip, openZip } from '../../../src/engine/zip'
import { ArchiveError } from '../../../src/engine/types'
import { HttpRangeReader } from '../../../src/engine/rangeReader'
import { serveFile } from '../rangeServer'

const makeZip = async (files: Record<string, string>, password?: string): Promise<Blob> => {
  const writer = new ZipWriter(new BlobWriter('application/zip'), password ? { password } : {})
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('/')) {
      await writer.add(name, undefined, { directory: true })
    } else {
      await writer.add(name, new TextReader(content))
    }
  }
  return writer.close()
}

describe('openZip', () => {
  beforeAll(() => configureZip({ useWebWorkers: false }))

  it('lists entries with normalized paths', async () => {
    const handle = await openZip(
      await makeZip({ 'docs/': '', 'docs/a.txt': 'aaa', 'b.json': '{}' })
    )
    expect(handle.entries.map((e) => [e.path, e.isDirectory, e.size])).toEqual([
      ['docs', true, 0],
      ['docs/a.txt', false, 3],
      ['b.json', false, 2]
    ])
    await handle.close()
  })

  it('reads file content with a MIME type', async () => {
    const handle = await openZip(await makeZip({ 'note.md': '# hi' }))
    const blob = await handle.read(handle.entries[0])
    expect(await blob.text()).toBe('# hi')
    expect(blob.type).toBe('text/markdown')
  })

  it('marks encrypted entries as unsupported', async () => {
    const handle = await openZip(await makeZip({ 'secret.txt': 'x' }, 'pw'))
    expect(handle.entries[0].encrypted).toBe(true)
    expect(handle.entries[0].supported).toBe(false)
    await expect(handle.read(handle.entries[0])).rejects.toBeInstanceOf(ArchiveError)
  })

  it('opens and reads a zip through a range reader', async () => {
    const zip = await makeZip({ 'docs/a.txt': 'aaa', 'b.txt': 'b'.repeat(5000) })
    const { requests } = serveFile(zip)
    const handle = await openZip(new HttpRangeReader('https://cloud.test/z', zip.size))
    expect(handle.entries.map((e) => e.path)).toEqual(['docs/a.txt', 'b.txt'])
    expect(await (await handle.read(handle.entries[1])).text()).toBe('b'.repeat(5000))
    expect(requests.every((r) => r.range)).toBe(true)
    await handle.close()
    vi.restoreAllMocks()
  })

  it('refuses entries whose declared size is over the cap', async () => {
    const handle = await openZip(await makeZip({ 'big.txt': 'x'.repeat(100) }), {
      maxEntrySize: 50
    })
    await expect(handle.read(handle.entries[0])).rejects.toMatchObject({ code: 'too-large' })
  })

  it('refuses entries that are bigger than they claim', async () => {
    const bytes = new Uint8Array(
      await (await makeZip({ 'big.txt': 'x'.repeat(100) })).arrayBuffer()
    )
    // Make the central directory claim the file is 1 byte (uncompressed size at offset 24).
    const view = new DataView(bytes.buffer)
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 1, true)
        break
      }
    }
    const handle = await openZip(new Blob([bytes]), { maxEntrySize: 50 })
    expect(handle.entries[0].size).toBe(1)
    // zip.js stops at the declared size; the limited writer is a second guard.
    await expect(handle.read(handle.entries[0])).rejects.toMatchObject({ code: 'corrupt' })
  })

  it('applies a lower cap passed to a single read', async () => {
    const handle = await openZip(await makeZip({ 'a.txt': 'x'.repeat(100) }), {
      maxEntrySize: 1000
    })
    await expect(handle.read(handle.entries[0], 50)).rejects.toMatchObject({ code: 'too-large' })
    expect((await handle.read(handle.entries[0], 100)).size).toBe(100)
  })

  it('rejects data that is not a zip', async () => {
    await expect(openZip(new Blob(['not a zip at all']))).rejects.toBeInstanceOf(ArchiveError)
  })
})
