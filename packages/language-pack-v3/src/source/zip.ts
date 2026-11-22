/**
 * A minimal reader of ZIP archives: the central directory, entries stored (method 0) or deflated (method 8). Used for the Natural Earth
 * shapefile zips, whose sha256 the pins check before anything is read. Not supported (an `Error`): encryption, ZIP64, other methods, a
 * multi-disk archive. The size of an entry is limited (`MAX_ENTRY`). Uses `pako`; no Node module is used.
 */
import { inflateRaw } from 'pako'

/** The largest entry read (bytes): the biggest Natural Earth file here is 10 MB. */
export const MAX_ENTRY = 64 * 1024 * 1024

const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8)
const u32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0

/** The entries of a ZIP archive, by name. Throws `Error` for anything that is not a plain ZIP or for an entry above {@link MAX_ENTRY}. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('zip: no end of central directory: not a ZIP file')
  const count = u16(bytes, end + 10)
  let at = u32(bytes, end + 16)
  if (count === 0xffff || at === 0xffffffff) throw new Error('zip: ZIP64 is not supported')
  const out = new Map<string, Uint8Array>()
  const utf8 = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (u32(bytes, at) !== 0x02014b50) throw new Error('zip: the central directory is damaged')
    const flags = u16(bytes, at + 8)
    const method = u16(bytes, at + 10)
    const size = u32(bytes, at + 20)
    const length = u32(bytes, at + 24)
    const nameLength = u16(bytes, at + 28)
    const extra = u16(bytes, at + 30)
    const comment = u16(bytes, at + 32)
    const local = u32(bytes, at + 42)
    const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extra + comment
    if ((flags & 1) !== 0) throw new Error(`zip: ${name} is encrypted`)
    if (name.endsWith('/')) continue
    if (length > MAX_ENTRY) throw new Error(`zip: ${name} is larger than ${MAX_ENTRY} bytes`)
    if (u32(bytes, local) !== 0x04034b50) throw new Error(`zip: the local header of ${name} is damaged`)
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28)
    if (start + size > bytes.length) throw new Error(`zip: ${name} is cut short`)
    const data = bytes.subarray(start, start + size)
    let body: Uint8Array
    if (method === 0) body = data
    else if (method === 8) {
      const inflated = inflateRaw(data)
      body = inflated
    } else throw new Error(`zip: ${name} uses the method ${method}, which is not supported`)
    if (body.length !== length) throw new Error(`zip: ${name} has ${body.length} bytes, its entry says ${length}`)
    if (out.has(name)) throw new Error(`zip: ${name} is in it twice`)
    out.set(name, body)
  }
  return out
}
