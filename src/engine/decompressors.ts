import { bunzip2 } from './bzip2'
import { unlzma } from './lzmaAlone'
import { unxz } from './xz'

/** Decoders that run in the worker (pure JS, CPU-heavy). gzip uses the browser's own decoder. */
export type DecompressKind = 'bzip2' | 'xz' | 'lzma'

export const decompress = (
  kind: DecompressKind,
  data: Uint8Array,
  maxSize: number
): Promise<Uint8Array<ArrayBuffer>> => {
  try {
    switch (kind) {
      case 'bzip2':
        return Promise.resolve(bunzip2(data, maxSize))
      case 'xz':
        return unxz(data, maxSize)
      case 'lzma':
        return Promise.resolve(unlzma(data, maxSize))
    }
  } catch (error) {
    return Promise.reject(error)
  }
}
