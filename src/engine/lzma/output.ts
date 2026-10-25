import { GrowableBuffer } from '../buffer'

/**
 * Output buffer shared by the LZMA, LZMA2 and XZ decoders. The whole decompressed data is kept in
 * memory anyway, so the output itself serves as the LZMA dictionary window.
 */
export class Output extends GrowableBuffer {
  writeByte(byte: number) {
    if (this.length === this.buffer.length) {
      this.reserve(1)
    }
    this.buffer[this.length++] = byte
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
}
