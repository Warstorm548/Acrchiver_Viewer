import { ArchiveError } from './types'

const MiB = 1024 * 1024

/**
 * Largest single buffer the engine allocates. Chromium refuses any ArrayBuffer of 2 GiB − 2 MiB
 * or more (measured in Chromium 153 with plenty of free memory), so decompressed data must stay
 * below that whatever `maxUncompressedSize` says. The extra margin covers other browsers.
 */
export const MAX_BUFFER_SIZE = 2048 * MiB - 16 * MiB

/** Streamed data is turned into a Blob part every this many bytes (see `BlobBuilder`). */
const BLOB_PART_SIZE = 16 * MiB

/**
 * A resizable ArrayBuffer when the browser has them: it grows in place, so growing never holds
 * the old and new copy at once. Undefined in older browsers (or if the address space can't be
 * reserved), which then use plain buffers that are copied on growth.
 */
const resizableBuffer = (size: number, maxSize: number): ArrayBuffer | undefined => {
  if (!('resize' in ArrayBuffer.prototype)) {
    return undefined
  }
  try {
    return new ArrayBuffer(size, { maxByteLength: maxSize })
  } catch {
    return undefined
  }
}

/**
 * Growable output buffer for the decoders. Starts at `sizeHint` when the format records its
 * decompressed size, and grows by 1.5× — in place where the browser supports resizable buffers,
 * otherwise by copying. Throws `ArchiveError('too-large')` once the output would exceed
 * `maxSize` or the largest buffer the browser can hold.
 */
export class GrowableBuffer {
  /** View of the data; tracks the buffer's length when it is resizable. */
  buffer: Uint8Array<ArrayBuffer>
  length = 0
  private readonly limit: number
  private readonly resizable?: ArrayBuffer

  constructor(
    private readonly maxSize: number,
    sizeHint?: number
  ) {
    this.limit = Math.min(maxSize, MAX_BUFFER_SIZE)
    const initial = Math.min(
      sizeHint !== undefined && sizeHint >= 0 ? sizeHint : 1 << 16,
      this.limit
    )
    this.resizable = resizableBuffer(initial, this.limit)
    this.buffer = this.resizable ? new Uint8Array(this.resizable) : new Uint8Array(initial)
  }

  /** Makes room for `count` more bytes. */
  reserve(count: number) {
    const needed = this.length + count
    if (needed > this.limit) {
      throw new ArchiveError(
        'too-large',
        needed > this.maxSize
          ? `Decompressed size exceeds ${this.maxSize} bytes`
          : `Decompressed size exceeds ${MAX_BUFFER_SIZE} bytes, the largest buffer a browser can hold`
      )
    }
    if (needed > this.buffer.length) {
      let size = Math.max(this.buffer.length, 1 << 16)
      while (size < needed) {
        size = Math.ceil(size * 1.5)
      }
      size = Math.min(size, this.limit)
      if (this.resizable) {
        this.resizable.resize(size)
      } else {
        const grown = new Uint8Array(size)
        grown.set(this.buffer.subarray(0, this.length))
        this.buffer = grown
      }
    }
  }

  writeBytes(bytes: Uint8Array) {
    this.reserve(bytes.length)
    this.buffer.set(bytes, this.length)
    this.length += bytes.length
  }

  /**
   * The data written: shrunk in place, or without a copy when the buffer is exactly full. May be a
   * view of a resizable buffer — copy before passing it to Web APIs (see `blobFromBytes`).
   */
  result(): Uint8Array<ArrayBuffer> {
    if (this.resizable) {
      this.resizable.resize(this.length)
      return this.buffer
    }
    return this.length === this.buffer.length ? this.buffer : this.buffer.slice(0, this.length)
  }
}

/**
 * Collects streamed chunks into a Blob, a few MiB at a time. Each part is handed to the browser's
 * blob store (which can spill to disk) as soon as it is full, so the tab never holds the whole
 * download as separate chunks *and* as a Blob.
 */
export class BlobBuilder {
  size = 0
  private parts: Blob[] = []
  private pending: Uint8Array<ArrayBuffer>[] = []
  private pendingSize = 0

  append(chunk: Uint8Array) {
    this.pending.push(chunk as Uint8Array<ArrayBuffer>)
    this.pendingSize += chunk.length
    this.size += chunk.length
    if (this.pendingSize >= BLOB_PART_SIZE) {
      this.flush()
    }
  }

  build(type = ''): Blob {
    this.flush()
    return new Blob(this.parts, { type })
  }

  private flush() {
    if (this.pending.length) {
      this.parts.push(new Blob(this.pending))
      this.pending = []
      this.pendingSize = 0
    }
  }
}

/**
 * Blob holding a copy of `bytes`, made 16 MiB at a time. Decoder output may be a view of a
 * resizable buffer, which `Blob` and `TextDecoder` reject; the small copies also keep the tab
 * from holding a second full copy while the blob store takes the data.
 */
export const blobFromBytes = (bytes: Uint8Array, type = ''): Blob => {
  const builder = new BlobBuilder()
  for (let offset = 0; offset < bytes.length; offset += BLOB_PART_SIZE) {
    builder.append(bytes.slice(offset, offset + BLOB_PART_SIZE))
  }
  return builder.build(type)
}

/**
 * Whether an error is a failed memory allocation. Browsers report these as `RangeError`s
 * ("Array buffer allocation failed" in Chromium, "out of memory" / "invalid array length"
 * elsewhere); other `RangeError`s, such as out-of-bounds offsets, mean damaged data.
 */
export const isOutOfMemory = (error: unknown): boolean =>
  error instanceof RangeError &&
  /allocation failed|out of memory|invalid array length/i.test(error.message)

/**
 * Turns a decoder failure into an `ArchiveError`: passes those through, reports failed
 * allocations as `out-of-memory`, and everything else as `corrupt` with the given prefix.
 */
export const toArchiveError = (error: unknown, corruptPrefix: string): ArchiveError => {
  if (error instanceof ArchiveError) {
    return error
  }
  const message = (error as Error)?.message ?? String(error)
  return isOutOfMemory(error)
    ? new ArchiveError('out-of-memory', `Not enough memory: ${message}`)
    : new ArchiveError('corrupt', `${corruptPrefix}: ${message}`)
}
