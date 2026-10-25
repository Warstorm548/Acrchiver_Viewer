import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js/lib/zip-native.js'
import { configureZip, openZip } from '../../../src/engine/zip'
import { ArchiveError } from '../../../src/engine/types'

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

  it('rejects data that is not a zip', async () => {
    await expect(openZip(new Blob(['not a zip at all']))).rejects.toBeInstanceOf(ArchiveError)
  })
})
