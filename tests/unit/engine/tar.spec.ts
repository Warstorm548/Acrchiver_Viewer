import { openTar } from '../../../src/engine/tar'
import { ArchiveError } from '../../../src/engine/types'
import { buildTar } from './tarBuilder'

describe('openTar', () => {
  it('lists files and folders with sizes and dates', () => {
    const handle = openTar(
      buildTar([
        { name: 'docs/', type: '5' },
        { name: 'docs/readme.txt', content: 'hello', mtime: 1_700_000_000 },
        { name: 'root.txt', content: 'abc' }
      ])
    )
    expect(handle.entries.map((e) => [e.path, e.isDirectory, e.size])).toEqual([
      ['docs', true, 0],
      ['docs/readme.txt', false, 5],
      ['root.txt', false, 3]
    ])
    expect(handle.entries[1].modified).toEqual(new Date(1_700_000_000 * 1000))
  })

  it('reads file content', async () => {
    const handle = openTar(buildTar([{ name: 'a/b.txt', content: 'content here' }]))
    const blob = await handle.read(handle.entries[0])
    expect(await blob.text()).toBe('content here')
    expect(blob.type).toBe('text/plain')
  })

  it('supports GNU long names and pax paths', () => {
    const long = `${'deep/'.repeat(25)}file.txt`
    const handle = openTar(
      buildTar([
        { name: long, content: 'x', gnuLongName: true },
        { name: `pax-${long}`, content: 'y', paxPath: true },
        { name: 'Ünïcödé/résumé.txt', content: 'z', paxPath: true }
      ])
    )
    expect(handle.entries.map((e) => e.path)).toEqual([long, `pax-${long}`, 'Ünïcödé/résumé.txt'])
  })

  it('marks symlinks as unsupported', () => {
    const handle = openTar(buildTar([{ name: 'link', type: '2' }]))
    expect(handle.entries[0].supported).toBe(false)
  })

  it('rejects reading entries without data', async () => {
    const handle = openTar(buildTar([{ name: 'link', type: '2' }]))
    await expect(handle.read(handle.entries[0])).rejects.toBeInstanceOf(ArchiveError)
  })

  it('detects corrupt headers', () => {
    const data = buildTar([{ name: 'a.txt', content: 'x' }])
    data[10] ^= 0xff
    expect(() => openTar(data)).toThrow(ArchiveError)
  })

  it('rejects a header whose size is not a number', () => {
    const data = buildTar([{ name: 'a.txt', content: 'x' }])
    data.set(new TextEncoder().encode('abc\0\0\0\0\0\0\0\0\0'), 124)
    // recompute the checksum so only the size field is wrong
    data.fill(0x20, 148, 156)
    const sum = data.subarray(0, 512).reduce((total, byte) => total + byte, 0)
    data.set(new TextEncoder().encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148)
    expect(() => openTar(data)).toThrow(/Invalid tar entry size/)
  })

  it('reads each of two members with the same path', async () => {
    const handle = openTar(
      buildTar([
        { name: 'a.txt', content: 'one' },
        { name: 'a.txt', content: 'second' }
      ])
    )
    expect(await (await handle.read(handle.entries[0])).text()).toBe('one')
    expect(await (await handle.read(handle.entries[1])).text()).toBe('second')
    // a lookup by path alone gets the last member, like the folder index
    expect(await (await handle.read({ ...handle.entries[0] })).text()).toBe('second')
  })

  it('detects truncated archives', () => {
    const data = buildTar([{ name: 'a.txt', content: 'x'.repeat(2000) }])
    expect(() => openTar(data.slice(0, 1024))).toThrow(/truncated/)
  })
})
