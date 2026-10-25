import { HttpRangeReader, RangeRequestError } from '../../../src/engine/rangeReader'
import { ArchiveError } from '../../../src/engine/types'
import { serveFile } from '../rangeServer'

const file = new Blob([new Uint8Array(1000).map((_, i) => i % 251)])
const expected = (start: number, end: number) =>
  new Uint8Array(1000).map((_, i) => i % 251).slice(start, end)

describe('HttpRangeReader', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads byte ranges with 206 responses and reports the bytes', async () => {
    const { requests } = serveFile(file)
    const onBytes = vi.fn()
    const reader = new HttpRangeReader('https://cloud.test/f', file.size, { onBytes })
    expect(await reader.readUint8Array(100, 50)).toEqual(expected(100, 150))
    expect(requests).toEqual([{ url: 'https://cloud.test/f', range: 'bytes=100-149' }])
    expect(onBytes).toHaveBeenCalledWith(50)
  })

  it('clamps reads at the end of the file', async () => {
    serveFile(file)
    const reader = new HttpRangeReader('https://cloud.test/f', file.size)
    expect(await reader.readUint8Array(990, 50)).toEqual(expected(990, 1000))
    expect(await reader.readUint8Array(1000, 5)).toEqual(new Uint8Array(0))
  })

  it('reports servers that ignore ranges', async () => {
    serveFile(file, { ranges: false })
    const reader = new HttpRangeReader('https://cloud.test/f', file.size)
    await expect(reader.readUint8Array(0, 10)).rejects.toMatchObject({
      code: 'range-unsupported'
    })
  })

  it('accepts a 200 when the range covers the whole file', async () => {
    serveFile(file, { ranges: false })
    const reader = new HttpRangeReader('https://cloud.test/f', file.size)
    expect(await reader.readUint8Array(0, 2000)).toEqual(expected(0, 1000))
  })

  it('renews the URL once on 401 and retries', async () => {
    const { requests } = serveFile(file, { expired: ['https://cloud.test/old'] })
    const renewUrl = vi.fn().mockResolvedValue('https://cloud.test/new')
    const reader = new HttpRangeReader('https://cloud.test/old', file.size, { renewUrl })
    expect(await reader.readUint8Array(0, 10)).toEqual(expected(0, 10))
    expect(await reader.readUint8Array(10, 10)).toEqual(expected(10, 20))
    expect(renewUrl).toHaveBeenCalledTimes(1)
    expect(requests.map((r) => r.url)).toEqual([
      'https://cloud.test/old',
      'https://cloud.test/new',
      'https://cloud.test/new'
    ])
  })

  it('fails on HTTP errors and short responses', async () => {
    serveFile(file, { expired: ['https://cloud.test/f'] })
    const reader = new HttpRangeReader('https://cloud.test/f', file.size)
    await expect(reader.readUint8Array(0, 10)).rejects.toBeInstanceOf(RangeRequestError)

    vi.restoreAllMocks()
    // The file on the server is shorter than its metadata says.
    serveFile(file.slice(0, 500))
    const short = new HttpRangeReader('https://cloud.test/f', file.size)
    await expect(short.readUint8Array(400, 200)).rejects.toBeInstanceOf(RangeRequestError)
  })

  it('stops when aborted', async () => {
    serveFile(file)
    const controller = new AbortController()
    controller.abort()
    vi.mocked(fetch).mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const reader = new HttpRangeReader('https://cloud.test/f', file.size, {
      signal: controller.signal
    })
    const error = await reader.readUint8Array(0, 10).catch((e) => e)
    expect(error.name).toBe('AbortError')
    expect(error).not.toBeInstanceOf(ArchiveError)
  })
})
