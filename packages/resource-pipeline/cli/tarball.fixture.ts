/** A small gzipped tarball for the tests of `tarball.ts` and `fetch-topic-sources.ts`, written the way GitHub writes one. */
import { gzipSync } from 'node:zlib'

const enc = new TextEncoder()

function header(name: string, size: number, type: string): Uint8Array {
  const h = new Uint8Array(512)
  const put = (text: string, at: number, len: number) => h.set(enc.encode(text).subarray(0, len), at)
  put(name, 0, 100)
  put('0000644\0', 100, 8)
  put('0000000\0', 108, 8)
  put('0000000\0', 116, 8)
  put(`${size.toString(8).padStart(11, '0')}\0`, 124, 12)
  put('00000000000\0', 136, 12)
  put('        ', 148, 8)
  put(type, 156, 1)
  put('ustar\0', 257, 6)
  put('00', 263, 2)
  let sum = 0
  for (const b of h) sum += b
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8)
  return h
}

const pad = (n: number): Uint8Array => new Uint8Array((512 - (n % 512)) % 512)

/**
 * The `.tar.gz` of `files` (path inside the repository to bytes) under the folder `root/`, with a global pax header first, like GitHub's.
 * A path longer than 100 bytes is written with a pax `path` record; `gnuLong` writes those with a GNU `L` entry instead.
 */
export function tarGz(root: string, files: [string, Uint8Array | string][], gnuLong = false): Uint8Array {
  return new Uint8Array(gzipSync(tar(root, files, gnuLong)))
}

/** The tarball of {@link tarGz}, not gzipped (a test cuts or changes it, then gzips it). */
export function tar(root: string, files: [string, Uint8Array | string][], gnuLong = false): Uint8Array {
  const parts: Uint8Array[] = []
  const add = (b: Uint8Array) => parts.push(b)
  const comment = enc.encode('52 comment=0123456789abcdef0123456789abcdef01234567\n')
  add(header('pax_global_header', comment.length, 'g'))
  add(comment)
  add(pad(comment.length))
  add(header(`${root}/`, 0, '5'))
  for (const [path, body] of files) {
    const bytes = typeof body === 'string' ? enc.encode(body) : body
    const full = `${root}/${path}`
    if (enc.encode(full).length > 100) {
      if (gnuLong) {
        const name = enc.encode(`${full}\0`)
        add(header('././@LongLink', name.length, 'L'))
        add(name)
        add(pad(name.length))
      } else {
        const line = (n: number) => `${n} path=${full}\n`
        let n = line(0).length
        while (enc.encode(line(n)).length !== n) n = enc.encode(line(n)).length
        const rec = enc.encode(line(n))
        add(header('PaxHeader', rec.length, 'x'))
        add(rec)
        add(pad(rec.length))
      }
    }
    add(header(full.slice(0, 100), bytes.length, '0'))
    add(bytes)
    add(pad(bytes.length))
  }
  add(new Uint8Array(1024))
  const total = parts.reduce((a, p) => a + p.length, 0)
  const tar = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    tar.set(p, at)
    at += p.length
  }
  return tar
}

/** A header of a regular file, for a test that writes its own tarball. */
export const fileHeader = (name: string, size: number): Uint8Array => header(name, size, '0')
export { gzipSync }

/** The bytes as a stream of small chunks (so a reader must join headers and bodies across chunks). */
export async function* chunks(bytes: Uint8Array, size = 37): AsyncIterable<Uint8Array> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size)
}
