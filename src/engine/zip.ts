// The "native" build of zip.js has no WebAssembly: it decompresses with the browser's
// DecompressionStream in an inline blob: worker, which OpenCloud's production CSP allows.
import { BlobReader, BlobWriter, configure, ZipReader } from '@zip.js/zip.js/lib/zip-native.js'
import type { Entry, FileEntry } from '@zip.js/zip.js'
import { mimeTypeFor } from './fileTypes'
import { normalizePath } from './tree'
import { ArchiveEntry, ArchiveError, ArchiveHandle } from './types'

/** Compression methods the native build can decompress: stored and deflate. */
const SUPPORTED_METHODS = new Set([0, 8])

export const configureZip = ({ useWebWorkers }: { useWebWorkers: boolean }) => {
  configure({ useWebWorkers })
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

export const openZip = async (blob: Blob): Promise<ArchiveHandle> => {
  const reader = new ZipReader(new BlobReader(blob))
  let zipEntries: Entry[]
  try {
    zipEntries = await reader.getEntries()
  } catch (error) {
    await reader.close().catch(() => {})
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
      return await zipEntry.getData(new BlobWriter(mimeTypeFor(entry.name)))
    },
    close: () => reader.close()
  }
}
