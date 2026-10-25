import { bunzip2 } from './bzip2'
import type { DecompressResponse } from './decompress.worker'
import { ArchiveError } from './types'

/**
 * Decompresses bzip2 data in a Web Worker so the page stays responsive. Falls back to the main
 * thread where workers don't exist (unit tests).
 */
export const bunzip2Async = async (
  blob: Blob,
  maxSize: number
): Promise<Uint8Array<ArrayBuffer>> => {
  const input = new Uint8Array(await blob.arrayBuffer())
  if (typeof Worker === 'undefined') {
    return bunzip2(input, maxSize)
  }
  const { default: DecompressWorker } = await import('./decompress.worker?worker&inline')
  const worker = new DecompressWorker()
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<DecompressResponse>) => {
        if (data.ok) {
          resolve(new Uint8Array(data.data))
        } else {
          reject(new ArchiveError(data.code, data.message))
        }
      }
      worker.onerror = (event) => reject(new ArchiveError('corrupt', event.message))
      worker.postMessage({ data: input.buffer, maxSize }, [input.buffer])
    })
  } finally {
    worker.terminate()
  }
}
