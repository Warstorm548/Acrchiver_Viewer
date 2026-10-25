// Generated archives for the limit tests: one tar member of zeros, written as a stream.
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

const BLOCK = 512
const MiB = 1024 * 1024

/** ustar header for one regular file. */
const tarHeader = (name: string, size: number): Buffer => {
  const header = Buffer.alloc(BLOCK)
  const field = (value: string, offset: number, length: number) =>
    header.write(value, offset, length, 'ascii')
  const octal = (value: number, length: number) => value.toString(8).padStart(length - 1, '0')
  field(name, 0, 100)
  field(octal(0o644, 8), 100, 8)
  field(octal(0, 8), 108, 8)
  field(octal(0, 8), 116, 8)
  field(octal(size, 12), 124, 12)
  field(octal(1_700_000_000, 12), 136, 12)
  header.fill(' ', 148, 156)
  field('0', 156, 1)
  field('ustar', 257, 6)
  field('00', 263, 2)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  field(octal(checksum, 7) + '\0', 148, 8)
  return header
}

function* tarOfZeros(member: string, size: number) {
  yield tarHeader(member, size)
  const chunk = Buffer.alloc(MiB)
  for (let left = size; left > 0; left -= MiB) {
    yield left >= MiB ? chunk : chunk.subarray(0, left)
  }
  const padding = (BLOCK - (size % BLOCK)) % BLOCK
  yield Buffer.alloc(padding + 2 * BLOCK)
}

/** A tar holding `size` bytes of zeros; gzipped when `gzip` is set. */
export const writeZeroTar = async (path: string, size: number, gzip = false) => {
  const source = Readable.from(tarOfZeros('zeros.bin', size))
  if (gzip) {
    await pipeline(source, createGzip({ level: 1 }), createWriteStream(path))
  } else {
    await pipeline(source, createWriteStream(path))
  }
}
