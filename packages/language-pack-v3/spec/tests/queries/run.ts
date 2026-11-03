/**
 * Asks the fixed queries of this folder of a build and compares the answers with the independent ones.
 *
 *     bun spec/tests/queries/run.ts <out dir>
 *
 * (from `packages/language-pack-v3`). `<out dir>` is what `build-v3` wrote: `catalog-common.seg` and `segments/<id>.seg`. The queries are
 * asked of the common map alone (`README.md`): the `xmap` core and its parts named by the common catalog, with no language map. Every
 * `*.json` file here is answered by `answer` (`src/query/maps.ts`); the answer and `expected` are compared by their canonical text.
 * It prints one line per query, `<name>: ok` or `<name>: <first difference>`, and exits 0 when all are ok, 1 when one is not, 2 for a
 * usage error or a build that cannot be read.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hex, readSegment } from '../../../src/codec/container'
import type { MapSet } from '../../../src/query/maps'
import { answer } from '../../../src/query/maps'
import { catalogView } from '../../../src/read/catalog'
import { canonicalJson, KNOWN, type Json, sortKeys } from '../../../src/read/output'
import { xmapView } from '../../../src/read/xmap'
import { xtopicsView } from '../../../src/read/topics'
import type { XmapCore, XmapPart, XtopicsCore, XtopicsPart } from '../../../src/model'
import { firstDifference } from '../compare'

const QUERIES_DIR = import.meta.dir

const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(path))

/** The common map of a build: the core and the parts the common catalog lists, and the catalog's revision. */
export async function loadCommonMap(out: string): Promise<MapSet> {
  const catalogFile = join(out, 'catalog-common.seg')
  if (!existsSync(catalogFile)) throw new Error(`${catalogFile} does not exist: is ${out} a build folder?`)
  const { seg } = await readSegment(bytesOf(catalogFile), { known: KNOWN.catalog, expectedClass: 'catalog' })
  const catalog = catalogView(seg)
  let core: XmapCore | undefined
  const parts = new Map<string, XmapPart>()
  let xcore: XtopicsCore | undefined
  const xparts = new Map<string, XtopicsPart>()
  for (const entry of catalog.segments) {
    if (entry.class === 'xtopics') {
      const file = join(out, 'segments', `${hex(entry.id)}.seg`)
      const read = await readSegment(bytesOf(file), { known: KNOWN.xtopics, expectedClass: 'xtopics' })
      const view = xtopicsView(read.seg)
      if (view.part === 'core') xcore = view as XtopicsCore
      else xparts.set(view.part, view as XtopicsPart)
    }
    if (entry.class !== 'xmap') continue
    const file = join(out, 'segments', `${hex(entry.id)}.seg`)
    const read = await readSegment(bytesOf(file), { known: KNOWN.xmap, expectedClass: 'xmap' })
    const view = xmapView(read.seg)
    if (view.part === 'core') core = view as XmapCore
    else parts.set(view.part, view as XmapPart)
  }
  if (core === undefined) throw new Error('the common catalog lists no xmap core')
  return { xmap: { core, parts }, ...(xcore === undefined ? {} : { xtopics: { core: xcore, parts: xparts } }), revision: catalog.about.revision }
}

/** One line per query file: `ok`, or the first place the answer differs from `expected`. */
export async function runQueries(out: string, dir: string = QUERIES_DIR): Promise<{ lines: string[]; failed: number }> {
  const maps = await loadCommonMap(out)
  const lines: string[] = []
  let failed = 0
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { query: { kind: string }; expected?: Json }
    let line: string
    // A topic query needs the topics module (optional): a build without it cannot give the expected answer, so the query is not asked.
    if (maps.xtopics === undefined && ['topic', 'category'].includes(doc.query.kind)) {
      lines.push(`${name.replace(/\.json$/, '')}: skipped (the build has no xtopics)`)
      continue
    }
    try {
      const got = sortKeys(answer(maps, doc.query))
      const found = doc.expected === undefined ? ['$', got, undefined] : firstDifference(got, sortKeys(doc.expected))
      if (found === null) line = 'ok'
      else {
        const text = (v: Json | undefined): string => (v === undefined ? '<absent>' : canonicalJson(v).slice(0, 80))
        line = `${found[0]}: answer ${text(found[1])} / expected ${text(found[2])}`
      }
    } catch (error) {
      line = `error: ${error instanceof Error ? error.message : String(error)}`
    }
    if (line !== 'ok') failed++
    lines.push(`${name.replace(/\.json$/, '')}: ${line}`)
  }
  return { lines, failed }
}

if (import.meta.main) {
  const out = process.argv[2]
  if (out === undefined || process.argv.length > 3) {
    console.error('Usage: bun spec/tests/queries/run.ts <out dir>')
    process.exit(2)
  }
  try {
    const { lines, failed } = await runQueries(out)
    console.log(lines.join('\n'))
    console.log(failed === 0 ? `${lines.length} queries ok` : `${failed} of ${lines.length} queries differ`)
    process.exit(failed === 0 ? 0 : 1)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}
