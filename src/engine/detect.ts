import { ArchiveError, ArchiveFormat } from './types'

type Signature = 'zip' | 'gzip' | 'tar'

/** Formats this version can open, keyed by the extension OpenCloud reports for the file. */
const formatsByExtension: Record<string, ArchiveFormat> = {
  zip: 'zip',
  tar: 'tar',
  'tar.gz': 'tar.gz',
  tgz: 'tar.gz'
}

/** Same rule as OpenCloud's web-client `extractExtensionFromFile` (tar.* counts as one extension). */
const compoundExtensions = ['tar.gz', 'tar.bz2', 'tar.xz']

export const archiveExtension = (fileName: string): string => {
  const lower = fileName.toLowerCase()
  const compound = compoundExtensions.find((extension) => lower.endsWith(`.${extension}`))
  if (compound) {
    return compound
  }
  const dot = lower.lastIndexOf('.')
  return dot > 0 ? lower.slice(dot + 1) : ''
}

/** Number of leading bytes `sniffSignature` needs. */
export const SIGNATURE_LENGTH = 262

export const sniffSignature = (head: Uint8Array): Signature | null => {
  if (head[0] === 0x50 && head[1] === 0x4b && [0x03, 0x05, 0x07].includes(head[2])) {
    return 'zip'
  }
  if (head[0] === 0x1f && head[1] === 0x8b) {
    return 'gzip'
  }
  const magic = String.fromCharCode(...head.subarray(257, 262))
  if (magic === 'ustar') {
    return 'tar'
  }
  return null
}

/**
 * Picks the reader from the file extension, but trusts the file content when the two disagree,
 * so a mislabelled archive still opens. Old (pre-POSIX) tar files have no signature and are
 * accepted on their extension alone.
 */
export const resolveFormat = (extension: string, head: Uint8Array): ArchiveFormat => {
  const byExtension = formatsByExtension[extension.toLowerCase()]
  const signature = sniffSignature(head)

  if (signature === 'zip') {
    return 'zip'
  }
  if (signature === 'tar') {
    return 'tar'
  }
  if (signature === 'gzip' && byExtension === 'tar.gz') {
    return 'tar.gz'
  }
  if (signature === null && byExtension === 'tar') {
    return 'tar'
  }
  throw new ArchiveError(
    'unsupported-format',
    `Unsupported archive format (extension "${extension}", signature "${signature ?? 'unknown'}")`
  )
}
