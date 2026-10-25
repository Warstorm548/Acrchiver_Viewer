import { ArchiveError } from '../types'

const PROB_INIT = 1024
const TOP = 1 << 24

/**
 * LZMA range decoder. All state is kept as unsigned 32-bit values in plain numbers (no signed
 * tricks), so comparisons and shifts are exact.
 */
export class RangeDecoder {
  private range = 0xffffffff
  private code = 0
  pos: number

  constructor(
    private readonly data: Uint8Array,
    start: number,
    private readonly end: number
  ) {
    this.pos = start
    if (this.nextByte() !== 0) {
      throw new ArchiveError('corrupt', 'Invalid LZMA data: bad range coder start')
    }
    for (let i = 0; i < 4; i++) {
      this.code = ((this.code << 8) | this.nextByte()) >>> 0
    }
  }

  private nextByte(): number {
    if (this.pos >= this.end) {
      throw new ArchiveError('corrupt', 'Invalid LZMA data: unexpected end of input')
    }
    return this.data[this.pos++]
  }

  private normalize() {
    if (this.range < TOP) {
      this.range = (this.range << 8) >>> 0
      this.code = ((this.code << 8) | this.nextByte()) >>> 0
    }
  }

  decodeBit(probs: Uint16Array, index: number): number {
    const prob = probs[index]
    const bound = (this.range >>> 11) * prob
    let bit: number
    if (this.code < bound) {
      this.range = bound
      probs[index] = prob + ((2048 - prob) >>> 5)
      bit = 0
    } else {
      this.range -= bound
      this.code -= bound
      probs[index] = prob - (prob >>> 5)
      bit = 1
    }
    this.normalize()
    return bit
  }

  decodeDirectBits(count: number): number {
    let result = 0
    for (let i = 0; i < count; i++) {
      this.range = this.range >>> 1
      let bit = 0
      if (this.code >= this.range) {
        this.code -= this.range
        bit = 1
      }
      result = result * 2 + bit
      this.normalize()
    }
    return result
  }

  /** Decodes `bits` bits MSB-first through a probability tree starting at `offset`. */
  bitTree(probs: Uint16Array, offset: number, bits: number): number {
    let m = 1
    for (let i = 0; i < bits; i++) {
      m = (m << 1) | this.decodeBit(probs, offset + m)
    }
    return m - (1 << bits)
  }

  /** Decodes `bits` bits LSB-first through a probability tree starting at `offset`. */
  reverseBitTree(probs: Uint16Array, offset: number, bits: number): number {
    let m = 1
    let symbol = 0
    for (let i = 0; i < bits; i++) {
      const bit = this.decodeBit(probs, offset + m)
      m = (m << 1) | bit
      symbol |= bit << i
    }
    return symbol
  }

  /** True when the decoder has finished cleanly (code 0 means no trailing garbage bits). */
  isFinishedOK(): boolean {
    return this.code === 0
  }
}

export const initProbs = (probs: Uint16Array) => probs.fill(PROB_INIT)
