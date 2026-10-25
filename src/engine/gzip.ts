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
