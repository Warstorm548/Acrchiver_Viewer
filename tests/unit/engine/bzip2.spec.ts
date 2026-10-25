import { createHash } from 'node:crypto'
import { bunzip2 } from '../../../src/engine/bzip2'
import { ArchiveError } from '../../../src/engine/types'
import { bzip2Samples, TEXT } from './bzip2Samples'

const decode = (base64: string) => Uint8Array.from(Buffer.from(base64, 'base64'))
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const LIMIT = 10_000_000

describe('bunzip2', () => {
  it.each(Object.entries(bzip2Samples))('decodes %s like libbz2', (_name, sample) => {
    const result = bunzip2(decode(sample.data), LIMIT)
    expect(result.length).toBe(sample.size)
    expect(sha256(result)).toBe(sample.sha256)
  })

  it('returns readable text', () => {
    const result = bunzip2(decode(bzip2Samples.TEXT_L9.data), LIMIT)
    expect(new TextDecoder().decode(result)).toBe(TEXT)
  })

  it('ignores trailing bytes after the last stream', () => {
    const data = decode(bzip2Samples.TEXT_L1.data)
    const padded = new Uint8Array(data.length + 16)
    padded.set(data)
    expect(bunzip2(padded, LIMIT).length).toBe(bzip2Samples.TEXT_L1.size)
  })

  it('stops when the output exceeds the limit', () => {
    expect(() => bunzip2(decode(bzip2Samples.ZEROS_1MB.data), 1000)).toThrow(
      expect.objectContaining({ code: 'too-large' })
    )
  })

  it('rejects data without the bzip2 signature', () => {
    expect(() => bunzip2(new TextEncoder().encode('not bzip2'), LIMIT)).toThrow(ArchiveError)
  })

  it('detects a damaged block via its CRC', () => {
    const data = decode(bzip2Samples.TEXT_L9.data)
    data[data.length - 20] ^= 0x10
    expect(() => bunzip2(data, LIMIT)).toThrow(ArchiveError)
  })

  it('detects truncated input', () => {
    const data = decode(bzip2Samples.RANDOM.data)
    expect(() => bunzip2(data.subarray(0, data.length / 2), LIMIT)).toThrow(/end of input/)
  })
})
