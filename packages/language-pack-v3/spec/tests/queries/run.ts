/**
 * Asks the fixed queries of this folder of a build and compares the answers with the independent ones.
 *
 *     bun spec/tests/queries/run.ts <out dir>
 *
 * (from `packages/language-pack-v3`). `<out dir>` is what `build-v3` wrote: `catalog-common.seg` and `segments/<id>.seg`. The queries are
 * asked of the common map alone (`README.md`): the `xmap` core and its parts named by the common catalog, with no language map. Every
 * `*.json` file here is answered by `answer` (`src/query/maps.ts`); the answer and `expected` are compared by their canonical text.
 * It prints one line per query, `<name>: ok` or `<name>: <first difference>`, and exits 0 when all are ok, 1 when one is not, 2 for a
 * usage error or a build that cannot be read. A `phrase` query is asked of the `aligned:` units of `catalog-<lang>.seg`; a build without them skips it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hex, readSegment } from '../../../src/codec/container'
import type { MapSet } from '../../../src/query/maps'
import { answer } from '../../../src/query/maps'
import { catalogView } from '../../../src/read/catalog'
import { canonicalJson, KNOWN, type Json, sortKeys } from '../../../src/read/output'
import { alignedView } from '../../../src/read/aligned'
import type { AlignedSet } from '../../../src/query/aligned'
import { xmapView } from '../../../src/read/xmap'
import { xtopicsView } from '../../../src/read/topics'
import type { AlignedModel, XmapCore, XmapPart, XtopicsCore, XtopicsPart } from '../../../src/model'
import { firstDifference, withoutIgnoredRelations } from '../compare'

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

/**
 * The index of aligned phrases of a language in a build: the groups of the `aligned:` units of `catalog-<lang>.seg` and the parts whose
 * segment file is there. `undefined` when the build has no catalog of that language or its catalog lists no `aligned:` unit.
 */
export async function loadAlignedSet(out: string, lang: string): Promise<AlignedSet | undefined> {
  const catalogFile = join(out, `catalog-${lang}.seg`)
  if (!existsSync(catalogFile)) return undefined
  const { seg } = await readSegment(bytesOf(catalogFile), { known: KNOWN.catalog, expectedClass: 'catalog' })
  const catalog = catalogView(seg)
  const units = catalog.units.filter((u) => u.id.startsWith('aligned:'))
  if (units.length === 0) return undefined
  const groups = units.map((u) => u.id.slice('aligned:'.length))
  const parts = new Map<string, AlignedModel>()
  for (const unit of units) {
    for (const index of unit.segments) {
      const file = join(out, 'segments', `${hex(catalog.segments[index]!.id)}.seg`)
      if (!existsSync(file)) continue
      const view = alignedView((await readSegment(bytesOf(file), { known: KNOWN.aligned, expectedClass: 'aligned' })).seg, groups)
      parts.set(view.group, view)
    }
  }
  return { lang, groups, parts }
}

/** One line per query file: `ok`, or the first place the answer differs from `expected`. */
export async function runQueries(out: string, dir: string = QUERIES_DIR, requireTopics = false): Promise<{ lines: string[]; failed: number; skipped: number }> {
  const maps = await loadCommonMap(out)
  const lines: string[] = []
  const aligned = new Map<string, AlignedSet | undefined>()
  let failed = 0
  let skipped = 0
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { query: { kind: string }; expected?: Json; ignoreRelationsFrom?: string[] }
    let line: string
    // A topic query needs the topics module (optional): a build without it cannot give the expected answer, so the query is not asked.
    if (maps.xtopics === undefined && ['topic', 'category'].includes(doc.query.kind)) {
      // Asked for with `--topics`, a skipped query is a failure: a gate that expects every query to run must not pass without them
      if (requireTopics) failed++
      else skipped++
      lines.push(`${name.replace(/\.json$/, '')}: ${requireTopics ? 'failed' : 'skipped'} (the build has no xtopics)`)
      continue
    }
    // A phrase query needs the index of its language (optional units): a build without it cannot give the expected answer, so it is not asked.
    if (doc.query.kind === 'phrase') {
      const lang = String((doc.query as { lang?: unknown }).lang)
      if (!aligned.has(lang)) aligned.set(lang, await loadAlignedSet(out, lang))
      const set = aligned.get(lang)
      if (set === undefined) {
        skipped++
        lines.push(`${name.replace(/\.json$/, '')}: skipped (the build has no aligned index of ${lang})`)
        continue
      }
      maps.aligned = set
    }
    try {
      const got = withoutIgnoredRelations(sortKeys(answer(maps, doc.query)), doc.ignoreRelationsFrom)
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
  return { lines, failed, skipped }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const requireTopics = args.includes('--topics')
  const rest = args.filter((a) => a !== '--topics')
  const out = rest[0]
  if (out === undefined || rest.length > 1) {
    console.error('Usage: bun spec/tests/queries/run.ts <out dir> [--topics]')
    process.exit(2)
  }
  try {
    const { lines, failed, skipped } = await runQueries(out, QUERIES_DIR, requireTopics)
    console.log(lines.join('\n'))
    console.log(failed === 0 ? `${lines.length - skipped} queries ok, ${skipped} skipped` : `${failed} of ${lines.length} queries differ`)
    process.exit(failed === 0 ? 0 : 1)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}
