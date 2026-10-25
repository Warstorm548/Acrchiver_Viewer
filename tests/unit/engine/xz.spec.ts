import { createHash } from 'node:crypto'
import { recordedSize, unxz } from '../../../src/engine/xz'
import { unlzma } from '../../../src/engine/lzmaAlone'
import { ArchiveError } from '../../../src/engine/types'
import { xzSamples } from './xzSamples'

const decode = (base64: string) => Uint8Array.from(Buffer.from(base64, 'base64'))
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const LIMIT = 10_000_000
const entries = Object.entries(xzSamples)
const xzEntries = entries.filter(([name]) => !name.startsWith('ALONE'))
const aloneEntries = entries.filter(([name]) => name.startsWith('ALONE'))

describe('unxz', () => {
  it.each(xzEntries)('decodes %s like liblzma', async (_name, sample) => {
    const result = await unxz(decode(sample.data), LIMIT)
    expect(result.length).toBe(sample.size)
    expect(sha256(result)).toBe(sample.sha256)
  })

  it.each(xzEntries)('reads the size of %s from its index', (_name, sample) => {
    expect(recordedSize(decode(sample.data))).toBe(sample.size)
  })

  it('ignores a size it cannot find', () => {
    expect(recordedSize(new Uint8Array([1, 2, 3]))).toBeUndefined()
  })

  it('stops when the output exceeds the limit', async () => {
    await expect(unxz(decode(xzSamples.ZEROS_1MB.data), 1000)).rejects.toMatchObject({
      code: 'too-large'
    })
  })

  it('detects damaged data through the integrity check', async () => {
    const data = decode(xzSamples.CHECK_CRC64.data)
    // flip a byte inside the compressed block (after the 12-byte stream and 12-byte block header)
    data[40] ^= 0x01
    await expect(unxz(data, LIMIT)).rejects.toBeInstanceOf(ArchiveError)
  })

  it('detects a damaged SHA-256 check', async () => {
    const data = decode(xzSamples.CHECK_SHA256.data)
    const checkStart = data.length - 12 - 8 - 32 // footer, index, then the 32-byte check
    data[checkStart] ^= 0xff
    await expect(unxz(data, LIMIT)).rejects.toThrow(/integrity check/)
  })

  it('detects a damaged stream header', async () => {
    const data = decode(xzSamples.PRESET6.data)
    data[7] ^= 0x01
    await expect(unxz(data, LIMIT)).rejects.toThrow(/header/)
  })

  it('detects truncated input', async () => {
    const data = decode(xzSamples.RANDOM.data)
    await expect(unxz(data.subarray(0, data.length / 2), LIMIT)).rejects.toBeInstanceOf(
      ArchiveError
    )
  })

  it('names unsupported filters', async () => {
    const data = decode(xzSamples.FILTER_X86.data)
    // block header starts at 12: [size][flags][filter id 0x04 → ARM64 0x0a]...; fix up its CRC32
    const headerSize = (data[12] + 1) * 4
    expect(data[14]).toBe(0x04)
    data[14] = 0x0a
    const { crc32 } = await import('../../../src/engine/lzma/checks')
    const crc = crc32(data, 12, 12 + headerSize - 4)
    new DataView(data.buffer, data.byteOffset).setUint32(12 + headerSize - 4, crc, true)
    await expect(unxz(data, LIMIT)).rejects.toMatchObject({
      code: 'unsupported-format',
      message: expect.stringContaining('ARM64')
    })
  })
})

describe('unlzma (legacy .lzma)', () => {
  it.each(aloneEntries)('decodes %s like liblzma', (_name, sample) => {
    const result = unlzma(decode(sample.data), LIMIT)
    expect(result.length).toBe(sample.size)
    expect(sha256(result)).toBe(sample.sha256)
  })

  it('rejects an invalid header', () => {
    expect(() => unlzma(new Uint8Array(13).fill(0xff), LIMIT)).toThrow(ArchiveError)
  })

  it('stops when the output exceeds the limit', () => {
    expect(() => unlzma(decode(xzSamples.ALONE.data), 1000)).toThrow(
      expect.objectContaining({ code: 'too-large' })
    )
  })
})
