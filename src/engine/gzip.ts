import { ArchiveError } from './types'

/**
 * Decompresses gzip data with the browser's built-in DecompressionStream (no WebAssembly), and
 * stops as soon as the output exceeds `maxSize` so a small "zip bomb" can't exhaust memory.
 */
export const gunzip = async (blob: Blob, maxSize: number): Promise<Uint8Array<ArrayBuffer>> => {
  const reader = blob.stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      total += value.length
      if (total > maxSize) {
        await reader.cancel()
        throw new ArchiveError('too-large', `Decompressed size exceeds ${maxSize} bytes`)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof ArchiveError) {
      throw error
    }
    throw new ArchiveError('corrupt', `Invalid gzip data: ${(error as Error).message}`)
  }

  const result = new Uint8Array(total)
  let position = 0
  for (const chunk of chunks) {
    result.set(chunk, position)
    position += chunk.length
  }
  return result
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
