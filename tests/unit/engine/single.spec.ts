import { openArchive } from '../../../src/engine'
import { openSingleFile, singleFileName } from '../../../src/engine/single'
import { bzip2Samples } from './bzip2Samples'
import { xzSamples } from './xzSamples'
import { buildTar, gzipBytes } from './tarBuilder'

const limits = { maxUncompressedSize: 10_000_000 }
const fromBase64 = (base64: string) => new Blob([Uint8Array.from(Buffer.from(base64, 'base64'))])

describe('singleFileName', () => {
  it.each([
    ['notes.txt.gz', undefined, 'notes.txt'],
    ['data.json.bz2', undefined, 'data.json'],
    ['log.txt.xz', undefined, 'log.txt'],
    ['dump.sql.lzma', undefined, 'dump.sql'],
    ['notes.txt.gz', 'original.txt', 'original.txt'],
    ['x.gz', '../../etc/passwd', 'passwd'],
    ['strange', undefined, 'strange.out']
  ])('%s (stored %s) -> %s', (archive, stored, expected) => {
    expect(singleFileName(archive, stored)).toBe(expected)
  })
})

describe('openSingleFile', () => {
  it('exposes one readable entry', async () => {
    const handle = openSingleFile(new TextEncoder().encode('hi'), 'a.txt', 'gz')
    expect(handle.entries).toEqual([expect.objectContaining({ path: 'a.txt', size: 2 })])
    expect(await (await handle.read(handle.entries[0])).text()).toBe('hi')
  })
})

describe('openArchive with single compressed files', () => {
  it('opens a .gz file as one entry', async () => {
    const blob = await gzipBytes(new TextEncoder().encode('plain text'))
    const handle = await openArchive(blob, 'gz', limits, 'notes.txt.gz')
    expect(handle.entries.map((e) => e.name)).toEqual(['notes.txt'])
  })

  it('opens a gzipped tar without .tar in its name as an archive', async () => {
    const blob = await gzipBytes(buildTar([{ name: 'inside/file.txt', content: 'x' }]))
    const handle = await openArchive(blob, 'gz', limits, 'disguised.gz')
    expect(handle.entries.map((e) => e.path)).toEqual(['inside/file.txt'])
  })

  it('opens .bz2 and .tar.bz2', async () => {
    const single = await openArchive(
      fromBase64(bzip2Samples.TEXT_L9.data),
      'bz2',
      limits,
      'fox.txt.bz2'
    )
    expect(single.entries.map((e) => [e.name, e.size])).toEqual([['fox.txt', 2240]])
    const tar = await openArchive(fromBase64(bzip2Samples.TAR.data), 'tar.bz2', limits, 'a.tar.bz2')
    expect(tar.entries.map((e) => e.path)).toEqual(['docs/readme.txt', 'data.bin'])
    expect(await (await tar.read(tar.entries[0])).text()).toBe('hello from tar.bz2\n')
  })

  it('opens .xz, .tar.xz and .lzma', async () => {
    const xz = await openArchive(fromBase64(xzSamples.PRESET6.data), 'xz', limits, 'notes.txt.xz')
    expect(xz.entries.map((e) => [e.name, e.size])).toEqual([['notes.txt', xzSamples.PRESET6.size]])
    const tar = await openArchive(fromBase64(xzSamples.TAR.data), 'tar.xz', limits, 'src.tar.xz')
    expect(tar.entries.map((e) => e.path)).toEqual(['src/main.c', 'README'])
    const lzma = await openArchive(fromBase64(xzSamples.ALONE.data), 'lzma', limits, 'a.txt.lzma')
    expect(lzma.entries.map((e) => e.name)).toEqual(['a.txt'])
  })
})
