// Reads a remote file piece by piece with HTTP Range requests, for zip.js. Used for ZIP files so
// that only the index and the files the user opens are downloaded.
import { Reader } from '@zip.js/zip.js/lib/zip-native.js'
import { ArchiveError } from './types'

/** Network or HTTP failure while reading a range (not a problem with the archive itself). */
export class RangeRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RangeRequestError'
  }
}

export interface RangeReaderOptions {
  /** Returns a fresh URL when the current one is rejected (OpenCloud's signed URLs expire after 30 min). */
  renewUrl?: () => Promise<string>
  signal?: AbortSignal
  /** Called with the number of bytes received by each request (for progress display). */
  onBytes?: (count: number) => void
}

export class HttpRangeReader extends Reader<string> {
  private url: string

  constructor(
    url: string,
    size: number,
    private readonly options: RangeReaderOptions = {}
  ) {
    super(url)
    this.url = url
    // The size comes from the file's metadata: OpenCloud's signed URLs don't allow HEAD requests.
    this.size = size
  }

  private request(start: number, end: number): Promise<Response> {
    return fetch(this.url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: this.options.signal
    })
  }

  async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (length <= 0 || index >= this.size) {
      return new Uint8Array(0)
    }
    const end = Math.min(index + length, this.size) - 1
    let response: Response
    try {
      response = await this.request(index, end)
      if ((response.status === 401 || response.status === 403) && this.options.renewUrl) {
        this.url = await this.options.renewUrl()
        response = await this.request(index, end)
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw error
      }
      throw new RangeRequestError(`Range request failed: ${(error as Error).message}`)
    }
    // A 200 for a range covering the whole file is a valid answer; otherwise ranges are ignored.
    const wholeFile = index === 0 && end === this.size - 1
    if (response.status === 200 && !wholeFile) {
      await response.body?.cancel()
      throw new ArchiveError('range-unsupported', 'The server does not support range requests')
    }
    if (response.status !== 206 && response.status !== 200) {
      throw new RangeRequestError(`Range request failed with HTTP ${response.status}`)
    }
    const data = new Uint8Array(await response.arrayBuffer())
    if (data.length !== end - index + 1) {
      throw new RangeRequestError(
        `Range response had ${data.length} bytes, expected ${end - index + 1}`
      )
    }
    this.options.onBytes?.(data.length)
    return data
  }
}
