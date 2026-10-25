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

/**
 * Path for an entry inside the selection zip. Archive paths are untrusted and may contain `..`
 * (kept as display text in the viewer); they are dropped here so the generated zip can't write
 * outside its target folder when extracted ("zip slip"). Clashes get a " (n)" suffix.
 */
export const selectionPath = (path: string, used: Set<string>): string => {
  // trim before filtering, so " .. " can't become ".." after sanitizing
  const segments = path
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .map(sanitizeFileName)
  const base = segments.join('/') || 'download'
  let candidate = base
  for (let n = 2; used.has(candidate); n++) {
    const dot = base.lastIndexOf('.')
    candidate =
      dot > base.lastIndexOf('/') + 1
        ? `${base.slice(0, dot)} (${n})${base.slice(dot)}`
        : `${base} (${n})`
  }
  used.add(candidate)
  return candidate
}

/** Packs the given archive files into a new zip, one at a time to limit memory use. */
export const zipEntries = async (handle: ArchiveHandle, files: ArchiveEntry[]): Promise<Blob> => {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  const used = new Set<string>()
  for (const file of files) {
    await writer.add(selectionPath(file.path, used), new BlobReader(await handle.read(file)))
  }
  return writer.close()
}
