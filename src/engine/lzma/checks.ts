// Integrity checks used by the XZ container: CRC32, CRC64 (ECMA-182, as in xz) and SHA-256.

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

export const crc32 = (data: Uint8Array, start = 0, end = data.length): number => {
  let crc = 0xffffffff
  for (let i = start; i < end; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// CRC64 with the reflected ECMA-182 polynomial 0xC96C5795D7870F42, computed on two 32-bit halves.
const CRC64_POLY_HI = 0xc96c5795
const CRC64_POLY_LO = 0xd7870f42
const [CRC64_HI, CRC64_LO] = (() => {
  const hiTable = new Uint32Array(256)
  const loTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let hi = 0
    let lo = i
    for (let k = 0; k < 8; k++) {
      const lsb = lo & 1
      lo = ((lo >>> 1) | ((hi & 1) << 31)) >>> 0
      hi = hi >>> 1
      if (lsb) {
        lo = (lo ^ CRC64_POLY_LO) >>> 0
        hi = (hi ^ CRC64_POLY_HI) >>> 0
      }
    }
    hiTable[i] = hi
    loTable[i] = lo
  }
  return [hiTable, loTable]
})()

/** Returns the CRC64 as 8 little-endian bytes (the order xz stores it in). */
export const crc64 = (data: Uint8Array): Uint8Array => {
  let hi = 0xffffffff
  let lo = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    const index = (lo ^ data[i]) & 0xff
    lo = (((lo >>> 8) | ((hi & 0xff) << 24)) ^ CRC64_LO[index]) >>> 0
    hi = ((hi >>> 8) ^ CRC64_HI[index]) >>> 0
  }
  hi = ~hi >>> 0
  lo = ~lo >>> 0
  const bytes = new Uint8Array(8)
  for (let i = 0; i < 4; i++) {
    bytes[i] = (lo >>> (8 * i)) & 0xff
    bytes[i + 4] = (hi >>> (8 * i)) & 0xff
  }
  return bytes
}

export const sha256 = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data))

export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i])
