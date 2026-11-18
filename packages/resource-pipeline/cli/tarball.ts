/**
 * The files of a folder of a gzipped tarball (a GitHub `tar.gz` of a commit), read as a stream so that only the files kept are held in
 * memory, and the manifest that pins them. Used by `fetch-topic-sources` for a `tree` pin.
 */
import { createHash } from 'node:crypto'
import { createGunzip } from 'node:zlib'

/** The text of a NUL-padded tar header field. */
function field(b: Uint8Array, at: number, len: number): string {
  const slice = b.subarray(at, at + len)
  const end = slice.indexOf(0)
  return new TextDecoder().decode(end < 0 ? slice : slice.subarray(0, end))
}

type Entry = { name: string; keep: boolean; size: number; got: number; type: string; chunks: Uint8Array[] }

/**
 * The regular files of a gzipped tarball whose path, without its first folder (GitHub's `<repo>-<commit>/`), starts with `prefix`, by
 * that path. Handles the ustar `prefix` field, pax `path` records (`x`) and GNU long names (`L`); global pax headers (`g`) are skipped.
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
    if (e.type === 'L') longName = new TextDecoder().decode(data).replace(/\0+$/, '')
    else if (e.type === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(data))
      if (m !== null) paxPath = m[1]
    } else if (e.keep) out.set(e.name, data)
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
        if (entry.keep || entry.type === 'L' || entry.type === 'x') entry.chunks.push(buf.slice(at, at + n))
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
      const size = parseInt(field(h, 124, 12).trim() || '0', 8)
      const type = field(h, 156, 1) || '0'
      const ustarPrefix = field(h, 257, 6).startsWith('ustar') ? field(h, 345, 155) : ''
      let name = paxPath ?? longName ?? (ustarPrefix === '' ? field(h, 0, 100) : `${ustarPrefix}/${field(h, 0, 100)}`)
      if (type !== 'x' && type !== 'L' && type !== 'g') {
        paxPath = undefined
        longName = undefined
      }
      name = name.slice(name.indexOf('/') + 1)
      const e: Entry = { name, keep: type === '0' && name.startsWith(prefix), size, got: 0, type, chunks: [] }
      if (size === 0) finish(e)
      else entry = e
    }
    buf = buf.slice(at)
  }

  const gunzip = createGunzip()
  const done = new Promise<void>((resolveDone, reject) => {
    gunzip.on('data', (c: Buffer) => take(new Uint8Array(c)))
    gunzip.on('end', () => resolveDone())
    gunzip.on('error', reject)
  })
  for await (const chunk of body) if (!gunzip.write(chunk)) await new Promise((r) => gunzip.once('drain', r))
  gunzip.end()
  await done
  return out
}

const sha256Of = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

/** The manifest of a set of files: `<path>` TAB `<sha256 of the file>` and a newline per file, sorted by path (code point). */
export function manifestOf(files: Map<string, Uint8Array>): string {
  return [...files.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((p) => `${p}\t${sha256Of(files.get(p)!)}\n`)
    .join('')
}
