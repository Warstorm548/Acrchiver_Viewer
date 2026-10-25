/*
 * Pure-JavaScript bzip2 decoder for browsers.
 *
 * Ported to TypeScript from seek-bzip 2.0.0 (lib/index.js, bitreader.js, crc32.js), MIT License:
 *   Copyright (c) 2013-2015 C. Scott Ananian, (c) 2012-2015 Eli Skeggs, (c) 2011 Kevin Kwok
 * which was adapted from bzip2.js (c) 2011 antimatter15, based on micro-bunzip by Rob Landley,
 * based on bzip2 by Julian R Seward. Full license text: THIRD-PARTY-NOTICES.md.
 *
 * Changes from the original: Node `Buffer` replaced by `Uint8Array`; reading past the end of the
 * input is an error; output size is capped (zip-bomb guard); errors are `ArchiveError`s;
 * random-access/seek and streaming APIs dropped.
 */
import { ArchiveError } from './types'

const MAX_HUFCODE_BITS = 20
const MAX_SYMBOLS = 258
const SYMBOL_RUNA = 0
const SYMBOL_RUNB = 1
const MIN_GROUPS = 2
const MAX_GROUPS = 6
const GROUP_SIZE = 50
const BLOCK_MAGIC = '314159265359'
const END_MAGIC = '177245385090'
const BITMASK = [0x00, 0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f, 0x7f, 0xff]

const corrupt = (detail: string): never => {
  throw new ArchiveError('corrupt', `Invalid bzip2 data: ${detail}`)
}

/** CRC-32 as used by bzip2 (MSB-first, polynomial 0x04c11db7). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i << 24
    for (let k = 0; k < 8; k++) {
      c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1
    }
    table[i] = c >>> 0
  }
  return table
})()

class Input {
  pos = 0
  constructor(readonly data: Uint8Array) {}

  readByte(): number {
    if (this.pos >= this.data.length) {
      corrupt('unexpected end of input')
    }
    return this.data[this.pos++]
  }

  eof(): boolean {
    return this.pos >= this.data.length
  }
}

class BitReader {
  private bitOffset = 0
  private curByte = 0
  private hasByte = false

  constructor(private readonly input: Input) {}

  read(bits: number): number {
    let result = 0
    while (bits > 0) {
      if (!this.hasByte) {
        this.curByte = this.input.readByte()
        this.hasByte = true
      }
      const remaining = 8 - this.bitOffset
      if (bits >= remaining) {
        result <<= remaining
        result |= BITMASK[remaining] & this.curByte
        this.hasByte = false
        this.bitOffset = 0
        bits -= remaining
      } else {
        result <<= bits
        const shift = remaining - bits
        result |= (this.curByte & (BITMASK[bits] << shift)) >> shift
        this.bitOffset += bits
        bits = 0
      }
    }
    return result
  }

  /** Reads 48 bits as 12 hex digits (block / end-of-stream magic). */
  magic(): string {
    let hex = ''
    for (let i = 0; i < 6; i++) {
      hex += this.read(8).toString(16).padStart(2, '0')
    }
    return hex
  }
}

class Output {
  buffer = new Uint8Array(1 << 16)
  length = 0
  constructor(private readonly maxSize: number) {}

  writeByte(byte: number) {
    if (this.length < this.buffer.length) {
      this.buffer[this.length++] = byte
    } else {
      this.writeRun(byte, 1)
    }
  }

  writeRun(byte: number, count: number) {
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
    this.buffer.fill(byte, this.length, needed)
    this.length = needed
  }

  result(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.length)
  }
}

interface HuffmanGroup {
  permute: Uint16Array
  limit: Uint32Array
  base: Uint32Array
  minLen: number
  maxLen: number
}

const moveToFront = (array: Uint8Array, index: number): number => {
  const value = array[index]
  for (let i = index; i > 0; i--) {
    array[i] = array[i - 1]
  }
  array[0] = value
  return value
}

/** Decodes one bzip2 stream starting at the input's current byte. */
const decodeStream = (input: Input, output: Output) => {
  if (input.data.length - input.pos < 4) {
    corrupt('bad magic')
  }
  const signature = String.fromCharCode(input.readByte(), input.readByte(), input.readByte())
  if (signature !== 'BZh') {
    corrupt('bad magic')
  }
  const level = input.readByte() - 0x30
  if (level < 1 || level > 9) {
    corrupt('block size out of range')
  }
  const reader = new BitReader(input)
  const blockSize = 100000 * level
  const dbuf = new Uint32Array(blockSize)
  let streamCRC = 0

  for (;;) {
    const magic = reader.magic()
    if (magic === END_MAGIC) {
      const storedCRC = reader.read(32) >>> 0
      if (storedCRC !== streamCRC) {
        corrupt('bad stream CRC')
      }
      return
    }
    if (magic !== BLOCK_MAGIC) {
      corrupt('bad block header')
    }
    const targetBlockCRC = reader.read(32) >>> 0
    streamCRC = (targetBlockCRC ^ ((streamCRC << 1) | (streamCRC >>> 31))) >>> 0
    if (reader.read(1)) {
      corrupt('randomised blocks (pre-0.9.5 format) are not supported')
    }
    const origPointer = reader.read(24)
    if (origPointer > blockSize) {
      corrupt('initial position out of bounds')
    }

    // Symbol map: which byte values occur in this block.
    let t = reader.read(16)
    const symToByte = new Uint8Array(256)
    let symTotal = 0
    for (let i = 0; i < 16; i++) {
      if (t & (1 << (0xf - i))) {
        const k = reader.read(16)
        for (let j = 0; j < 16; j++) {
          if (k & (1 << (0xf - j))) {
            symToByte[symTotal++] = i * 16 + j
          }
        }
      }
    }

    const groupCount = reader.read(3)
    if (groupCount < MIN_GROUPS || groupCount > MAX_GROUPS) {
      corrupt('bad Huffman group count')
    }
    const nSelectors = reader.read(15)
    if (nSelectors === 0) {
      corrupt('no selectors')
    }
    const mtfSymbol = new Uint8Array(256)
    for (let i = 0; i < groupCount; i++) {
      mtfSymbol[i] = i
    }
    const selectors = new Uint8Array(nSelectors)
    for (let i = 0; i < nSelectors; i++) {
      let j = 0
      for (; reader.read(1); j++) {
        if (j >= groupCount) {
          corrupt('bad selector')
        }
      }
      selectors[i] = moveToFront(mtfSymbol, j)
    }

    // Huffman tables, one per group, for symTotal literals plus RUNA and RUNB.
    let symCount = symTotal + 2
    const groups: HuffmanGroup[] = []
    for (let g = 0; g < groupCount; g++) {
      const length = new Uint8Array(symCount)
      const temp = new Uint16Array(MAX_HUFCODE_BITS + 1)
      t = reader.read(5)
      for (let i = 0; i < symCount; i++) {
        for (;;) {
          if (t < 1 || t > MAX_HUFCODE_BITS) {
            corrupt('bad Huffman code length')
          }
          if (!reader.read(1)) {
            break
          }
          t += reader.read(1) ? -1 : 1
        }
        length[i] = t
      }
      let minLen = length[0]
      let maxLen = length[0]
      for (let i = 1; i < symCount; i++) {
        if (length[i] > maxLen) {
          maxLen = length[i]
        } else if (length[i] < minLen) {
          minLen = length[i]
        }
      }
      const group: HuffmanGroup = {
        permute: new Uint16Array(MAX_SYMBOLS),
        limit: new Uint32Array(MAX_HUFCODE_BITS + 2),
        base: new Uint32Array(MAX_HUFCODE_BITS + 1),
        minLen,
        maxLen
      }
      groups.push(group)
      let pp = 0
      for (let i = minLen; i <= maxLen; i++) {
        temp[i] = group.limit[i] = 0
        for (let s = 0; s < symCount; s++) {
          if (length[s] === i) {
            group.permute[pp++] = s
          }
        }
      }
      for (let i = 0; i < symCount; i++) {
        temp[length[i]]++
      }
      pp = 0
      let counted = 0
      for (let i = minLen; i < maxLen; i++) {
        pp += temp[i]
        group.limit[i] = pp - 1
        pp <<= 1
        counted += temp[i]
        group.base[i + 1] = pp - counted
      }
      // Sentinel (same value seek-bzip effectively stores: Number.MAX_VALUE wraps to 0 in a Uint32Array).
      group.limit[maxLen + 1] = 0
      group.limit[maxLen] = pp + temp[maxLen] - 1
      group.base[minLen] = 0
    }

    // Huffman + run-length decode into dbuf.
    const byteCount = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      mtfSymbol[i] = i
    }
    let runPos = 0
    let runLength = 0
    let dbufCount = 0
    let selector = 0
    let group: HuffmanGroup = groups[0]
    symCount = 0
    for (;;) {
      if (!symCount--) {
        symCount = GROUP_SIZE - 1
        if (selector >= nSelectors) {
          corrupt('selector out of range')
        }
        group = groups[selectors[selector++]]
      }
      let bits = group.minLen
      let code = reader.read(bits)
      for (; ; bits++) {
        if (bits > group.maxLen) {
          corrupt('bad Huffman code')
        }
        if (code <= group.limit[bits]) {
          break
        }
        code = (code << 1) | reader.read(1)
      }
      code -= group.base[bits]
      if (code < 0 || code >= MAX_SYMBOLS) {
        corrupt('symbol out of range')
      }
      const nextSym = group.permute[code]
      if (nextSym === SYMBOL_RUNA || nextSym === SYMBOL_RUNB) {
        if (!runPos) {
          runPos = 1
          runLength = 0
        }
        runLength += nextSym === SYMBOL_RUNA ? runPos : 2 * runPos
        runPos <<= 1
        continue
      }
      if (runPos) {
        runPos = 0
        if (dbufCount + runLength > blockSize) {
          corrupt('run exceeds block size')
        }
        const byte = symToByte[mtfSymbol[0]]
        byteCount[byte] += runLength
        dbuf.fill(byte, dbufCount, dbufCount + runLength)
        dbufCount += runLength
      }
      if (nextSym > symTotal) {
        break
      }
      if (dbufCount >= blockSize) {
        corrupt('block overflow')
      }
      const byte = symToByte[moveToFront(mtfSymbol, nextSym - 1)]
      byteCount[byte]++
      dbuf[dbufCount++] = byte
    }

    // Undo the Burrows-Wheeler transform.
    if (origPointer < 0 || origPointer >= dbufCount) {
      corrupt('initial position out of bounds')
    }
    let total = 0
    for (let i = 0; i < 256; i++) {
      const next = total + byteCount[i]
      byteCount[i] = total
      total = next
    }
    for (let i = 0; i < dbufCount; i++) {
      const byte = dbuf[i] & 0xff
      dbuf[byteCount[byte]] |= i << 8
      byteCount[byte]++
    }

    // Write output, undoing the final run-length encoding, and check the block CRC.
    let crc = 0xffffffff
    let pos = dbuf[origPointer] >> 8
    let current = dbuf[origPointer] & 0xff
    let run = -1
    for (let remaining = dbufCount; remaining > 0; remaining--) {
      const previous = current
      pos = dbuf[pos]
      current = pos & 0xff
      pos >>= 8
      let copies: number
      let outByte: number
      if (run++ === 3) {
        copies = current
        outByte = previous
        current = -1
      } else {
        copies = 1
        outByte = current
      }
      for (let c = 0; c < copies; c++) {
        crc = (crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ outByte) & 0xff]
      }
      if (copies === 1) {
        output.writeByte(outByte)
      } else if (copies > 1) {
        output.writeRun(outByte, copies)
      }
      if (current !== previous) {
        run = 0
      }
    }
    if (~crc >>> 0 !== targetBlockCRC) {
      corrupt('bad block CRC')
    }
  }
}

const startsWithMagic = (data: Uint8Array, pos: number): boolean =>
  data[pos] === 0x42 && data[pos + 1] === 0x5a && data[pos + 2] === 0x68

/**
 * Decompresses bzip2 data (including concatenated multi-stream files, as written by pbzip2).
 * Throws `ArchiveError('too-large')` once the output would exceed `maxSize`.
 */
export const bunzip2 = (data: Uint8Array, maxSize: number): Uint8Array<ArrayBuffer> => {
  const input = new Input(data)
  const output = new Output(maxSize)
  decodeStream(input, output)
  // Further streams follow only in multi-stream files; like bzip2 itself, ignore trailing garbage.
  while (!input.eof() && startsWithMagic(data, input.pos)) {
    decodeStream(input, output)
  }
  return output.result()
}
