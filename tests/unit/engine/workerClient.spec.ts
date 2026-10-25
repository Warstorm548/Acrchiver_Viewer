import { bzip2Samples } from './bzip2Samples'

// A stand-in for the bundled worker, configured per test.
let behaviour: 'blocked' | 'oom' | 'crash' | 'hang' = 'blocked'
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  terminated = false
  static last: FakeWorker | null = null
  constructor() {
    FakeWorker.last = this
  }
  postMessage(message: { data: ArrayBuffer }, transfer: ArrayBuffer[]) {
    // like the browser: the input is transferred (detached) even if the worker can't run
    structuredClone(message, { transfer })
    setTimeout(() => {
      if (behaviour === 'blocked') {
        this.onerror?.(new Event('error'))
      } else if (behaviour === 'crash') {
        this.onerror?.(
          new ErrorEvent('error', { message: 'Uncaught InternalError: out of memory' })
        )
      } else if (behaviour === 'oom') {
        this.onmessage?.({
          data: { ok: false, code: 'out-of-memory', message: 'Not enough memory' }
        } as MessageEvent)
      }
    })
  }
  terminate() {
    this.terminated = true
  }
}

vi.mock('../../../src/engine/decompress.worker?worker&inline', () => ({ default: FakeWorker }))

const { decompressAsync } = await import('../../../src/engine/workerClient')
const sample = () => ({
  blob: new Blob([Uint8Array.from(Buffer.from(bzip2Samples.TEXT_L9.data, 'base64'))])
})

describe('decompressAsync', () => {
  beforeAll(() => vi.stubGlobal('Worker', FakeWorker))
  afterAll(() => vi.unstubAllGlobals())
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('decompresses on the main thread when the CSP blocks the worker', async () => {
    behaviour = 'blocked'
    const result = await decompressAsync('bzip2', sample().blob, 10_000_000)
    expect(result.length).toBe(bzip2Samples.TEXT_L9.size)
    expect(FakeWorker.last?.terminated).toBe(true)
  })

  it('passes on out-of-memory errors from the worker', async () => {
    behaviour = 'oom'
    await expect(decompressAsync('bzip2', sample().blob, 10_000_000)).rejects.toMatchObject({
      code: 'out-of-memory'
    })
  })

  it('does not retry on the main thread when the worker ran out of memory', async () => {
    behaviour = 'crash'
    const warn = vi.mocked(console.warn)
    await expect(decompressAsync('bzip2', sample().blob, 10_000_000)).rejects.toMatchObject({
      code: 'out-of-memory'
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('stops the worker when loading is aborted', async () => {
    behaviour = 'hang'
    const controller = new AbortController()
    const result = decompressAsync('bzip2', sample().blob, 10_000_000, controller.signal)
    await vi.waitFor(() => expect(FakeWorker.last).not.toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeWorker.last?.terminated).toBe(true)
  })
})
