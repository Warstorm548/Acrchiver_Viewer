import {
  BlobBuilder,
  GrowableBuffer,
  isOutOfMemory,
  MAX_BUFFER_SIZE,
  toArchiveError
} from '../../../src/engine/buffer'
import { ArchiveError } from '../../../src/engine/types'

describe.each(['resizable', 'copying'])('GrowableBuffer (%s)', (mode) => {
  // without `ArrayBuffer.prototype.resize` the buffer falls back to copying on growth
  const resize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resize')
  beforeAll(() => {
    if (mode === 'copying') {
      delete (ArrayBuffer.prototype as { resize?: unknown }).resize
    }
  })
  afterAll(() => {
    if (resize) {
      Object.defineProperty(ArrayBuffer.prototype, 'resize', resize)
    }
  })

  it('uses the expected kind of buffer', () => {
    expect(new GrowableBuffer(1000).buffer.buffer.resizable).toBe(mode === 'resizable')
  })

  it('grows as data is written and returns exactly what was written', () => {
    const out = new GrowableBuffer(1_000_000)
    for (let i = 0; i < 1000; i++) {
      out.writeBytes(new Uint8Array(100).fill(i % 256))
    }
    const result = out.result()
    expect(result.length).toBe(100_000)
    expect(result[99_999]).toBe(999 % 256)
  })

  it('returns exactly the data written after growing past the initial size', () => {
    const out = new GrowableBuffer(1_000_000, 10)
    out.writeBytes(new Uint8Array(70_000).fill(5))
    const result = out.result()
    expect(result.length).toBe(70_000)
    expect(result.buffer.byteLength).toBe(70_000)
  })

  it('returns the buffer itself, without a copy, when the size hint was exact', () => {
    const out = new GrowableBuffer(1000, 3)
    out.writeBytes(new Uint8Array([1, 2, 3]))
    expect(out.result()).toBe(out.buffer)
  })

  it('still grows past a size hint that was too small', () => {
    const out = new GrowableBuffer(1000, 2)
    out.writeBytes(new Uint8Array([1, 2, 3, 4]))
    expect(Array.from(out.result())).toEqual([1, 2, 3, 4])
  })

  it('stops at maxSize', () => {
    const out = new GrowableBuffer(10)
    expect(() => out.writeBytes(new Uint8Array(11))).toThrow(
      expect.objectContaining({ code: 'too-large' })
    )
  })

  it('never asks for a buffer larger than the browser can hold', () => {
    const out = new GrowableBuffer(4 * 1024 ** 3, 0)
    expect(() => out.reserve(MAX_BUFFER_SIZE + 1)).toThrow(
      expect.objectContaining({ code: 'too-large', message: expect.stringContaining('largest') })
    )
    expect(new GrowableBuffer(4 * 1024 ** 3, 4 * 1024 ** 3 + 1).buffer.length).toBeLessThanOrEqual(
      MAX_BUFFER_SIZE
    )
  })
})

describe('BlobBuilder', () => {
  it('joins the chunks in order', async () => {
    const builder = new BlobBuilder()
    builder.append(new TextEncoder().encode('hello '))
    builder.append(new TextEncoder().encode('world'))
    const blob = builder.build('text/plain')
    expect(builder.size).toBe(11)
    expect(blob.type).toBe('text/plain')
    expect(await blob.text()).toBe('hello world')
  })

  it('handles more data than one blob part', async () => {
    const builder = new BlobBuilder()
    const chunk = new Uint8Array(6 * 1024 * 1024).fill(7)
    for (let i = 0; i < 4; i++) {
      builder.append(chunk)
    }
    const blob = builder.build()
    expect(blob.size).toBe(24 * 1024 * 1024)
    expect(new Uint8Array(await blob.slice(-1).arrayBuffer())[0]).toBe(7)
  })
})

describe('isOutOfMemory / toArchiveError', () => {
  const chromium = new RangeError('Array buffer allocation failed')

  it('recognises failed allocations, not other range errors', () => {
    expect(isOutOfMemory(chromium)).toBe(true)
    expect(isOutOfMemory(new RangeError('out of memory'))).toBe(true)
    expect(isOutOfMemory(new RangeError('offset is out of bounds'))).toBe(false)
    expect(isOutOfMemory(new Error('Array buffer allocation failed'))).toBe(false)
  })

  it('maps errors to archive error codes', () => {
    const existing = new ArchiveError('too-large', 'x')
    expect(toArchiveError(existing, 'bad')).toBe(existing)
    expect(toArchiveError(chromium, 'bad')).toMatchObject({ code: 'out-of-memory' })
    expect(toArchiveError(new Error('broken'), 'Invalid data')).toMatchObject({
      code: 'corrupt',
      message: 'Invalid data: broken'
    })
  })
})
