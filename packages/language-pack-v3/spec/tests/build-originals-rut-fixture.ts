/**
 * Builds `data/originals-rut.langpack.zip`: a format 1.1 pack of the originals with Ruth 1:1-5 of the UHB and the MACULA Hebrew
 * rows of Ruth (real data, trimmed), for the case `macula-v2`. Unlike `build-originals-fixture.ts` its input is not in the repository:
 * it is the real `originals.langpack.zip` of `prepare-language` (release `v3.0.0#2026-08-14T18_44_01Z` of the UHB and
 * `3b8aa380e8#2026-10-15T02_19_35.000Z` of MACULA).
 *
 *     bun spec/tests/build-originals-rut-fixture.ts <originals.langpack.zip>
 *
 * The trimming: the chapter row of Ruth 1 keeps the USJ up to the end of verse 5 (chapter 0 and chapters 2-4 are left out and the
 * book row lists `[1]`); of the MACULA trees it keeps the sentences of verses 1-5 whole (each is inside one verse: 1:1 to 1:5) and of
 * the referents the verses 1:1 to 1:5, as the source has them (words included: the tables are indexed by verse and key, so the rest
 * is not read). Nothing is rewritten. The zip is deterministic: fixed UTC dates, no folder entries.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'

const OUT = join(import.meta.dir, 'data', 'originals-rut.langpack.zip')
const UHB = 'unfoldingWord/hbo/uhb'
const MACULA = 'Biblica/hbo/macula'
const LAST = 5
const FIXED = new Date('2026-10-29T17:59:54.331Z')
const nameOf = (key: string): string => encodeURIComponent(key).replace(/%/g, '~')

type Json = Record<string, any>

/** The content of a USJ chapter up to the end of verse `LAST`. */
function cut(content: Json[]): Json[] {
  const out: Json[] = []
  for (const item of content) {
    if (item.type !== 'para' || !Array.isArray(item.content)) {
      out.push(item)
      continue
    }
    const stop = item.content.findIndex((c: Json) => c.type === 'verse' && Number(c.number) > LAST)
    if (stop < 0) {
      out.push(item)
      continue
    }
    if (stop > 0) out.push({ ...item, content: item.content.slice(0, stop) })
    break
  }
  return out
}

/** The leaf numbers `CCCVVVWWW` of a tree. */
function leaves(node: unknown, into: number[]): void {
  if (typeof node === 'number') into.push(node)
  else if (Array.isArray(node)) for (const child of typeof node[0] === 'string' ? node.slice(1) : node) leaves(child, into)
}

export async function buildRutFixture(source: Uint8Array): Promise<Uint8Array> {
  const src = await JSZip.loadAsync(source)
  const lines = async (path: string): Promise<Json[]> => (await src.file(path)!.async('string')).split('\n').filter((l) => l !== '').map((l) => JSON.parse(l))
  const zip = new JSZip()
  const put = (path: string, text: string): void => void zip.file(path, text, { date: FIXED, createFolders: false })
  const jsonl = (rows: Json[]): string => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'

  const uhbRows = (await lines(`rows/sot/${nameOf(UHB)}.jsonl`)).filter((r) => r.key === `scripture-usj:${UHB}:rut` || r.key === `scripture-usj:${UHB}:rut:1`)
  for (const row of uhbRows) {
    if (row.key.endsWith(':rut')) row.entry.content.chapterNumbers = [1]
    else row.entry.content.usj.content = cut(row.entry.content.usj.content)
  }
  const maculaRows = (await lines(`rows/sot/${nameOf(MACULA)}.jsonl`)).filter((r) => r.key.endsWith('/RUT'))
  for (const row of maculaRows) {
    if (row.key.endsWith('/trees/RUT')) {
      row.entry.sentences = row.entry.sentences.filter((s: unknown) => {
        const ids: number[] = []
        leaves(s, ids)
        return ids.length > 0 && ids.every((id) => Math.floor(id / 1_000_000) === 1 && Math.floor(id / 1000) % 1000 <= LAST)
      })
    } else {
      row.entry.verses = Object.fromEntries(Object.entries(row.entry.verses).filter(([ref]) => ref.startsWith('1:') && Number(ref.slice(2)) <= LAST))
    }
  }
  const receipts = async (key: string): Promise<Json[]> => (await lines(`rows/receipt/${nameOf(key)}.jsonl`)).filter((r) => r.key === `resource:${key}`)

  put(`rows/receipt/${nameOf(UHB)}.jsonl`, jsonl(await receipts(UHB)))
  put(`rows/sot/${nameOf(UHB)}.jsonl`, jsonl(uhbRows))
  put(`rows/receipt/${nameOf(MACULA)}.jsonl`, jsonl(await receipts(MACULA)))
  put(`rows/sot/${nameOf(MACULA)}.jsonl`, jsonl(maculaRows))

  const real = JSON.parse(await src.file('manifest.json')!.async('string')) as Json
  const resources = (real.resources as Json[])
    .filter((r) => r.key === UHB || r.key === MACULA)
    .map((r) => ({ ...r, rows: r.key === UHB ? { receipt: 1, sot: uhbRows.length } : { receipt: 1, sot: maculaRows.length } }))
  const manifest = {
    format: 'bt-synergy-language-pack',
    formatVersion: '1.1.0',
    language: 'es-419',
    kind: 'originals',
    createdAt: FIXED.toISOString(),
    app: { name: 'resource-pipeline cli' },
    layers: ['receipt', 'sot'],
    versions: { sot: real.versions.sot },
    resources,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2) + '\n', { date: FIXED })
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } })
}

if (import.meta.main) {
  const path = process.argv[2]
  if (path === undefined) {
    console.error('usage: bun spec/tests/build-originals-rut-fixture.ts <originals.langpack.zip>')
    process.exit(2)
  }
  const bytes = await buildRutFixture(new Uint8Array(readFileSync(path)))
  writeFileSync(OUT, bytes)
  console.log(`originals-rut.langpack.zip: ${bytes.length} bytes`)
}
