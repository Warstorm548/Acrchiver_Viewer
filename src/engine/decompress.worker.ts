// Runs the (synchronous, CPU-heavy) pure-JS bzip2 decoder off the main thread.
// Bundled with Vite `?worker&inline`, i.e. started from a blob: URL (allowed by OpenCloud's CSP).
import { bunzip2 } from './bzip2'
import { ArchiveError } from './types'

export interface DecompressRequest {
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

scope.onmessage = ({ data: request }) => {
  try {
    const result = bunzip2(new Uint8Array(request.data), request.maxSize)
    scope.postMessage({ ok: true, data: result.buffer }, [result.buffer])
  } catch (error) {
    scope.postMessage({
      ok: false,
      code: error instanceof ArchiveError ? error.code : 'corrupt',
      message: (error as Error).message
    })
  }
}
