import { gunzip } from './gzip'
import { openTar } from './tar'
import { ArchiveFormat, ArchiveHandle, ArchiveLimits } from './types'
import { openZip } from './zip'

export * from './types'
export { archiveExtension, resolveFormat, SIGNATURE_LENGTH } from './detect'
export { buildIndex, parentPath } from './tree'
export type { ArchiveIndex } from './tree'

export const openArchive = async (
  blob: Blob,
  format: ArchiveFormat,
  limits: ArchiveLimits
): Promise<ArchiveHandle> => {
  switch (format) {
    case 'zip':
      return openZip(blob)
    case 'tar':
      return openTar(new Uint8Array(await blob.arrayBuffer()))
    case 'tar.gz':
      return openTar(await gunzip(blob, limits.maxUncompressedSize), 'tar.gz')
  }
}
