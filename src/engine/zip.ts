// The "native" build of zip.js has no WebAssembly: it decompresses with the browser's
// DecompressionStream in an inline blob: worker, which OpenCloud's production CSP allows.
import { BlobReader, configure, Reader, ZipReader } from '@zip.js/zip.js/lib/zip-native.js'
import type { Entry, FileEntry } from '@zip.js/zip.js'
import { mimeTypeFor } from './fileTypes'
import { normalizePath } from './tree'
import { RangeRequestError } from './rangeReader'
import { ArchiveEntry, ArchiveError, ArchiveHandle } from './types'

/** Compression methods the native build can decompress: stored and deflate. */
const SUPPORTED_METHODS = new Set([0, 8])

/** Bigger chunks mean fewer HTTP requests when reading by range (zip.js default: 512 KiB). */
const CHUNK_SIZE = 4 * 1024 * 1024

export const configureZip = ({ useWebWorkers }: { useWebWorkers: boolean }) => {
  configure({ useWebWorkers })
}

const tooLarge = (name: string, maxSize: number): never => {
  throw new ArchiveError(
    'too-large',
    `"${name}" is larger than ${maxSize} bytes, the most that can be opened here`
  )
}

/**
 * Reads an entry into a Blob, stopping as soon as the real output exceeds `maxSize` — the size an
 * archive declares for an entry can't be trusted.
 */
const readLimited = async (entry: FileEntry, name: string, maxSize: number): Promise<Blob> => {
  if (entry.uncompressedSize > maxSize) {
    tooLarge(name, maxSize)
  }
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let total = 0
  const sink = new WritableStream<Uint8Array>({
    write(chunk) {
      total += chunk.length
      if (total > maxSize) {
        tooLarge(name, maxSize)
      }
      chunks.push(chunk as Uint8Array<ArrayBuffer>)
    }
  })
  try {
    await entry.getData(sink)
  } catch (error) {
    if (total > maxSize) {
      tooLarge(name, maxSize)
    }
    if (
      error instanceof ArchiveError ||
      error instanceof RangeRequestError ||
      (error as Error).name === 'AbortError'
    ) {
      throw error
    }
    // zip.js stops by itself when an entry turns out larger than declared, or fails its CRC.
    throw new ArchiveError('corrupt', `Cannot extract "${name}": ${(error as Error).message}`)
  }
  return new Blob(chunks, { type: mimeTypeFor(name) })
}

const toArchiveEntry = (entry: Entry, path: string): ArchiveEntry => ({
  path,
  name: path.slice(path.lastIndexOf('/') + 1),
  isDirectory: entry.directory,
  size: entry.directory ? 0 : entry.uncompressedSize,
  compressedSize: entry.directory ? undefined : entry.compressedSize,
  modified: entry.lastModDate,
  encrypted: entry.encrypted,
  supported:
    entry.directory ||
    (!entry.encrypted && !entry.symlink && SUPPORTED_METHODS.has(entry.compressionMethod))
})

/**
 * Opens a ZIP from a Blob (already downloaded) or a zip.js Reader (e.g. `HttpRangeReader`, which
 * fetches only the parts that are needed). Entry reads are capped at `maxEntrySize`.
 */
export const openZip = async (
  source: Blob | Reader<unknown>,
  { maxEntrySize = Number.MAX_SAFE_INTEGER }: { maxEntrySize?: number } = {}
): Promise<ArchiveHandle> => {
  configure({ chunkSize: CHUNK_SIZE })
  const reader = new ZipReader(source instanceof Blob ? new BlobReader(source) : source)
  let zipEntries: Entry[]
  try {
    zipEntries = await reader.getEntries()
  } catch (error) {
    await reader.close().catch(() => {})
    if (
      error instanceof ArchiveError ||
      error instanceof RangeRequestError ||
      (error as Error).name === 'AbortError'
    ) {
      throw error
    }
    throw new ArchiveError('corrupt', `Invalid zip archive: ${(error as Error).message}`)
  }

  const fileEntries = new Map<string, FileEntry>()
  const entries: ArchiveEntry[] = []
  for (const zipEntry of zipEntries) {
    const path = normalizePath(zipEntry.filename)
    if (!path) {
      continue
    }
    entries.push(toArchiveEntry(zipEntry, path))
    if (!zipEntry.directory) {
      fileEntries.set(path, zipEntry as FileEntry)
    }
  }

  return {
    format: 'zip',
    entries,
    read: async (entry) => {
      const zipEntry = fileEntries.get(entry.path)
      if (!zipEntry || !entry.supported) {
        throw new ArchiveError('unreadable-entry', `Cannot read "${entry.path}"`)
      }
      return await readLimited(zipEntry, entry.name, maxEntrySize)
    },
    close: () => reader.close()
  }
}
