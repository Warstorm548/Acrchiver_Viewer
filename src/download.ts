import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js/lib/zip-native.js'
import { ArchiveEntry, ArchiveHandle } from './engine'

/** Removes path separators and control characters, since names come from untrusted archives. */
export const sanitizeFileName = (name: string): string => {
  const cleaned = Array.from(name, (char) => {
    const code = char.charCodeAt(0)
    return char === '/' || char === '\\' || code < 0x20 || code === 0x7f ? '_' : char
  })
    .join('')
    .trim()
  return cleaned || 'download'
}

export const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = sanitizeFileName(fileName)
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // give the browser time to start the download before releasing the blob
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Packs the given archive files into a new zip, one at a time to limit memory use. */
export const zipEntries = async (handle: ArchiveHandle, files: ArchiveEntry[]): Promise<Blob> => {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  for (const file of files) {
    await writer.add(file.path, new BlobReader(await handle.read(file)))
  }
  return writer.close()
}
