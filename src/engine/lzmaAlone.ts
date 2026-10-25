// Legacy .lzma ("LZMA_Alone") format: 13-byte header (properties, dictionary size, uncompressed
// size or "unknown"), then a raw LZMA stream that may end with an end marker.
import { LzmaDecoder, parseLzmaProperties } from './lzma/lzmaDecoder'
import { Output } from './lzma/output'
import { RangeDecoder } from './lzma/rangeDecoder'
import { ArchiveError } from './types'

const HEADER_SIZE = 13

/** Cheap plausibility check for the magic-less .lzma header. */
export const looksLikeLzmaAlone = (head: Uint8Array): boolean =>
  head.length >= HEADER_SIZE && head[0] < 225

export const unlzma = (data: Uint8Array, maxSize: number): Uint8Array<ArrayBuffer> => {
  if (!looksLikeLzmaAlone(data)) {
    throw new ArchiveError('corrupt', 'Invalid .lzma data: bad header')
  }
  let unknownSize = true
  let size = 0
  for (let i = 0; i < 8; i++) {
    if (data[5 + i] !== 0xff) {
      unknownSize = false
    }
    size += data[5 + i] * 2 ** (8 * i)
  }
  if (!unknownSize && size > maxSize) {
    throw new ArchiveError('too-large', `Decompressed size exceeds ${maxSize} bytes`)
  }
  const out = new Output(maxSize, unknownSize ? undefined : size)
  const lzma = new LzmaDecoder(out)
  lzma.setProperties(parseLzmaProperties(data[0]))
  lzma.resetState()
  lzma.resetDictionary()
  const rc = new RangeDecoder(data, HEADER_SIZE, data.length)
  // With an unknown size, decode until the end marker (the limit only guards memory).
  lzma.decode(rc, unknownSize ? maxSize + 1 : size, true)
  if (!unknownSize && out.length !== size) {
    throw new ArchiveError('corrupt', 'Invalid .lzma data: ended before the declared size')
  }
  return out.result()
}
