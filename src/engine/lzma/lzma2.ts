import { ArchiveError } from '../types'
import { LzmaDecoder, parseLzmaProperties } from './lzmaDecoder'
import { Output } from './output'
import { RangeDecoder } from './rangeDecoder'

const corrupt = (detail: string): never => {
  throw new ArchiveError('corrupt', `Invalid LZMA2 data: ${detail}`)
}

/**
 * Decodes one LZMA2 stream (as found in an XZ block) starting at `start`, appending to `out`.
 * Returns the input position just after the end-of-stream control byte.
 */
export const decodeLzma2 = (data: Uint8Array, start: number, out: Output): number => {
  const lzma = new LzmaDecoder(out)
  let pos = start
  let needDictReset = true
  let needProperties = true

  for (;;) {
    if (pos >= data.length) {
      corrupt('unexpected end of input')
    }
    const control = data[pos++]
    if (control === 0x00) {
      return pos
    }

    if (control === 0x01 || control === 0x02) {
      // Uncompressed chunk (0x01 also resets the dictionary).
      if (control === 0x01) {
        lzma.resetDictionary()
        needDictReset = false
      } else if (needDictReset) {
        corrupt('missing dictionary reset')
      }
      if (pos + 2 > data.length) {
        corrupt('truncated chunk header')
      }
      const size = ((data[pos] << 8) | data[pos + 1]) + 1
      pos += 2
      if (pos + size > data.length) {
        corrupt('truncated uncompressed chunk')
      }
      out.writeBytes(data.subarray(pos, pos + size))
      pos += size
      continue
    }

    if (control < 0x80) {
      corrupt(`invalid control byte 0x${control.toString(16)}`)
    }

    // LZMA chunk: bits 5-6 select what to reset.
    if (pos + 4 > data.length) {
      corrupt('truncated chunk header')
    }
    const unpacked = ((control & 0x1f) << 16) + (data[pos] << 8) + data[pos + 1] + 1
    const packed = ((data[pos + 2] << 8) | data[pos + 3]) + 1
    pos += 4
    const reset = (control >>> 5) & 3
    if (reset === 3) {
      lzma.resetDictionary()
      needDictReset = false
    } else if (needDictReset) {
      corrupt('missing dictionary reset')
    }
    if (reset >= 2) {
      if (pos >= data.length) {
        corrupt('truncated properties')
      }
      const properties = parseLzmaProperties(data[pos++])
      if (properties.lc + properties.lp > 4) {
        corrupt('lc + lp exceeds 4')
      }
      lzma.setProperties(properties)
      needProperties = false
    } else if (needProperties) {
      corrupt('missing properties')
    }
    if (reset >= 1) {
      lzma.resetState()
    }
    if (pos + packed > data.length) {
      corrupt('truncated compressed chunk')
    }
    const rc = new RangeDecoder(data, pos, pos + packed)
    lzma.decode(rc, out.length + unpacked, false)
    pos += packed
  }
}
