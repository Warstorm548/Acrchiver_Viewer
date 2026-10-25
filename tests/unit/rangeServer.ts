// Mocks `fetch` as a file server: answers `Range: bytes=a-b` with 206 and the slice (like
// OpenCloud's signed download URLs), or with 200 and the whole file when ranges are off.

export interface ServedRequest {
  url: string
  range: string | null
}

export interface RangeServerOptions {
  ranges?: boolean
  /** URLs answered with 401 (e.g. an expired signature). */
  expired?: string[]
}

export const serveFile = (file: Blob, { ranges = true, expired = [] }: RangeServerOptions = {}) => {
  const requests: ServedRequest[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    const range = new Headers(init?.headers).get('Range')
    requests.push({ url, range })
    if (expired.includes(url)) {
      return Promise.resolve(new Response(null, { status: 401 }))
    }
    const match = range && /^bytes=(\d+)-(\d+)$/.exec(range)
    if (!ranges || !match) {
      return Promise.resolve(new Response(file, { status: 200 }))
    }
    const start = Number(match[1])
    const end = Math.min(Number(match[2]), file.size - 1)
    return Promise.resolve(
      new Response(file.slice(start, end + 1), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${file.size}` }
      })
    )
  })
  return { spy, requests }
}
