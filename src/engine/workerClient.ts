import type { DecompressResponse } from './decompress.worker'
import { toArchiveError } from './buffer'
import { decompress, DecompressKind } from './decompressors'
import { ArchiveError } from './types'

/** The worker could not be started (e.g. a CSP without `worker-src blob:`). */
class WorkerUnavailable extends Error {}

const abortError = () => new DOMException('Decompression aborted', 'AbortError')

const decompressInWorker = async (
  kind: DecompressKind,
  input: Uint8Array<ArrayBuffer>,
  maxSize: number,
  signal?: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> => {
  const { default: DecompressWorker } = await import('./decompress.worker?worker&inline')
  let worker: Worker
  try {
    worker = new DecompressWorker()
  } catch {
    throw new WorkerUnavailable()
  }
  let onAbort = () => {}
  try {
    return await new Promise((resolve, reject) => {
      onAbort = () => reject(abortError())
      signal?.addEventListener('abort', onAbort)
      worker.onmessage = ({ data }: MessageEvent<DecompressResponse>) => {
        if (data.ok) {
          resolve(new Uint8Array(data.data as ArrayBuffer))
        } else {
          reject(new ArchiveError(data.code ?? 'corrupt', data.message ?? ''))
        }
      }
      // Errors while decoding are posted as messages, so this means the worker never ran —
      // unless the worker itself ran out of memory, which retrying here wouldn't fix.
      worker.onerror = (event) => {
        event.preventDefault()
        reject(
          /out of memory|allocation failed/i.test(event.message ?? '')
            ? new ArchiveError('out-of-memory', event.message)
            : new WorkerUnavailable()
        )
      }
      worker.postMessage({ kind, data: input.buffer, maxSize }, [input.buffer])
    })
  } finally {
    signal?.removeEventListener('abort', onAbort)
    worker.terminate()
  }
}

/**
 * Decompresses bzip2 / xz / lzma data in a Web Worker so the page stays responsive. Falls back
 * to the main thread where a worker can't run: no `Worker` (unit tests) or a CSP that blocks
 * `blob:` workers (OpenCloud's built-in default policy) — slower and the page freezes meanwhile,
 * but the archive still opens. Aborting `signal` stops the worker.
 */
export const decompressAsync = async (
  kind: DecompressKind,
  blob: Blob,
  maxSize: number,
  signal?: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> => {
  try {
    if (typeof Worker !== 'undefined') {
      try {
        return await decompressInWorker(
          kind,
          new Uint8Array(await blob.arrayBuffer()),
          maxSize,
          signal
        )
      } catch (error) {
        if (!(error instanceof WorkerUnavailable)) {
          throw error
        }
        console.warn('Archive viewer: worker unavailable, decompressing on the main thread')
      }
    }
    if (signal?.aborted) {
      throw abortError()
    }
    // the worker took ownership of the first copy, so read the blob again
    return await decompress(kind, new Uint8Array(await blob.arrayBuffer()), maxSize)
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error
    }
    throw toArchiveError(error, `Invalid ${kind} data`)
  }
}
