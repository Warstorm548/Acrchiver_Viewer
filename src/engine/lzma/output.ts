import { ArchiveError } from '../types'

/**
 * Growable output buffer shared by the LZMA, LZMA2 and XZ decoders. The whole decompressed data
 * is kept in memory anyway, so the output itself serves as the LZMA dictionary window.
 */
export class Output {
  buffer = new Uint8Array(1 << 16)
  length = 0

  constructor(private readonly maxSize: number) {}

  /** Makes room for `count` more bytes. */
  reserve(count: number) {
    const needed = this.length + count
    if (needed > this.maxSize) {
      throw new ArchiveError('too-large', `Decompressed size exceeds ${this.maxSize} bytes`)
    }
    if (needed > this.buffer.length) {
      let size = this.buffer.length * 2
      while (size < needed) {
        size *= 2
      }
      const grown = new Uint8Array(Math.min(size, Math.max(needed, this.maxSize)))
      grown.set(this.buffer.subarray(0, this.length))
      this.buffer = grown
    }
  }

  writeByte(byte: number) {
    if (this.length === this.buffer.length) {
      this.reserve(1)
    }
    this.buffer[this.length++] = byte
  }

  writeBytes(bytes: Uint8Array) {
    this.reserve(bytes.length)
    this.buffer.set(bytes, this.length)
    this.length += bytes.length
  }

  /** Appends `count` bytes copied from `distance + 1` bytes back (may overlap). */
  copyMatch(distance: number, count: number) {
    this.reserve(count)
    const buffer = this.buffer
    let from = this.length - distance - 1
    let to = this.length
    for (let i = 0; i < count; i++) {
      buffer[to++] = buffer[from++]
    }
    this.length = to
  }

  result(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.length)
  }
}
