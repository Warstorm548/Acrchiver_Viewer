import { GrowableBuffer, toArchiveError } from './buffer'

/** Deflate can't expand data by more than about 1032:1, so a bigger recorded size is junk. */
const MAX_DEFLATE_RATIO = 1032

/**
 * Size recorded in the gzip trailer (ISIZE: the last member's size modulo 4 GiB). Exact for the
 * usual single-member file under 4 GiB, so the output buffer can be allocated once; otherwise it
 * just grows.
 */
const recordedSize = async (blob: Blob): Promise<number | undefined> => {
  if (blob.size < 18) {
    return undefined
  }
  const trailer = new DataView(await blob.slice(blob.size - 4).arrayBuffer())
  const size = trailer.getUint32(0, true)
  return size <= blob.size * MAX_DEFLATE_RATIO ? size : undefined
}

/**
 * Decompresses gzip data with the browser's built-in DecompressionStream (no WebAssembly), and
 * stops as soon as the output exceeds `maxSize` so a small "zip bomb" can't exhaust memory.
 */
export const gunzip = async (blob: Blob, maxSize: number): Promise<Uint8Array<ArrayBuffer>> => {
  const reader = blob.stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  try {
    const out = new GrowableBuffer(maxSize, await recordedSize(blob))
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        return out.result()
      }
      out.writeBytes(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw toArchiveError(error, 'Invalid gzip data')
  }
}

export interface GzipHeader {
  /** Original file name stored by `gzip` (FNAME field), if any. */
  fileName?: string
  modified?: Date
}

/** Reads the optional original name and modification time from a gzip header (RFC 1952). */
export const readGzipHeader = (bytes: Uint8Array): GzipHeader => {
  if (bytes.length < 10 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return {}
  }
  const flags = bytes[3]
  const mtime = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)
  const header: GzipHeader = { modified: mtime ? new Date((mtime >>> 0) * 1000) : undefined }
  let position = 10
  if (flags & 0x04) {
    position += 2 + (bytes[position] | (bytes[position + 1] << 8))
  }
  if (flags & 0x08) {
    const end = bytes.indexOf(0, position)
    if (end > position) {
      header.fileName = new TextDecoder('latin1').decode(bytes.subarray(position, end))
    }
  }
  return header
}
