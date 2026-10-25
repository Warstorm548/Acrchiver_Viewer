import { resolveFormat, sniffSignature } from '../../../src/engine/detect'
import { ArchiveError } from '../../../src/engine/types'
import { buildTar } from './tarBuilder'

const bytes = (...values: number[]) => {
  const head = new Uint8Array(262)
  head.set(values)
  return head
}

const zipHead = bytes(0x50, 0x4b, 0x03, 0x04)
const gzipHead = bytes(0x1f, 0x8b, 0x08)
const bzip2Head = bytes(0x42, 0x5a, 0x68, 0x39)
const xzHead = bytes(0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00)
// legacy .lzma header: properties 0x5d, 8 MiB dictionary, unknown size
const lzmaHead = bytes(0x5d, 0x00, 0x00, 0x80, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)
const tarHead = buildTar([{ name: 'a.txt', content: 'x' }]).subarray(0, 262)
const unknownHead = bytes(0x01, 0x02)

describe('sniffSignature', () => {
  it('recognizes zip, gzip and tar', () => {
    expect(sniffSignature(zipHead)).toBe('zip')
    expect(sniffSignature(gzipHead)).toBe('gzip')
    expect(sniffSignature(bzip2Head)).toBe('bzip2')
    expect(sniffSignature(xzHead)).toBe('xz')
    expect(sniffSignature(tarHead)).toBe('tar')
    expect(sniffSignature(unknownHead)).toBeNull()
  })
})

describe('resolveFormat', () => {
  it('uses matching extension and content', () => {
    expect(resolveFormat('zip', zipHead)).toBe('zip')
    expect(resolveFormat('tar', tarHead)).toBe('tar')
    expect(resolveFormat('tar.gz', gzipHead)).toBe('tar.gz')
    expect(resolveFormat('tgz', gzipHead)).toBe('tar.gz')
    expect(resolveFormat('gz', gzipHead)).toBe('gz')
    expect(resolveFormat('tar.bz2', bzip2Head)).toBe('tar.bz2')
    expect(resolveFormat('tbz2', bzip2Head)).toBe('tar.bz2')
    expect(resolveFormat('bz2', bzip2Head)).toBe('bz2')
    expect(resolveFormat('tar.xz', xzHead)).toBe('tar.xz')
    expect(resolveFormat('txz', xzHead)).toBe('tar.xz')
    expect(resolveFormat('xz', xzHead)).toBe('xz')
    expect(resolveFormat('lzma', lzmaHead)).toBe('lzma')
    expect(resolveFormat('tlz', lzmaHead)).toBe('lzma')
  })

  it('trusts content over a wrong extension', () => {
    expect(resolveFormat('tar', zipHead)).toBe('zip')
  })

  it('accepts signature-less tar by extension', () => {
    expect(resolveFormat('tar', unknownHead)).toBe('tar')
  })

  it('rejects formats this version cannot open', () => {
    expect(() => resolveFormat('xz', unknownHead)).toThrow(ArchiveError)
    expect(() => resolveFormat('lzma', bytes(0xff, 0x00))).toThrow(ArchiveError)
    expect(() => resolveFormat('7z', unknownHead)).toThrow(ArchiveError)
    expect(() => resolveFormat('bz2', gzipHead)).toThrow(ArchiveError)
  })
})
