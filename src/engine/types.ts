export type ArchiveFormat =
  'zip' | 'tar' | 'tar.gz' | 'tar.bz2' | 'tar.xz' | 'gz' | 'bz2' | 'xz' | 'lzma'

export interface ArchiveEntry {
  /** Normalized path inside the archive, no leading or trailing slash. */
  path: string
  /** Last path segment. */
  name: string
  isDirectory: boolean
  /** Uncompressed size in bytes (0 for folders). */
  size: number
  compressedSize?: number
  modified?: Date
  encrypted?: boolean
  /** Whether the entry's content can be read (false for symlinks, encrypted or unsupported compression). */
  supported: boolean
}

export interface ArchiveHandle {
  format: ArchiveFormat
  entries: ArchiveEntry[]
  read(entry: ArchiveEntry): Promise<Blob>
  close(): Promise<void>
}

export interface ArchiveLimits {
  /** Maximum number of bytes a compressed stream may expand to (zip-bomb guard). */
  maxUncompressedSize: number
  /** Maximum size of a single file read out of a ZIP (preview, download). */
  maxEntrySize?: number
}

export type ArchiveErrorCode =
  | 'unsupported-format'
  | 'corrupt'
  | 'too-large'
  | 'unreadable-entry'
  /** The server ignored an HTTP Range request (answered 200 instead of 206). */
  | 'range-unsupported'
  /** The browser could not allocate the memory needed (the device has too little free). */
  | 'out-of-memory'

export class ArchiveError extends Error {
  readonly code: ArchiveErrorCode

  constructor(code: ArchiveErrorCode, message: string) {
    super(message)
    this.name = 'ArchiveError'
    this.code = code
  }
}
