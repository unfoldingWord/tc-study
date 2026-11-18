/**
 * The files of a folder of a gzipped tarball (a GitHub `tar.gz` of a commit), read as a stream so that only the files kept are held in
 * memory, and the manifest that pins them. Used by `fetch-topic-sources` for a `tree` pin. A body that is not gzip, a tarball cut short, a
 * size field that is not a size, or an entry above the limits is an `Error`, never a partial result.
 */
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'

/** The largest file kept (bytes); an ACAI file is a few hundred KB. */
export const MAX_KEPT = 64 * 1024 * 1024
/** The largest pax or GNU long-name record (bytes). */
const MAX_META = 1024 * 1024

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** The text of a NUL-padded tar header field. */
function field(b: Uint8Array, at: number, len: number): string {
  const slice = b.subarray(at, at + len)
  const end = slice.indexOf(0)
  return utf8.decode(end < 0 ? slice : slice.subarray(0, end))
}

/** The size field of a header: octal digits (spaces and NULs around them); anything else is an error. */
function sizeOf(h: Uint8Array): number {
  const text = field(h, 124, 12).trim()
  if (!/^[0-7]*$/.test(text)) throw new Error(`tarball: the size field ${JSON.stringify(text)} is not octal`)
  return text === '' ? 0 : parseInt(text, 8)
}

type Entry = { name: string; keep: boolean; size: number; got: number; type: string; chunks: Uint8Array[] }

/**
 * The regular files of a gzipped tarball whose path, without its first folder (GitHub's `<repo>-<commit>/`), starts with `prefix`, by
 * that path. Handles the POSIX ustar `prefix` field, pax `path` records (`x`) and GNU long names (`L`); global pax headers (`g`) and the
 * bodies of entries not kept are skipped without being held.
 */
export async function filesOfTarball(body: AsyncIterable<Uint8Array>, prefix: string): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>()
  let buf = new Uint8Array(0)
  let longName: string | undefined
  let paxPath: string | undefined
  let entry: Entry | undefined
  let skip = 0

  const finish = (e: Entry): void => {
    const data = new Uint8Array(e.size)
    let o = 0
    for (const c of e.chunks) {
      data.set(c, o)
      o += c.length
    }
    if (e.type === 'L') longName = utf8.decode(data).replace(/\0+$/, '')
    else if (e.type === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(utf8.decode(data))
      if (m !== null) paxPath = m[1]
    } else if (e.keep) {
      if (out.has(e.name)) throw new Error(`tarball: ${e.name} is in it twice`)
      out.set(e.name, data)
    }
  }

  const take = (chunk: Uint8Array): void => {
    const joined = new Uint8Array(buf.length + chunk.length)
    joined.set(buf)
    joined.set(chunk, buf.length)
    buf = joined
    let at = 0
    for (;;) {
      if (skip > 0) {
        const n = Math.min(skip, buf.length - at)
        at += n
        skip -= n
        if (skip > 0) break
      }
      if (entry !== undefined) {
        const n = Math.min(entry.size - entry.got, buf.length - at)
        entry.chunks.push(buf.slice(at, at + n))
        entry.got += n
        at += n
        if (entry.got < entry.size) break
        finish(entry)
        skip = (512 - (entry.size % 512)) % 512
        entry = undefined
        continue
      }
      if (buf.length - at < 512) break
      const h = buf.subarray(at, at + 512)
      at += 512
      if (h.every((x) => x === 0)) continue
      const size = sizeOf(h)
      const type = field(h, 156, 1) || '0'
      // The prefix field is POSIX ustar's ("ustar\0"); GNU's old header ("ustar  ") has other data there
      const ustarPrefix = field(h, 257, 6) === 'ustar' && h[262] === 0 ? field(h, 345, 155) : ''
      let name = paxPath ?? longName ?? (ustarPrefix === '' ? field(h, 0, 100) : `${ustarPrefix}/${field(h, 0, 100)}`)
      if (type !== 'x' && type !== 'L' && type !== 'g') {
        paxPath = undefined
        longName = undefined
      }
      name = name.slice(name.indexOf('/') + 1)
      const keep = type === '0' && name.startsWith(prefix)
      const held = keep || type === 'L' || type === 'x'
      if (held && size > (keep ? MAX_KEPT : MAX_META)) throw new Error(`tarball: ${name} has ${size} bytes, above the limit`)
      if (!held) {
        skip = size + ((512 - (size % 512)) % 512)
        continue
      }
      const e: Entry = { name, keep, size, got: 0, type, chunks: [] }
      if (size === 0) finish(e)
      else entry = e
    }
    buf = buf.slice(at)
  }

  const source = Readable.from(body)
  const gunzip = createGunzip()
  source.on('error', (e) => gunzip.destroy(e))
  source.pipe(gunzip)
  try {
    for await (const c of gunzip) take(new Uint8Array(c as Buffer))
  } finally {
    source.destroy()
    gunzip.destroy()
  }
  if (entry !== undefined || skip > 0 || buf.length > 0) throw new Error('tarball: cut short (it ends inside an entry)')
  return out
}

const sha256Of = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

/** Code point order: UTF-8 bytes compare in the order of the code points they encode. */
const byCodePoint = (a: string, b: string): number => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))

/** The manifest of a set of files: `<path>` TAB `<sha256 of the file>` and a newline per file, sorted by path (code point). */
export function manifestOf(files: Map<string, Uint8Array>): string {
  return [...files.keys()]
    .sort(byCodePoint)
    .map((p) => `${p}\t${sha256Of(files.get(p)!)}\n`)
    .join('')
}
