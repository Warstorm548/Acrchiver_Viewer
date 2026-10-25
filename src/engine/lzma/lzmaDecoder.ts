/*
 * LZMA decoder (the algorithm of Igor Pavlov's public-domain LZMA SDK). Structure follows the
 * xz-compat port (MIT, Kevin Malakoff — see THIRD-PARTY-NOTICES.md), rewritten for browsers:
 * Uint8Array instead of Node Buffer, unsigned range-coder arithmetic, the whole output used as the
 * dictionary, and matches that cross an LZMA2 chunk boundary carried over to the next chunk.
 */
import { ArchiveError } from '../types'
import { Output } from './output'
import { initProbs, RangeDecoder } from './rangeDecoder'

const STATES = 12
const POS_STATES_MAX = 16
const END_MARKER = 0xffffffff

const corrupt = (detail: string): never => {
  throw new ArchiveError('corrupt', `Invalid LZMA data: ${detail}`)
}

class LengthProbs {
  readonly choice = new Uint16Array(2)
  readonly low = new Uint16Array(POS_STATES_MAX << 3)
  readonly mid = new Uint16Array(POS_STATES_MAX << 3)
  readonly high = new Uint16Array(256)

  reset() {
    initProbs(this.choice)
    initProbs(this.low)
    initProbs(this.mid)
    initProbs(this.high)
  }

  /** Returns the match length minus 2. */
  decode(rc: RangeDecoder, posState: number): number {
    if (!rc.decodeBit(this.choice, 0)) {
      return rc.bitTree(this.low, posState << 3, 3)
    }
    if (!rc.decodeBit(this.choice, 1)) {
      return 8 + rc.bitTree(this.mid, posState << 3, 3)
    }
    return 16 + rc.bitTree(this.high, 0, 8)
  }
}

export interface LzmaProperties {
  lc: number
  lp: number
  pb: number
}

export const parseLzmaProperties = (byte: number): LzmaProperties => {
  if (byte >= 9 * 5 * 5) {
    corrupt('bad properties')
  }
  return { lc: byte % 9, lp: Math.floor(byte / 9) % 5, pb: Math.floor(byte / 45) }
}

export class LzmaDecoder {
  private lc = 0
  private lpMask = 0
  private pbMask = 0
  private literal = new Uint16Array(0x300)
  private readonly isMatch = new Uint16Array(STATES << 4)
  private readonly isRep = new Uint16Array(STATES)
  private readonly isRepG0 = new Uint16Array(STATES)
  private readonly isRepG1 = new Uint16Array(STATES)
  private readonly isRepG2 = new Uint16Array(STATES)
  private readonly isRep0Long = new Uint16Array(STATES << 4)
  private readonly posSlot = new Uint16Array(4 << 6)
  private readonly specPos = new Uint16Array(114)
  private readonly align = new Uint16Array(16)
  private readonly matchLen = new LengthProbs()
  private readonly repLen = new LengthProbs()

  private state = 0
  private rep0 = 0
  private rep1 = 0
  private rep2 = 0
  private rep3 = 0
  /** Output position where the current dictionary starts (matches can't reach before it). */
  private dictStart = 0
  /** Match bytes still to copy when the previous chunk ended inside a match. */
  private pendingLen = 0

  constructor(private readonly out: Output) {}

  setProperties({ lc, lp, pb }: LzmaProperties) {
    const size = 0x300 << (lc + lp)
    if (this.literal.length !== size) {
      this.literal = new Uint16Array(size)
    }
    this.lc = lc
    this.lpMask = (1 << lp) - 1
    this.pbMask = (1 << pb) - 1
  }

  resetState() {
    initProbs(this.literal)
    initProbs(this.isMatch)
    initProbs(this.isRep)
    initProbs(this.isRepG0)
    initProbs(this.isRepG1)
    initProbs(this.isRepG2)
    initProbs(this.isRep0Long)
    initProbs(this.posSlot)
    initProbs(this.specPos)
    initProbs(this.align)
    this.matchLen.reset()
    this.repLen.reset()
    this.state = 0
    this.rep0 = this.rep1 = this.rep2 = this.rep3 = 0
    this.pendingLen = 0
  }

  resetDictionary() {
    this.dictStart = this.out.length
    this.pendingLen = 0
  }

  /**
   * Decodes until the output reaches `limit` bytes (absolute length). Returns true if an end
   * marker was found first (only allowed when `allowEndMarker`).
   */
  decode(rc: RangeDecoder, limit: number, allowEndMarker: boolean): boolean {
    const out = this.out
    if (this.pendingLen > 0) {
      const count = Math.min(this.pendingLen, limit - out.length)
      out.copyMatch(this.rep0, count)
      this.pendingLen -= count
    }
    while (out.length < limit) {
      const pos = out.length - this.dictStart
      const posState = pos & this.pbMask
      let state = this.state

      if (!rc.decodeBit(this.isMatch, (state << 4) + posState)) {
        const prev = pos > 0 ? out.buffer[out.length - 1] : 0
        const base = 0x300 * (((pos & this.lpMask) << this.lc) + (prev >>> (8 - this.lc)))
        let symbol = 1
        if (state >= 7) {
          let matchByte = out.buffer[out.length - this.rep0 - 1]
          do {
            const matchBit = (matchByte >>> 7) & 1
            matchByte <<= 1
            const bit = rc.decodeBit(this.literal, base + ((1 + matchBit) << 8) + symbol)
            symbol = (symbol << 1) | bit
            if (matchBit !== bit) {
              break
            }
          } while (symbol < 0x100)
        }
        while (symbol < 0x100) {
          symbol = (symbol << 1) | rc.decodeBit(this.literal, base + symbol)
        }
        out.writeByte(symbol & 0xff)
        this.state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6
        continue
      }

      let len: number
      if (rc.decodeBit(this.isRep, state)) {
        if (pos === 0) {
          corrupt('repeated match before any data')
        }
        if (!rc.decodeBit(this.isRepG0, state)) {
          if (!rc.decodeBit(this.isRep0Long, (state << 4) + posState)) {
            this.state = state < 7 ? 9 : 11
            out.writeByte(out.buffer[out.length - this.rep0 - 1])
            continue
          }
        } else {
          let distance: number
          if (!rc.decodeBit(this.isRepG1, state)) {
            distance = this.rep1
          } else {
            if (!rc.decodeBit(this.isRepG2, state)) {
              distance = this.rep2
            } else {
              distance = this.rep3
              this.rep3 = this.rep2
            }
            this.rep2 = this.rep1
          }
          this.rep1 = this.rep0
          this.rep0 = distance
        }
        len = this.repLen.decode(rc, posState)
        state = state < 7 ? 8 : 11
      } else {
        this.rep3 = this.rep2
        this.rep2 = this.rep1
        this.rep1 = this.rep0
        len = this.matchLen.decode(rc, posState)
        state = state < 7 ? 7 : 10
        const slot = rc.bitTree(this.posSlot, (len < 4 ? len : 3) << 6, 6)
        if (slot < 4) {
          this.rep0 = slot
        } else {
          const directBits = (slot >>> 1) - 1
          let distance = (2 | (slot & 1)) * 2 ** directBits
          if (slot < 14) {
            distance += rc.reverseBitTree(this.specPos, distance - slot - 1, directBits)
          } else {
            distance += rc.decodeDirectBits(directBits - 4) * 16
            distance += rc.reverseBitTree(this.align, 0, 4)
          }
          this.rep0 = distance
        }
        if (this.rep0 === END_MARKER) {
          if (!allowEndMarker) {
            corrupt('unexpected end marker')
          }
          this.state = state
          return true
        }
      }
      this.state = state
      len += 2
      if (this.rep0 >= pos) {
        corrupt('match distance out of range')
      }
      const count = Math.min(len, limit - out.length)
      out.copyMatch(this.rep0, count)
      this.pendingLen = len - count
    }
    return false
  }
}
