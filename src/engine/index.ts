import { sniffSignature } from './detect'
import { gunzip, readGzipHeader } from './gzip'
import { openSingleFile, singleFileName } from './single'
import { openTar } from './tar'
import { ArchiveFormat, ArchiveHandle, ArchiveLimits } from './types'
import { decompressAsync } from './workerClient'
import { openZip } from './zip'

export * from './types'
export { archiveExtension, resolveFormat, SIGNATURE_LENGTH } from './detect'
export { buildIndex, parentPath } from './tree'
export { HttpRangeReader, RangeRequestError } from './rangeReader'
export { openZip } from './zip'
export type { ArchiveIndex } from './tree'

/** Formats that are decompressed in full before they can be read (shown as "Decompressing…"). */
export const isCompressedFormat = (format: ArchiveFormat): boolean =>
  format !== 'zip' && format !== 'tar'

const looksLikeTar = (data: Uint8Array): boolean => sniffSignature(data.subarray(0, 262)) === 'tar'

/**
 * A plain `.gz` / `.bz2` / `.xz` / `.lzma` file is shown as the single file it contains — unless the content is a
 * tar (e.g. a tarball named without `.tar`), which is opened as an archive.
 */
const openDecompressed = (
  data: Uint8Array<ArrayBuffer>,
  format: ArchiveFormat,
  archiveName: string,
  storedName?: string,
  modified?: Date
): ArchiveHandle =>
  looksLikeTar(data)
    ? openTar(data, format)
    : openSingleFile(data, singleFileName(archiveName, storedName), format, modified)

export const openArchive = async (
  blob: Blob,
  format: ArchiveFormat,
  limits: ArchiveLimits,
  archiveName = ''
): Promise<ArchiveHandle> => {
  switch (format) {
    case 'zip':
      return openZip(blob, { maxEntrySize: limits.maxEntrySize })
    case 'tar':
      return openTar(new Uint8Array(await blob.arrayBuffer()))
    case 'tar.gz':
      return openTar(await gunzip(blob, limits.maxUncompressedSize), format)
    case 'tar.bz2':
      return openTar(await decompressAsync('bzip2', blob, limits.maxUncompressedSize), format)
    case 'tar.xz':
      return openTar(await decompressAsync('xz', blob, limits.maxUncompressedSize), format)
    case 'gz': {
      const header = readGzipHeader(new Uint8Array(await blob.slice(0, 1024).arrayBuffer()))
      const data = await gunzip(blob, limits.maxUncompressedSize)
      return openDecompressed(data, format, archiveName, header.fileName, header.modified)
    }
    case 'bz2':
    case 'xz':
    case 'lzma': {
      const kind = format === 'bz2' ? 'bzip2' : format
      const data = await decompressAsync(kind, blob, limits.maxUncompressedSize)
      return openDecompressed(data, format, archiveName)
    }
  }
}
