import { blobFromBytes } from './buffer'
import { mimeTypeFor } from './fileTypes'
import { normalizePath } from './tree'
import { ArchiveEntry, ArchiveError, ArchiveFormat, ArchiveHandle } from './types'

const BLOCK = 512
const decoder = new TextDecoder()

/** Decodes a copy: the archive data may be a view of a resizable buffer, which TextDecoder rejects. */
const decode = (bytes: Uint8Array): string => decoder.decode(bytes.slice())

const readString = (bytes: Uint8Array, offset: number, length: number): string => {
  let end = offset
  while (end < offset + length && bytes[end] !== 0) {
    end++
  }
  return decode(bytes.subarray(offset, end))
}

/** Numeric header field: octal text, or GNU base-256 binary when the high bit is set. */
const readNumber = (bytes: Uint8Array, offset: number, length: number): number => {
  if (bytes[offset] & 0x80) {
    let value = bytes[offset] & 0x7f
    for (let i = 1; i < length; i++) {
      value = value * 256 + bytes[offset + i]
    }
    return value
  }
  const text = readString(bytes, offset, length).trim()
  return text ? parseInt(text, 8) : 0
}

const isZeroBlock = (header: Uint8Array): boolean => header.every((byte) => byte === 0)

const checksumMatches = (header: Uint8Array): boolean => {
  let sum = 0
  for (let i = 0; i < BLOCK; i++) {
    // the checksum field itself counts as spaces
    sum += i >= 148 && i < 156 ? 0x20 : header[i]
  }
  return sum === readNumber(header, 148, 8)
}

/** Parses pax extended header records: "<length> <key>=<value>\n". */
const parsePax = (data: Uint8Array): Record<string, string> => {
  const records: Record<string, string> = {}
  let position = 0
  while (position < data.length) {
    const space = data.indexOf(0x20, position)
    if (space === -1) {
      break
    }
    const length = parseInt(decode(data.subarray(position, space)), 10)
    if (!length || length < 1) {
      break
    }
    const record = decode(data.subarray(space + 1, position + length - 1))
    const equals = record.indexOf('=')
    if (equals > 0) {
      records[record.slice(0, equals)] = record.slice(equals + 1)
    }
    position += length
  }
  return records
}

interface DataRange {
  start: number
  end: number
}

/** Reads an uncompressed tar archive (ustar, pax and GNU long names). */
export const openTar = (
  data: Uint8Array<ArrayBuffer>,
  format: ArchiveFormat = 'tar'
): ArchiveHandle => {
  const entries: ArchiveEntry[] = []
  // by entry (exact member) and by path (last member wins, like the folder index)
  const ranges = new Map<ArchiveEntry, DataRange>()
  const rangesByPath = new Map<string, DataRange>()
  let pendingName: string | null = null
  let pendingPax: Record<string, string> = {}
  let offset = 0

  while (offset + BLOCK <= data.length) {
    const header = data.subarray(offset, offset + BLOCK)
    if (isZeroBlock(header)) {
      break
    }
    if (!checksumMatches(header)) {
      throw new ArchiveError('corrupt', `Invalid tar header at byte ${offset}`)
    }

    const type = String.fromCharCode(header[156] || 0x30)
    const size = pendingPax.size ? Number(pendingPax.size) : readNumber(header, 124, 12)
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new ArchiveError('corrupt', `Invalid tar entry size at byte ${offset}`)
    }
    const start = offset + BLOCK
    const end = start + size
    if (end > data.length) {
      throw new ArchiveError('corrupt', 'Tar archive is truncated')
    }
    offset = start + Math.ceil(size / BLOCK) * BLOCK

    if (type === 'L') {
      pendingName = readString(data, start, size)
      continue
    }
    if (type === 'x') {
      pendingPax = { ...pendingPax, ...parsePax(data.subarray(start, end)) }
      continue
    }
    if (type === 'g' || type === 'K') {
      continue
    }

    const magic = readString(header, 257, 6)
    const prefix = magic.startsWith('ustar') ? readString(header, 345, 155) : ''
    const headerName = readString(header, 0, 100)
    const rawName =
      pendingPax.path ?? pendingName ?? (prefix ? `${prefix}/${headerName}` : headerName)
    const mtime = pendingPax.mtime ? parseFloat(pendingPax.mtime) : readNumber(header, 136, 12)
    pendingName = null
    pendingPax = {}

    const path = normalizePath(rawName)
    if (!path) {
      continue
    }
    const isDirectory = type === '5' || rawName.endsWith('/')
    const isFile = type === '0' || type === '7'
    const entry: ArchiveEntry = {
      path,
      name: path.slice(path.lastIndexOf('/') + 1),
      isDirectory,
      size: isFile ? size : 0,
      modified: mtime ? new Date(mtime * 1000) : undefined,
      supported: isDirectory || isFile
    }
    entries.push(entry)
    if (isFile) {
      ranges.set(entry, { start, end })
      rangesByPath.set(path, { start, end })
    }
  }

  return {
    format,
    entries,
    read: (entry) => {
      const range = ranges.get(entry) ?? rangesByPath.get(entry.path)
      if (!range) {
        return Promise.reject(new ArchiveError('unreadable-entry', `Cannot read "${entry.path}"`))
      }
      return Promise.resolve(
        blobFromBytes(data.subarray(range.start, range.end), mimeTypeFor(entry.name))
      )
    },
    close: () => Promise.resolve()
  }
}
