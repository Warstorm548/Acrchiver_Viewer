// Runs the (synchronous, CPU-heavy) pure-JS decoders off the main thread.
// Bundled with Vite `?worker&inline`, i.e. started from a blob: URL (allowed by OpenCloud's CSP).
import { decompress, DecompressKind } from './decompressors'
import { ArchiveError } from './types'

export interface DecompressRequest {
  kind: DecompressKind
  data: ArrayBuffer
  maxSize: number
}

/** Either `data` (success) or `code` + `message` (failure). */
export interface DecompressResponse {
  ok: boolean
  data?: ArrayBuffer
  code?: ArchiveError['code']
  message?: string
}

const scope = self as unknown as {
  onmessage: (event: MessageEvent<DecompressRequest>) => void
  postMessage: (message: DecompressResponse, transfer?: Transferable[]) => void
}

scope.onmessage = async ({ data: request }) => {
  try {
    const result = await decompress(request.kind, new Uint8Array(request.data), request.maxSize)
    scope.postMessage({ ok: true, data: result.buffer }, [result.buffer])
  } catch (error) {
    scope.postMessage({
      ok: false,
      code: error instanceof ArchiveError ? error.code : 'corrupt',
      message: (error as Error).message
    })
  }
}
