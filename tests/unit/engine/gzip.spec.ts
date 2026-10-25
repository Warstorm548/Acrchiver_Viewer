import { gunzip } from '../../../src/engine/gzip'
import { ArchiveError } from '../../../src/engine/types'
import { gzipBytes } from './tarBuilder'

describe('gunzip', () => {
  it('decompresses gzip data', async () => {
    const original = new TextEncoder().encode('hello gzip')
    const result = await gunzip(await gzipBytes(original), 1024)
    expect(new TextDecoder().decode(result)).toBe('hello gzip')
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
