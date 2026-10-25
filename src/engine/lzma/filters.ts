/*
 * XZ preprocessing filters, decode direction. Logic follows liblzma's simple filters
 * (src/liblzma/simple/*.c and delta, public domain / 0BSD). Each function works in place on the
 * decompressed data of one XZ block; `start` is the optional start offset from the filter
 * properties. All 32-bit address arithmetic wraps like C's uint32_t (`>>> 0`).
 */

const isX86MSByte = (b: number) => b === 0x00 || b === 0xff

const X86_ALLOWED_STATUS = [true, true, true, false, true, false, false, false]
const X86_BIT_NUMBER = [0, 1, 2, 2, 3, 3, 3, 3]

export const bcjX86 = (buffer: Uint8Array, start = 0) => {
  if (buffer.length < 5) {
    return
  }
  let prevMask = 0
  let prevPos = (start - 5) >>> 0
  const limit = buffer.length - 5
  let i = 0
  while (i <= limit) {
    let b = buffer[i]
    if (b !== 0xe8 && b !== 0xe9) {
      i++
      continue
    }
    const now = (start + i) >>> 0
    const offset = (now - prevPos) >>> 0
    prevPos = now
    if (offset > 5) {
      prevMask = 0
    } else {
      for (let k = 0; k < offset; k++) {
        prevMask = ((prevMask & 0x77) << 1) >>> 0
      }
    }
    b = buffer[i + 4]
    if (isX86MSByte(b) && X86_ALLOWED_STATUS[(prevMask >>> 1) & 7] && prevMask >>> 1 < 0x10) {
      let src = ((b << 24) | (buffer[i + 3] << 16) | (buffer[i + 2] << 8) | buffer[i + 1]) >>> 0
      let dest: number
      for (;;) {
        dest = (src - (now + 5)) >>> 0
        if (prevMask === 0) {
          break
        }
        const bit = X86_BIT_NUMBER[prevMask >>> 1]
        b = (dest >>> (24 - bit * 8)) & 0xff
        if (!isX86MSByte(b)) {
          break
        }
        src = (dest ^ (2 ** (32 - bit * 8) - 1)) >>> 0
      }
      buffer[i + 4] = ~(((dest >>> 24) & 1) - 1) & 0xff
      buffer[i + 3] = (dest >>> 16) & 0xff
      buffer[i + 2] = (dest >>> 8) & 0xff
      buffer[i + 1] = dest & 0xff
      i += 5
      prevMask = 0
    } else {
      i++
      prevMask |= 1
      if (isX86MSByte(b)) {
        prevMask |= 0x10
      }
    }
  }
}

export const bcjArm = (buffer: Uint8Array, start = 0) => {
  for (let i = 0; i + 4 <= buffer.length; i += 4) {
    if (buffer[i + 3] === 0xeb) {
      const src = ((buffer[i + 2] << 16) | (buffer[i + 1] << 8) | buffer[i]) << 2
      const dest = ((src - (start + i + 8)) >>> 0) >>> 2
      buffer[i + 2] = (dest >>> 16) & 0xff
      buffer[i + 1] = (dest >>> 8) & 0xff
      buffer[i] = dest & 0xff
    }
  }
}

export const bcjArmThumb = (buffer: Uint8Array, start = 0) => {
  for (let i = 0; i + 4 <= buffer.length; i += 2) {
    if ((buffer[i + 1] & 0xf8) === 0xf0 && (buffer[i + 3] & 0xf8) === 0xf8) {
      const src =
        (((buffer[i + 1] & 7) << 19) |
          (buffer[i] << 11) |
          ((buffer[i + 3] & 7) << 8) |
          buffer[i + 2]) <<
        1
      const dest = ((src - (start + i + 4)) >>> 0) >>> 1
      buffer[i + 1] = 0xf0 | ((dest >>> 19) & 7)
      buffer[i] = (dest >>> 11) & 0xff
      buffer[i + 3] = 0xf8 | ((dest >>> 8) & 7)
      buffer[i + 2] = dest & 0xff
      i += 2
    }
  }
}

export const bcjPowerPc = (buffer: Uint8Array, start = 0) => {
  for (let i = 0; i + 4 <= buffer.length; i += 4) {
    if (buffer[i] >>> 2 === 0x12 && (buffer[i + 3] & 3) === 1) {
      const src =
        (((buffer[i] & 3) << 24) |
          (buffer[i + 1] << 16) |
          (buffer[i + 2] << 8) |
          (buffer[i + 3] & ~3)) >>>
        0
      const dest = (src - (start + i)) >>> 0
      buffer[i] = 0x48 | ((dest >>> 24) & 3)
      buffer[i + 1] = (dest >>> 16) & 0xff
      buffer[i + 2] = (dest >>> 8) & 0xff
      // like liblzma: keep the AA/LK bits and OR in the low byte of dest
      buffer[i + 3] = (buffer[i + 3] & 3) | (dest & 0xff)
    }
  }
}

export const bcjSparc = (buffer: Uint8Array, start = 0) => {
  for (let i = 0; i + 4 <= buffer.length; i += 4) {
    if (
      (buffer[i] === 0x40 && (buffer[i + 1] & 0xc0) === 0x00) ||
      (buffer[i] === 0x7f && (buffer[i + 1] & 0xc0) === 0xc0)
    ) {
      const src =
        (((buffer[i] << 24) | (buffer[i + 1] << 16) | (buffer[i + 2] << 8) | buffer[i + 3]) <<
          2) >>>
        0
      let dest = ((src - (start + i)) >>> 0) >>> 2
      dest =
        ((((0 - ((dest >>> 22) & 1)) << 22) & 0x3fffffff) | (dest & 0x3fffff) | 0x40000000) >>> 0
      buffer[i] = (dest >>> 24) & 0xff
      buffer[i + 1] = (dest >>> 16) & 0xff
      buffer[i + 2] = (dest >>> 8) & 0xff
      buffer[i + 3] = dest & 0xff
    }
  }
}

const IA64_BRANCH_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 6, 6, 0, 0, 7, 7, 4, 4, 0, 0, 4, 4, 0, 0
]

/** IA-64 instructions are 41 bits wide, so this filter uses BigInt (it is rarely used). */
export const bcjIa64 = (buffer: Uint8Array, start = 0) => {
  for (let i = 0; i + 16 <= buffer.length; i += 16) {
    const mask = IA64_BRANCH_TABLE[buffer[i] & 0x1f]
    for (let slot = 0, bitPos = 5; slot < 3; slot++, bitPos += 41) {
      if (((mask >>> slot) & 1) === 0) {
        continue
      }
      const bytePos = bitPos >>> 3
      const bitRes = BigInt(bitPos & 7)
      let instruction = 0n
      for (let j = 0; j < 6; j++) {
        instruction |= BigInt(buffer[i + j + bytePos]) << BigInt(8 * j)
      }
      let normalized = instruction >> bitRes
      if (((normalized >> 37n) & 0xfn) === 0x5n && ((normalized >> 9n) & 0x7n) === 0n) {
        let src = Number((normalized >> 13n) & 0xfffffn)
        src |= Number((normalized >> 36n) & 1n) << 20
        src = (src << 4) >>> 0
        const dest = ((src - (start + i)) >>> 0) >>> 4
        normalized &= ~(0x8fffffn << 13n)
        normalized |= BigInt(dest & 0xfffff) << 13n
        normalized |= BigInt(dest & 0x100000) << 16n
        instruction &= (1n << bitRes) - 1n
        instruction |= normalized << bitRes
        for (let j = 0; j < 6; j++) {
          buffer[i + j + bytePos] = Number((instruction >> BigInt(8 * j)) & 0xffn)
        }
      }
    }
  }
}

/** Delta filter: each byte is stored as the difference to the byte `distance` positions back. */
export const delta = (buffer: Uint8Array, distance: number) => {
  for (let i = distance; i < buffer.length; i++) {
    buffer[i] = (buffer[i] + buffer[i - distance]) & 0xff
  }
}
