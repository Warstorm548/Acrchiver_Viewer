import { gunzip, readGzipHeader } from '../../../src/engine/gzip'
import { ArchiveError } from '../../../src/engine/types'
import { gzipBytes } from './tarBuilder'

describe('gunzip', () => {
  it('decompresses gzip data', async () => {
    const original = new TextEncoder().encode('hello gzip')
    const result = await gunzip(await gzipBytes(original), 1024)
    expect(new TextDecoder().decode(result)).toBe('hello gzip')
  })

  it('decompresses an empty file', async () => {
    expect((await gunzip(await gzipBytes(new Uint8Array(0)), 1024)).length).toBe(0)
  })

  it('decompresses larger data in one buffer of the recorded size', async () => {
    const original = new Uint8Array(300_000).map((_, i) => i % 251)
    const result = await gunzip(await gzipBytes(original), 1_000_000)
    expect(result.buffer.byteLength).toBe(original.length)
    expect(result).toEqual(original)
  })

  it('stops when the output exceeds the limit', async () => {
    const big = new Uint8Array(100_000)
    await expect(gunzip(await gzipBytes(big), 1000)).rejects.toMatchObject({ code: 'too-large' })
  })

  it('reports invalid data as corrupt', async () => {
    await expect(gunzip(new Blob([new Uint8Array([1, 2, 3])]), 1000)).rejects.toBeInstanceOf(
      ArchiveError
    )
  })
})

describe('readGzipHeader', () => {
  // gzip header with FNAME "notes.txt" and MTIME 1700000000, as written by `gzip notes.txt`
  const header = new Uint8Array([
    0x1f,
    0x8b,
    0x08,
    0x08,
    0x00,
    0xf1,
    0x53,
    0x65,
    0x00,
    0x03,
    ...new TextEncoder().encode('notes.txt'),
    0x00
  ])

  it('reads the stored file name and date', () => {
    expect(readGzipHeader(header)).toEqual({
      fileName: 'notes.txt',
      modified: new Date(1_700_000_000 * 1000)
    })
  })

  it('returns nothing for headers without a name', async () => {
    const plain = new Uint8Array(await (await gzipBytes(new Uint8Array([1]))).arrayBuffer())
    expect(readGzipHeader(plain).fileName).toBeUndefined()
  })

  it('ignores non-gzip data', () => {
    expect(readGzipHeader(new Uint8Array([1, 2, 3]))).toEqual({})
  })
})
