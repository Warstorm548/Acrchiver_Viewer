/*
 * XZ container decoder, written from "The .xz File Format" specification (version 1.x):
 * stream header/footer, blocks with filter chains, integrity checks, index, stream padding and
 * concatenated streams. Compressed data is LZMA2; preprocessing filters are applied afterwards.
 */
import { bcjArm, bcjArmThumb, bcjIa64, bcjPowerPc, bcjSparc, bcjX86, delta } from './lzma/filters'
import { bytesEqual, crc32, crc64, sha256 } from './lzma/checks'
import { decodeLzma2 } from './lzma/lzma2'
import { Output } from './lzma/output'
import { ArchiveError } from './types'

const HEADER_MAGIC = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]
const FOOTER_MAGIC = [0x59, 0x5a]
const CHECK_SIZES = [0, 4, 4, 4, 8, 8, 8, 16, 16, 16, 32, 32, 32, 64, 64, 64]
const CHECK_CRC32 = 1
const CHECK_CRC64 = 4
const CHECK_SHA256 = 10
const FILTER_LZMA2 = 0x21
const FILTER_DELTA = 0x03

type FilterFn = (buffer: Uint8Array, start: number) => void
const BCJ_FILTERS: Record<number, FilterFn> = {
  0x04: bcjX86,
  0x05: bcjPowerPc,
  0x06: bcjIa64,
  0x07: bcjArm,
  0x08: bcjArmThumb,
  0x09: bcjSparc
}
const UNSUPPORTED_FILTERS: Record<number, string> = { 0x0a: 'ARM64', 0x0b: 'RISC-V' }

interface Filter {
  id: number
  properties: Uint8Array
}

const corrupt = (detail: string): never => {
  throw new ArchiveError('corrupt', `Invalid xz data: ${detail}`)
}

const matches = (data: Uint8Array, pos: number, magic: number[]) =>
  magic.every((byte, i) => data[pos + i] === byte)

const readUint32 = (data: Uint8Array, pos: number) =>
  (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0

/** Reads an xz variable-length integer (7 bits per byte, up to 9 bytes); values beyond 2^53 are rejected. */
const readVarInt = (data: Uint8Array, cursor: { pos: number }, end: number): number => {
  let value = 0
  for (let i = 0; i < 9; i++) {
    if (cursor.pos >= end) {
      corrupt('truncated integer')
    }
    const byte = data[cursor.pos++]
    value += (byte & 0x7f) * 2 ** (7 * i)
    if (!(byte & 0x80)) {
      if (i > 0 && byte === 0) {
        corrupt('non-minimal integer encoding')
      }
      if (value > Number.MAX_SAFE_INTEGER) {
        corrupt('integer too large')
      }
      return value
    }
  }
  return corrupt('integer too long')
}

const verifyCheck = async (type: number, stored: Uint8Array, data: Uint8Array<ArrayBuffer>) => {
  let actual: Uint8Array | null = null
  if (type === CHECK_CRC32) {
    const value = crc32(data)
    actual = new Uint8Array([
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      value >>> 24
    ])
  } else if (type === CHECK_CRC64) {
    actual = crc64(data)
  } else if (type === CHECK_SHA256) {
    actual = await sha256(data)
  }
  // Other (reserved) check types can't be verified; like xz, the data is still decoded.
  if (actual && !bytesEqual(actual, stored)) {
    corrupt('integrity check failed')
  }
}

const parseBlockHeader = (data: Uint8Array, pos: number) => {
  const headerSize = (data[pos] + 1) * 4
  const end = pos + headerSize
  if (end > data.length) {
    corrupt('truncated block header')
  }
  if (crc32(data, pos, end - 4) !== readUint32(data, end - 4)) {
    corrupt('block header CRC mismatch')
  }
  const flags = data[pos + 1]
  if (flags & 0x3c) {
    corrupt('unsupported block flags')
  }
  const cursor = { pos: pos + 2 }
  const compressedSize = flags & 0x40 ? readVarInt(data, cursor, end - 4) : null
  const uncompressedSize = flags & 0x80 ? readVarInt(data, cursor, end - 4) : null
  const filters: Filter[] = []
  for (let i = 0; i <= (flags & 3); i++) {
    const id = readVarInt(data, cursor, end - 4)
    const propertiesSize = readVarInt(data, cursor, end - 4)
    if (cursor.pos + propertiesSize > end - 4) {
      corrupt('truncated filter properties')
    }
    filters.push({ id, properties: data.subarray(cursor.pos, cursor.pos + propertiesSize) })
    cursor.pos += propertiesSize
  }
  for (let i = cursor.pos; i < end - 4; i++) {
    if (data[i] !== 0) {
      corrupt('non-zero block header padding')
    }
  }
  return { end, compressedSize, uncompressedSize, filters }
}

/** Validates the filter chain and returns the preprocessing filters to undo, in decode order. */
const preprocessingFilters = (filters: Filter[]): ((buffer: Uint8Array) => void)[] => {
  const last = filters[filters.length - 1]
  if (last.id !== FILTER_LZMA2) {
    throw new ArchiveError(
      'unsupported-format',
      `Unsupported xz compression filter 0x${last.id.toString(16)}`
    )
  }
  return filters
    .slice(0, -1)
    .reverse()
    .map(({ id, properties }) => {
      if (id === FILTER_DELTA) {
        if (properties.length !== 1) {
          corrupt('bad delta properties')
        }
        const distance = properties[0] + 1
        return (buffer: Uint8Array) => delta(buffer, distance)
      }
      const bcj = BCJ_FILTERS[id]
      if (bcj) {
        if (properties.length !== 0 && properties.length !== 4) {
          corrupt('bad BCJ properties')
        }
        const start = properties.length === 4 ? readUint32(properties, 0) : 0
        return (buffer: Uint8Array) => bcj(buffer, start)
      }
      const name = UNSUPPORTED_FILTERS[id] ?? `0x${id.toString(16)}`
      throw new ArchiveError('unsupported-format', `Unsupported xz filter: ${name}`)
    })
}

/** Decodes one xz stream starting at `pos`; returns the position after its footer. */
const decodeStream = async (data: Uint8Array, pos: number, out: Output): Promise<number> => {
  const streamStart = pos
  if (pos + 12 > data.length || !matches(data, pos, HEADER_MAGIC)) {
    corrupt('bad stream header')
  }
  if (crc32(data, pos + 6, pos + 8) !== readUint32(data, pos + 8)) {
    corrupt('stream header CRC mismatch')
  }
  if (data[pos + 6] !== 0 || data[pos + 7] & 0xf0) {
    corrupt('unsupported stream flags')
  }
  const checkType = data[pos + 7]
  const checkSize = CHECK_SIZES[checkType]
  pos += 12

  const blocks: { unpadded: number; uncompressed: number }[] = []
  while (data[pos] !== 0x00) {
    if (pos >= data.length) {
      corrupt('unexpected end of input')
    }
    const blockStart = pos
    const header = parseBlockHeader(data, pos)
    const undo = preprocessingFilters(header.filters)
    const outStart = out.length
    pos = decodeLzma2(data, header.end, out)
    const compressed = pos - header.end
    const uncompressed = out.length - outStart
    if (header.compressedSize !== null && header.compressedSize !== compressed) {
      corrupt('compressed size mismatch')
    }
    if (header.uncompressedSize !== null && header.uncompressedSize !== uncompressed) {
      corrupt('uncompressed size mismatch')
    }
    const blockData = out.buffer.subarray(outStart, out.length)
    undo.forEach((filter) => filter(blockData))
    const unpadded = pos - blockStart
    while ((pos - streamStart) % 4 !== 0) {
      if (data[pos++] !== 0) {
        corrupt('non-zero block padding')
      }
    }
    if (pos + checkSize > data.length) {
      corrupt('truncated check')
    }
    await verifyCheck(checkType, data.subarray(pos, pos + checkSize), blockData.slice())
    pos += checkSize
    blocks.push({ unpadded: unpadded + checkSize, uncompressed })
  }

  // Index: must list exactly the blocks we decoded.
  const indexStart = pos
  const cursor = { pos: pos + 1 }
  const count = readVarInt(data, cursor, data.length)
  if (count !== blocks.length) {
    corrupt('index does not match blocks')
  }
  for (const block of blocks) {
    const unpadded = readVarInt(data, cursor, data.length)
    const uncompressed = readVarInt(data, cursor, data.length)
    if (unpadded !== block.unpadded || uncompressed !== block.uncompressed) {
      corrupt('index does not match blocks')
    }
  }
  pos = cursor.pos
  while ((pos - indexStart) % 4 !== 0) {
    if (data[pos++] !== 0) {
      corrupt('non-zero index padding')
    }
  }
  if (pos + 4 > data.length || crc32(data, indexStart, pos) !== readUint32(data, pos)) {
    corrupt('index CRC mismatch')
  }
  pos += 4

  // Footer: CRC32, backward size, flags (same as the header's), "YZ".
  if (pos + 12 > data.length || !matches(data, pos + 10, FOOTER_MAGIC)) {
    corrupt('bad stream footer')
  }
  if (crc32(data, pos + 4, pos + 10) !== readUint32(data, pos)) {
    corrupt('stream footer CRC mismatch')
  }
  if ((readUint32(data, pos + 4) + 1) * 4 !== pos - indexStart) {
    corrupt('backward size mismatch')
  }
  if (data[pos + 8] !== data[streamStart + 6] || data[pos + 9] !== data[streamStart + 7]) {
    corrupt('stream flags mismatch')
  }
  return pos + 12
}

/**
 * Total decompressed size recorded in the streams' indexes, read backwards from the end of the
 * file; undefined when the layout looks wrong. Only sizes the output buffer up front: every index
 * is checked again while decoding.
 */
export const recordedSize = (data: Uint8Array): number | undefined => {
  let end = data.length
  let total = 0
  try {
    while (end > 0) {
      while (end >= 4 && readUint32(data, end - 4) === 0) {
        end -= 4
      }
      if (end < 24 || !matches(data, end - 2, FOOTER_MAGIC)) {
        return undefined
      }
      const footer = end - 12
      const indexStart = footer - (readUint32(data, footer + 4) + 1) * 4
      if (indexStart < 12 || data[indexStart] !== 0) {
        return undefined
      }
      const cursor = { pos: indexStart + 1 }
      const count = readVarInt(data, cursor, footer)
      let blocksSize = 0
      for (let i = 0; i < count; i++) {
        blocksSize += Math.ceil(readVarInt(data, cursor, footer) / 4) * 4
        total += readVarInt(data, cursor, footer)
      }
      end = indexStart - blocksSize - 12
      if (end < 0 || !matches(data, end, HEADER_MAGIC)) {
        return undefined
      }
    }
    return total
  } catch {
    return undefined
  }
}

/**
 * Decompresses .xz data (one or more concatenated streams, with optional stream padding).
 * Throws `ArchiveError('too-large')` once the output would exceed `maxSize`.
 */
export const unxz = async (data: Uint8Array, maxSize: number): Promise<Uint8Array<ArrayBuffer>> => {
  const out = new Output(maxSize, recordedSize(data))
  let pos = await decodeStream(data, 0, out)
  while (pos < data.length) {
    // Stream padding: groups of four zero bytes, then possibly another stream.
    if (data[pos] === 0) {
      if (pos + 4 > data.length || readUint32(data, pos) !== 0) {
        corrupt('bad stream padding')
      }
      pos += 4
      continue
    }
    pos = await decodeStream(data, pos, out)
  }
  return out.result()
}
