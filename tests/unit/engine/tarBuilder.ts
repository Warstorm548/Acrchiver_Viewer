// Builds tar archives in memory for tests (ustar headers, optional GNU long names and pax records).
const encoder = new TextEncoder()

export interface TarItem {
  name: string
  content?: string
  /** Tar type flag: '0' file (default), '5' directory, '2' symlink. */
  type?: string
  mtime?: number
  /** Write the name as a GNU 'L' long-name record. */
  gnuLongName?: boolean
  /** Write the name as a pax 'x' path record. */
  paxPath?: boolean
}

const writeString = (block: Uint8Array, offset: number, length: number, value: string) => {
  block.set(encoder.encode(value).subarray(0, length), offset)
}

const writeOctal = (block: Uint8Array, offset: number, length: number, value: number) => {
  writeString(block, offset, length, value.toString(8).padStart(length - 1, '0'))
}

const header = (name: string, size: number, type: string, mtime: number): Uint8Array => {
  const block = new Uint8Array(512)
  writeString(block, 0, 100, name)
  writeOctal(block, 100, 8, 0o644)
  writeOctal(block, 108, 8, 0)
  writeOctal(block, 116, 8, 0)
  writeOctal(block, 124, 12, size)
  writeOctal(block, 136, 12, mtime)
  block[156] = type.charCodeAt(0)
  writeString(block, 257, 6, 'ustar')
  writeString(block, 263, 2, '00')
  block.fill(0x20, 148, 156)
  const sum = block.reduce((total, byte) => total + byte, 0)
  writeString(block, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ')
  return block
}

const padded = (data: Uint8Array): Uint8Array => {
  const result = new Uint8Array(Math.ceil(data.length / 512) * 512)
  result.set(data)
  return result
}

const paxRecord = (key: string, value: string): string => {
  const body = ` ${key}=${value}\n`
  let length = body.length + 1
  while (`${length}${body}`.length !== length) {
    length++
  }
  return `${length}${body}`
}

export const buildTar = (items: TarItem[]): Uint8Array<ArrayBuffer> => {
  const blocks: Uint8Array[] = []
  for (const item of items) {
    const type = item.type ?? '0'
    const data = encoder.encode(item.content ?? '')
    const mtime = item.mtime ?? 1_700_000_000
    let headerName = item.name
    if (item.gnuLongName) {
      const longName = encoder.encode(`${item.name}\0`)
      blocks.push(header('././@LongLink', longName.length, 'L', 0), padded(longName))
      headerName = item.name.slice(0, 99)
    }
    if (item.paxPath) {
      const pax = encoder.encode(paxRecord('path', item.name))
      blocks.push(header('PaxHeader', pax.length, 'x', 0), padded(pax))
      headerName = item.name.slice(0, 99)
    }
    blocks.push(header(headerName, type === '0' ? data.length : 0, type, mtime))
    if (type === '0') {
      blocks.push(padded(data))
    }
  }
  blocks.push(new Uint8Array(1024))
  const total = blocks.reduce((sum, block) => sum + block.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const block of blocks) {
    result.set(block, offset)
    offset += block.length
  }
  return result
}

export const gzipBytes = (data: Uint8Array<ArrayBuffer>): Promise<Blob> => {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).blob()
}
