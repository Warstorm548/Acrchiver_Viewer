import { mimeTypeFor } from './fileTypes'
import { ArchiveFormat, ArchiveHandle } from './types'

/** Presents a single decompressed file (e.g. `notes.txt.gz`) as a one-entry archive. */
export const openSingleFile = (
  data: Uint8Array<ArrayBuffer>,
  name: string,
  format: ArchiveFormat,
  modified?: Date
): ArchiveHandle => {
  const entry = {
    path: name,
    name,
    isDirectory: false,
    size: data.length,
    modified,
    supported: true
  }
  return {
    format,
    entries: [entry],
    read: () => Promise.resolve(new Blob([data], { type: mimeTypeFor(name) })),
    close: () => Promise.resolve()
  }
}

/** Name for the decompressed file: the stored original name, else the archive name minus its extension. */
export const singleFileName = (archiveName: string, storedName?: string): string => {
  const stored = storedName?.split(/[\\/]/).pop()?.trim()
  if (stored) {
    return stored
  }
  const stripped = archiveName.replace(/\.(gz|bz2|xz|lzma)$/i, '')
  return stripped && stripped !== archiveName ? stripped : `${archiveName}.out`
}
