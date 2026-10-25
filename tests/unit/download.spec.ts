import { BlobReader, ZipReader } from '@zip.js/zip.js/lib/zip-native.js'
import { selectionPath, zipEntries } from '../../src/download'
import { ArchiveEntry, ArchiveHandle } from '../../src/engine'
import { configureZip } from '../../src/engine/zip'

const entry = (path: string): ArchiveEntry => ({
  path,
  name: path.slice(path.lastIndexOf('/') + 1),
  isDirectory: false,
  size: 1,
  supported: true
})

describe('selectionPath', () => {
  it('drops traversal segments from untrusted paths', () => {
    const used = new Set<string>()
    expect(selectionPath('../../etc/passwd', used)).toBe('etc/passwd')
    expect(selectionPath('a/./b/../c.txt', used)).toBe('a/b/c.txt')
    expect(selectionPath('..', used)).toBe('download')
    // whitespace around ".." must not survive as ".." after sanitizing
    expect(selectionPath(' .. /outside.txt', used)).toBe('outside.txt')
    expect(selectionPath('a/\t..\t/b.txt', used)).toBe('a/b.txt')
    expect(selectionPath('a//b.txt', new Set())).toBe('a/b.txt')
  })

  it('replaces control characters and numbers clashing names', () => {
    const used = new Set<string>()
    expect(selectionPath('docs/a\u0007.txt', used)).toBe('docs/a_.txt')
    expect(selectionPath('x/a.txt', used)).toBe('x/a.txt')
    expect(selectionPath('../x/a.txt', used)).toBe('x/a (2).txt')
    expect(selectionPath('x/a.txt', used)).toBe('x/a (3).txt')
    expect(selectionPath('README', new Set(['README']))).toBe('README (2)')
  })
})

describe('zipEntries', () => {
  beforeAll(() => configureZip({ useWebWorkers: false }))

  it('writes safe paths into the selection zip', async () => {
    const handle = {
      read: (e: ArchiveEntry) => Promise.resolve(new Blob([e.path]))
    } as unknown as ArchiveHandle
    const zip = await zipEntries(handle, [entry('../evil.txt'), entry('docs/ok.txt')])
    const reader = new ZipReader(new BlobReader(zip))
    expect((await reader.getEntries()).map((e) => e.filename)).toEqual(['evil.txt', 'docs/ok.txt'])
    await reader.close()
  })
})
