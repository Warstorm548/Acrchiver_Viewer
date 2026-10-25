// Decoder output can be a view of a resizable ArrayBuffer. Browsers' Blob and TextDecoder reject
// those ("must not be resizable"); Node accepts them, so these tests make both strict.
import { buildTar, gzipBytes } from './tarBuilder'

const isResizable = (part: unknown) =>
  ArrayBuffer.isView(part) && (part.buffer as ArrayBuffer).resizable

class StrictBlob extends Blob {
  constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
    if (parts?.some(isResizable)) {
      throw new TypeError("Failed to construct 'Blob': value must not be resizable")
    }
    super(parts, options)
  }
}

class StrictTextDecoder extends TextDecoder {
  decode(input?: AllowSharedBufferSource, options?: TextDecodeOptions) {
    if (isResizable(input)) {
      throw new TypeError("Failed to execute 'decode': value must not be resizable")
    }
    return super.decode(input, options)
  }
}

// installed before the engine is imported, since tar.ts creates its TextDecoder on load
vi.stubGlobal('Blob', StrictBlob)
vi.stubGlobal('TextDecoder', StrictTextDecoder)
const { openSingleFile } = await import('../../../src/engine/single')
const { openTar } = await import('../../../src/engine/tar')
const { gunzip } = await import('../../../src/engine/gzip')
const { openArchive } = await import('../../../src/engine')

/** Copies bytes into a resizable buffer, like `GrowableBuffer` output. */
const resizableCopy = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  const view = new Uint8Array(new ArrayBuffer(bytes.length, { maxByteLength: bytes.length * 2 }))
  view.set(bytes)
  return view
}

describe('decoder output in resizable buffers', () => {
  afterAll(() => vi.unstubAllGlobals())

  it('the strict stand-ins reject resizable views like a browser', () => {
    const view = resizableCopy(new Uint8Array([104, 105]))
    expect(() => new Blob([view])).toThrow(TypeError)
    expect(() => new TextDecoder().decode(view)).toThrow(TypeError)
  })

  it('opens and reads a tar', async () => {
    const tar = resizableCopy(
      buildTar([
        { name: 'docs/readme.txt', content: 'hello' },
        { name: 'x'.repeat(120) + '.txt', content: 'GNU long name', gnuLongName: true },
        { name: 'ü'.repeat(60) + '.txt', content: 'pax path', paxPath: true }
      ])
    )
    const handle = openTar(tar)
    expect(handle.entries.map((e) => e.name)).toEqual([
      'readme.txt',
      'x'.repeat(120) + '.txt',
      'ü'.repeat(60) + '.txt'
    ])
    expect(await (await handle.read(handle.entries[0])).text()).toBe('hello')
  })

  it('reads a single file', async () => {
    const handle = openSingleFile(resizableCopy(new Uint8Array([104, 105])), 'a.txt', 'gz')
    expect(await (await handle.read(handle.entries[0])).text()).toBe('hi')
  })

  it('opens a .tar.gz end to end', async () => {
    const blob = await gzipBytes(buildTar([{ name: 'a.txt', content: 'from gzip' }]))
    expect((await gunzip(blob, 1_000_000)).buffer.resizable).toBe(true)
    const handle = await openArchive(blob, 'tar.gz', { maxUncompressedSize: 1_000_000 })
    expect(await (await handle.read(handle.entries[0])).text()).toBe('from gzip')
  })
})
