/** Tiny dependency-free ZIP writer (store method, UTF-8 names). */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f)
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f)
  return { time, date: day }
}

type ZipEntry = { path: string; content: string | Uint8Array }

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  const now = new Date()
  const stamp = dosDateTime(now)
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path)
    const data = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content
    const crc = crc32(data)

    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, stamp.time, true)
    localView.setUint16(12, stamp.date, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, data.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    local.set(nameBytes, 30)

    chunks.push(local, data)

    const dir = new Uint8Array(46 + nameBytes.length)
    const dirView = new DataView(dir.buffer)
    dirView.setUint32(0, 0x02014b50, true)
    dirView.setUint16(4, 20, true)
    dirView.setUint16(6, 20, true)
    dirView.setUint16(8, 0x0800, true)
    dirView.setUint16(10, 0, true)
    dirView.setUint16(12, stamp.time, true)
    dirView.setUint16(14, stamp.date, true)
    dirView.setUint32(16, crc, true)
    dirView.setUint32(20, data.length, true)
    dirView.setUint32(24, data.length, true)
    dirView.setUint16(28, nameBytes.length, true)
    dirView.setUint16(30, 0, true)
    dirView.setUint16(32, 0, true)
    dirView.setUint16(34, 0, true)
    dirView.setUint16(36, 0, true)
    dirView.setUint32(38, 0, true)
    dirView.setUint32(42, offset, true)
    dir.set(nameBytes, 46)
    central.push(dir)

    offset += local.length + data.length
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  endView.setUint16(20, 0, true)

  const parts = [...chunks, ...central, end]
  const blobParts = parts.map((part) => {
    const copy = new Uint8Array(part.length)
    copy.set(part)
    return copy.buffer as ArrayBuffer
  })
  return new Blob(blobParts, { type: 'application/zip' })
}
