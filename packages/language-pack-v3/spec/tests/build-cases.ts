/**
 * Builds the conformance cases of `README.md` from their inputs and freezes them.
 *
 *     bun spec/tests/build-cases.ts [--refreeze] [--check]
 *
 * (from `packages/language-pack-v3`). Each case is a folder with its `.seg` or `.tcpack` files and, beside each file, a
 * `<name>.expected.json` with what the TypeScript reader says of it, in the form `README.md` ("Reader output") describes. The
 * container examples of `container/` come from `container/make_examples.py` and are not built here; cases 9 and 10 read
 * `container/minimal.seg` as an input.
 *
 * A case is frozen once both readers have given its expected output, so the script **refuses to overwrite** one: when a file exists
 * and the bytes now built differ, or an `.expected.json` exists and the output now read differs, it prints which and exits 1, and
 * writes nothing for that file. `--refreeze` writes the new bytes and outputs: use it when somebody has decided that the new ones are
 * right. `--check` writes nothing at all and also reports a missing file. Running it twice changes nothing: the build has no clock
 * (every date is fixed below), the registry is built in the script, and the builders are deterministic.
 *
 * The functions are exported for `src/conformance.test.ts` and `compare.ts`. The sample data is `data/` (see its README).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { deflateRaw } from 'pako'
import { bridgeZip } from '../../src/bridge/fromV2'
import { articleResources, artSegment, extractArticles } from '../../src/build/art'
import { bookSegment } from '../../src/build/book'
import { type BuiltSegment, buildCatalog, builtSegment } from '../../src/build/catalog'
import { BUILDER, buildCommon, buildLanguage, type LanguageBuild } from '../../src/build/language'
import { extractObs, obsSegment } from '../../src/build/obs'
import { extractOrig } from '../../src/build/orig'
import { encodeDeterministic } from '../../src/codec/cbor'
import { compareCodePoints } from '../../src/codec/columns'
import { FORMAT_MAJOR, FORMAT_MINOR, KIND_SEGMENT, readSegment, type Segment, writeSegment } from '../../src/codec/container'
import { verseId } from '../../src/ids'
import type { BookModel, HelpRow, TextModel } from '../../src/model'
import { partsSource } from '../../src/node/partsSource'
import { BOOK_TABLES, bookView } from '../../src/read/book'
import { CATALOG_TABLES, catalogView } from '../../src/read/catalog'
import { type Json, readerOutput, sortKeys } from '../../src/read/output'
import type { ResourceRef, Row, RowFilter, RowSource } from '../../src/source/rows'
import { writeTransfer } from '../../src/transfer'

export const TESTS_DIR = import.meta.dir
const DATA = join(TESTS_DIR, 'data')
const LIST = join(DATA, 'es-419', 'list.json')
const ORIGINALS_LIST = join(DATA, 'originals', 'list.json')
const PARTS = join(DATA, 'parts')
const ZIP = join(DATA, 'es-419-tit.langpack.zip')

const ES = 'es-419'
const GLT = 'es-419_gl/es-419/glt'
const TN = 'es-419_gl/es-419/tn'
const TW = 'es-419_gl/es-419/tw'

// Everything that would come from a clock or a machine is fixed here.
const NOW = '2026-11-01T10:00:00Z'
const ABOUT = { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: NOW, builder: BUILDER } as const
const DEVICE = 'test-device'
const MADE = NOW
const BY = 'build-cases 1'

const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(path))
const sample = () => partsSource({ list: LIST, partsDir: PARTS, originals: ORIGINALS_LIST })
const originalsOnly = () => partsSource({ list: ORIGINALS_LIST, partsDir: PARTS })

// The files of the cases

/** The `.seg` and `.tcpack` files under `root` (or the files that match `pattern`), as paths relative to it with `/`, sorted. `data/` is not a case. */
export function caseFilesOn(root: string, pattern: RegExp = /\.(seg|tcpack)$/): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (prefix === '' && entry.name === 'data') continue
        walk(join(dir, entry.name), `${prefix}${entry.name}/`)
      } else if (pattern.test(entry.name)) out.push(`${prefix}${entry.name}`)
    }
  }
  walk(root, '')
  return out.sort()
}

// Case 4 (and the language the other cases take from): the es-419 Titus of the sample, and case 13: the same book from the old pack

let languageBuild: Promise<LanguageBuild> | undefined
/** The language build of the sample: es-419 with Titus, the tW group `tw:kt` and the lexicon group `G0`. Built once. */
export function language(): Promise<LanguageBuild> {
  languageBuild ??= (async () => buildLanguage({ source: await sample(), lang: ES, registry: {}, about: ABOUT }))()
  return languageBuild
}

const bookOf = (segments: BuiltSegment[]): BuiltSegment => segments.find((s) => s.seg.h.class === 'book')!

let bridged: Promise<Awaited<ReturnType<typeof bridgeZip>>> | undefined
function bridge(): Promise<Awaited<ReturnType<typeof bridgeZip>>> {
  bridged ??= (async () => bridgeZip(bytesOf(ZIP), await originalsOnly(), DEVICE, NOW))()
  return bridged
}
/** Case 13: the book segment the bridge makes from the old pack. It is not stored: its bytes are those of case 4. */
export async function bridgeBook(): Promise<BuiltSegment> {
  return bookOf((await bridge()).segments)
}
/** Case 13: the local catalog the bridge makes from the old pack. */
export async function bridgeCatalog(): Promise<BuiltSegment> {
  return (await bridge()).catalog
}

// Case 5: Titus 1:1-4 and one note on 1:2-4

/**
 * The text up to the end of verse `lastVerse` of chapter 1: the pieces before the next verse's event, the events before it (a paragraph
 * the next verse would have started is dropped, the nodes still open are closed at the cut), and the alignment of the words that stay.
 */
function cutText(text: TextModel, lastVerse: number): TextModel {
  const stop = text.events.findIndex(([, kind, arg]) => kind === 'verse' && arg === String(lastVerse + 1))
  if (stop < 0) throw new Error(`The text ${text.res} has no verse ${lastVerse + 1}`)
  const at = text.events[stop][0]
  const events = text.events.slice(0, stop)
  while (events.length > 0 && events[events.length - 1][1] === 'open' && events[events.length - 1][0] === at) events.pop()
  let open = 0
  for (const [, kind] of events) open += kind === 'open' ? 1 : kind === 'close' ? -1 : 0
  for (let i = 0; i < open; i++) events.push([at, 'close', ''])

  const pieces = text.pieces.slice(0, at)
  const words = pieces.filter(([, isWord]) => isWord).length
  const out: TextModel = { res: text.res, pieces, events }
  const attrs = Object.entries(text.attrs ?? {}).filter(([event]) => Number(event) < events.length)
  if (attrs.length > 0) out.attrs = Object.fromEntries(attrs)
  if (text.align !== undefined) out.align = text.align.slice(0, words)
  const missing = (text.alignMissing ?? []).filter(([word]) => word < words)
  if (missing.length > 0) out.alignMissing = missing
  return out
}

async function noteOnSeveralVerses(): Promise<Uint8Array> {
  const { seg } = await readSegment(bookOf((await language()).segments).bytes, { known: BOOK_TABLES })
  const full = bookView(seg)
  const glt = cutText(full.texts.find((t) => t.res === GLT)!, 4)

  // The quote: the first three original words the words of verse 2 translate, as the real notes point at them.
  const verse2 = glt.events.find(([, kind, arg]) => kind === 'verse' && arg === '2')![0]
  const firstWord = glt.pieces.slice(0, verse2).filter(([, isWord]) => isWord).length
  const positions = [...new Set((glt.align ?? []).slice(firstWord).flat())].sort((a, b) => a - b).slice(0, 3)
  if (positions.length < 3) throw new Error('Verse 2 has fewer than three aligned words')
  const orig = await extractOrig(await originalsOnly(), 'tit')

  const note: HelpRow = {
    id: 'f3a9',
    ref: '1:2-4',
    from: verseId('tit', 1, 2),
    to: verseId('tit', 1, 4),
    concept: 'ta:translate/figs-metaphor',
    cols: {
      isIntro: false,
      note: 'Pablo habla de la esperanza como si fuera una cosa que se puede tener en las manos.\nEs una metáfora.',
      quote: positions.map((p) => orig.words[p].form).join(' '),
      tags: '',
    },
    quote: positions,
  }
  const model: BookModel = {
    lang: ES,
    book: 'tit',
    orig: full.orig,
    res: full.res.filter(([key]) => key === GLT || key === TN),
    texts: [glt],
    notes: { res: TN, rows: [note] },
  }
  return (await writeSegment(bookSegment(model))).bytes
}

// Cases 7 and 8: articles

const TW_REF: ResourceRef = { key: TW, stamp: 'v37#2024-07-17T20_12_37Z', kind: 'Translation Words', books: [] }

/** A source with one tW resource that has these articles (`path` like `kt/grace`) and the title rows of the ones that give a title. */
function twSource(items: { path: string; md: string; title?: string }[]): RowSource {
  const rows: Row[] = []
  for (const { path, md, title } of items) {
    rows.push({ layer: 'sot', key: `${TW}/bible/${path}`, value: md })
    if (title !== undefined) rows.push({ layer: 'text', key: `helps-text:tw-title:${TW}@${TW_REF.stamp}:${path}`, value: { content: title, version: 1 } })
  }
  return {
    async resources() {
      return [TW_REF]
    },
    async *rows(f: RowFilter) {
      if (f.resource !== undefined && f.resource !== TW) return
      for (const row of rows) if (f.layer === undefined || row.layer === f.layer) yield row
    },
  }
}

async function artFile(source: RowSource, registry: Record<string, never> | Awaited<ReturnType<typeof extractArticles>>['registry']) {
  const { groups, registry: next } = await extractArticles(source, ES, registry, [])
  const articles = groups.get('tw:kt')!
  const seg: Segment = artSegment(ES, 'tw:kt', articleResources(articles, [TW_REF]), articles)
  return { bytes: (await writeSegment(seg)).bytes, articles, registry: next }
}

const sidsOf = (articles: { sections: { sid: string }[] }[]): string[] => articles[0].sections.map((s) => s.sid)
function expectSids(what: string, got: string[], want: string[]): void {
  if (got.join() !== want.join()) throw new Error(`${what}: the sections are ${got.join(', ')} and the case says ${want.join(', ')}`)
}

/** Case 7: one article built twice with the registry in between. The second time a section is inserted and a heading is corrected. */
async function sectionInserted(): Promise<{ build1: Uint8Array; build2: Uint8Array }> {
  const intro = '# gracia, amable\n\nLa gracia es un favor que se da sin que se haya ganado.'
  const definition = 'La palabra gracia se refiere a la ayuda que se da a quien no la merece, con generosidad y sin esperar nada a cambio.'
  const suggestions = '## Sugerencias de traducción\n\nOtras formas de traducir la palabra gracia son favor, bondad y generosidad.'
  const first = `${intro}\n\n## Definition\n\n${definition}\n\n${suggestions}`
  const second = `${intro}\n\n## Definición\n\n${definition}\n\n## Ejemplos de las historias bíblicas\n\nUn ejemplo de una historia en la que se ve la gracia de Dios.\n\n${suggestions}`

  const one = await artFile(twSource([{ path: 'kt/grace', md: first, title: 'gracia, amable' }]), {})
  expectSids('case 7, first build', sidsOf(one.articles), ['intro', 'definition', 'translation-suggestions'])
  const two = await artFile(twSource([{ path: 'kt/grace', md: second, title: 'gracia, amable' }]), one.registry)
  expectSids('case 7, second build', sidsOf(two.articles), ['intro', 'definition', 'examples', 'translation-suggestions'])
  return { build1: one.bytes, build2: two.bytes }
}

/** Case 8: an es-419 article with text before any heading, a heading no rule places and a section whose heading is in English. */
async function badlyTitled(): Promise<Uint8Array> {
  const md = [
    '# fe',
    'Este texto está antes de cualquier encabezado.',
    '## Definición',
    'La fe es confiar en alguien.',
    '## Un encabezado que ninguna regla coloca',
    'Un texto bajo un encabezado desconocido.',
    '## Translation Suggestions',
    'This section is written in English in an article of es-419.',
  ].join('\n\n')
  const { bytes, articles } = await artFile(twSource([{ path: 'kt/faith', md, title: 'fe' }]), {})
  const roles = articles[0].sections.map((s) => `${s.sid}:${s.role}:${s.lang}`).join()
  if (roles !== 'intro:intro:es-419,definition:definition:es-419,s1:unknown:es-419,translation-suggestions:translation-suggestions:en') {
    throw new Error(`case 8: the sections are ${roles}`)
  }
  return bytes
}

// Case 9: tables a reader does not know

/** Case 1 with one more table, listed in `h.tables` and present in `t`. */
async function withTable(name: string, required: boolean): Promise<Uint8Array> {
  const { seg } = await readSegment(bytesOf(join(TESTS_DIR, 'container', 'minimal.seg')), { known: BOOK_TABLES })
  const table = { rows: [1, 2, 3], what: 'a table a later version of the format adds' }
  return (await writeSegment({ h: { ...seg.h, tables: { ...seg.h.tables, [name]: [1, required] } }, t: { ...seg.t, [name]: table } })).bytes
}

// Case 10: a transfer file cut inside its last entry

/** A file the test suite stores as it is, made a `BuiltSegment` so that a transfer file can carry it. */
async function storedSegment(path: string): Promise<BuiltSegment> {
  const bytes = bytesOf(path)
  const { seg, id } = await readSegment(bytes, { known: BOOK_TABLES })
  return { seg, bytes, id, inputs: '0'.repeat(64) }
}

/** `bytes` without the second half of the last entry it holds, whose size is `size`. */
const cutMiddleOfLast = (bytes: Uint8Array, size: number): Uint8Array => bytes.subarray(0, bytes.length - Math.floor(size / 2))

async function cutTransfer(): Promise<Uint8Array> {
  const built = await language()
  const book = bookOf(built.segments)
  const languageCatalog = catalogView((await readSegment(built.catalog.bytes, { known: CATALOG_TABLES })).seg)
  const used = new Set(book.seg.h.res!.map(([key]) => key))
  const needs = languageCatalog.units.find((unit) => unit.id === 'book:tit')!.needs ?? []
  const catalog = await buildCatalog({
    about: { ...ABOUT, catalog: ES },
    resources: languageCatalog.resources.filter((resource) => used.has(resource.key)),
    segments: [book],
    needs: () => needs,
  })
  // Case 1 travels beside case 4's segment, and the catalog does not list it.
  const minimal = await storedSegment(join(TESTS_DIR, 'container', 'minimal.seg'))
  const whole = writeTransfer({ mode: 'full', catalogs: [catalog], entries: [minimal, book], made: MADE, by: BY })
  return cutMiddleOfLast(whole, book.bytes.length)
}

// Case 14: an integer out of range in a key the reader does not know

/** CBOR for 2^60, which is above 2^53 - 1: the encoder refuses it, so the bytes are written here. */
const TWO_POW_60 = Uint8Array.of(0x1b, 0x10, 0, 0, 0, 0, 0, 0, 0)
/** CBOR for -2^53, one below -(2^53 - 1). */
const MINUS_TWO_POW_53 = Uint8Array.of(0x3b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)

const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}

/** A CBOR map (fewer than 24 keys) from already encoded values, the keys in the order of the bytes of their encoding. */
function rawMap(entries: [string, Uint8Array][]): Uint8Array {
  const pairs = entries.map(([key, value]) => ({ key: encodeDeterministic(key), value })).sort((a, b) => compareBytes(a.key, b.key))
  const parts = [Uint8Array.of(0xa0 | pairs.length), ...pairs.flatMap((pair) => [pair.key, pair.value])]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** A segment file for these exact body bytes, with one more key in the file header: `extra` is its name and its encoded value. */
async function fileOfBody(h: Uint8Array, body: Uint8Array, extra?: [string, Uint8Array]): Promise<Uint8Array> {
  const compressed = deflateRaw(body, { level: 9 })
  const id = new Uint8Array(await crypto.subtle.digest('SHA-256', body as Uint8Array<ArrayBuffer>))
  const entries: [string, Uint8Array][] = [
    ['h', h],
    ['codec', encodeDeterministic('deflate-raw')],
    ['clen', encodeDeterministic(compressed.length)],
    ['ulen', encodeDeterministic(body.length)],
    ['id', encodeDeterministic(id)],
  ]
  if (extra !== undefined) entries.push(extra)
  const header = rawMap(entries)
  const out = new Uint8Array(12 + header.length + compressed.length)
  out.set([0x89, 0x54, 0x4c, 0x50, FORMAT_MAJOR, FORMAT_MINOR, KIND_SEGMENT, 0])
  new DataView(out.buffer).setUint32(8, header.length)
  out.set(header, 12)
  out.set(compressed, 12 + header.length)
  return out
}

/**
 * Case 14: case 1 twice. `header.seg` has a key `x` in its file header holding 2^60, and `body.seg` a root key `x` in its body holding
 * -2^53: the reader does not know either key, and an integer outside -(2^53 - 1) .. 2^53 - 1 is rejected anywhere (`container.md`):
 * `E_HEADER` for the first, `E_BODY` for the second.
 */
async function integerOutOfRange(): Promise<{ header: Uint8Array; body: Uint8Array }> {
  const { seg } = await readSegment(bytesOf(join(TESTS_DIR, 'container', 'minimal.seg')), { known: BOOK_TABLES })
  const h = encodeDeterministic(seg.h as never)
  const t = encodeDeterministic(seg.t)
  return {
    header: await fileOfBody(h, rawMap([['h', h], ['t', t]]), ['x', TWO_POW_60]),
    body: await fileOfBody(h, rawMap([['h', h], ['t', t], ['x', MINUS_TWO_POW_53]])),
  }
}

// All the frozen cases

/** The bytes of every frozen file the script builds, by path relative to `spec/tests`. The files of `container/` are not among them. */
export async function buildFrozenCases(): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>()
  out.set('tito-es419/book.seg', bookOf((await language()).segments).bytes)
  out.set('nota-varios-versiculos/book.seg', await noteOnSeveralVerses())
  const { build1, build2 } = await sectionInserted()
  out.set('seccion-insertada/build1.seg', build1)
  out.set('seccion-insertada/build2.seg', build2)
  out.set('articulo-mal-titulado/art.seg', await badlyTitled())
  out.set('tabla-desconocida/future-x.seg', await withTable('future-x', false))
  out.set('tabla-desconocida/future-y.seg', await withTable('future-y', true))
  out.set('transferencia-cortada/cut.tcpack', await cutTransfer())
  out.set('paquete-viejo/catalog.seg', (await bridgeCatalog()).bytes)
  const outOfRange = await integerOutOfRange()
  out.set('entero-fuera-de-rango/header.seg', outOfRange.header)
  out.set('entero-fuera-de-rango/body.seg', outOfRange.body)
  return out
}

// Expected output

/** The canonical text of `item` indented by two spaces from `pad`, as Python's `json.dumps(item, sort_keys=True, indent=2, ensure_ascii=False)` writes it. */
function indented(item: Json, pad: string): string {
  if (typeof item === 'string') return JSON.stringify(item)
  if (typeof item === 'number' || typeof item === 'boolean') return String(item)
  const inner = `${pad}  `
  if (Array.isArray(item)) return item.length === 0 ? '[]' : `[\n${item.map((value) => `${inner}${indented(value, inner)}`).join(',\n')}\n${pad}]`
  const keys = Object.keys(item).sort(compareCodePoints)
  return keys.length === 0 ? '{}' : `{\n${keys.map((key) => `${inner}${JSON.stringify(key)}: ${indented(item[key], inner)}`).join(',\n')}\n${pad}}`
}

/**
 * The text of an `expected.json`: the reader output in the canonical text indented by two spaces (keys sorted by code point, UTF-8 not
 * escaped), with a final line feed; an error object on one line, `{"error": "E_ID"}`. The same bytes as `lp3read.py` prints.
 */
export function expectedText(output: unknown): string {
  const data = sortKeys(output)
  if (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 1 && 'error' in data) return `{"error": ${JSON.stringify(data.error)}}\n`
  return `${indented(data, '')}\n`
}

const expectedName = (name: string): string => name.replace(/\.(seg|tcpack)$/, '.expected.json')

// Writing and checking

export type Report = { written: string[]; problems: string[] }

const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b))

/**
 * Builds the frozen cases and writes them under `root` (default: `spec/tests`). A file that exists and differs from what is now built
 * is a problem and is not touched, unless `refreeze`; with `check` nothing is written, and a file that does not exist is a problem too.
 * `written` lists what was written, `problems` what was refused or is missing. Nothing is written for a file that is already as built.
 */
export async function runBuildCases(o: { root?: string; refreeze?: boolean; check?: boolean } = {}): Promise<Report> {
  const root = o.root ?? TESTS_DIR
  const report: Report = { written: [], problems: [] }
  const put = (name: string, data: Uint8Array | string, existing: Uint8Array | undefined, what: string): void => {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    if (existing !== undefined && same(existing, bytes)) return
    if (o.check === true || (existing !== undefined && o.refreeze !== true)) {
      report.problems.push(
        existing === undefined
          ? `${name}: missing (run bun spec/tests/build-cases.ts)`
          : `${name}: frozen, and ${what} now gives other ${typeof data === 'string' ? 'output' : 'bytes'} (${existing.length} bytes on disk, ${bytes.length} now); run with --refreeze to freeze the new ones`,
      )
      return
    }
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), bytes)
    report.written.push(name)
  }
  for (const [name, bytes] of await buildFrozenCases()) {
    const onDisk = (path: string): Uint8Array | undefined => (existsSync(join(root, path)) ? bytesOf(join(root, path)) : undefined)
    put(name, bytes, onDisk(name), 'the builders')
    const expected = expectedName(name)
    put(expected, expectedText(await readerOutput(bytes)), onDisk(expected), 'the TypeScript reader')
  }
  return report
}

// The big segments of the sample, for the cross-reader check (`compare.ts --built`): not frozen, no expected file

/** A synthetic Open Bible Story and one note on it, in the shapes the loaders write (`src/build/obs.test.ts`). */
async function obsOfStory(): Promise<BuiltSegment> {
  const OBS = 'unfoldingWord/en/obs'
  const OBS_TN = 'unfoldingWord/en/obs-tn'
  const ref = (key: string, kind: string, stamp: string): ResourceRef => ({ key, stamp, kind, books: [] })
  const refs = [ref(OBS, 'Open Bible Stories', 'v12#2026-01-01T00_00_00Z'), ref(OBS_TN, 'TSV OBS Translation Notes', 'v7#2026-01-02T00_00_00Z')]
  const story = (nn: string, content: Record<string, unknown>): Row => ({ layer: 'sot', key: `obs:${OBS}:${nn}`, value: { content, timestamp: 1, resourceKey: OBS, storyId: nn } })
  const rows: Row[] = [
    story('10', {
      storyNumber: 10,
      title: '10. The plagues',
      sourceReference: 'A Bible story from: Exodus 5-14',
      frames: [
        { frameNumber: 1, imageUrl: 'https://cdn.door43.org/obs/jpg/360px/obs-en-10-01.jpg', text: 'God sent plagues.' },
        { frameNumber: 2, imageUrl: '', text: 'Pharaoh did not listen.' },
      ],
    }),
    story('01', { storyNumber: 1, title: '1. The Creation', sourceReference: null, frames: [{ frameNumber: 1, imageUrl: 'u1', text: 'In the beginning.' }] }),
    {
      layer: 'sot',
      key: `tn:${OBS_TN}:obs:10`,
      value: {
        content: {
          notes: [
            { reference: '10:3', id: 'ab12', tags: '', supportReference: 'rc://*/ta/man/translate/figs-metaphor', quote: 'hardened', occurrence: '1', note: 'A figure.\\nSee [[rc://*/ta/man/translate/figs-simile]].<br>End' },
            { reference: '10:03', id: 'cd34', tags: 'x', supportReference: '', quote: '', occurrence: '0', note: 'padded' },
          ],
        },
        metadata: {},
      },
    },
  ]
  const source: RowSource = {
    async resources() {
      return refs
    },
    async *rows(f: RowFilter) {
      for (const row of rows) {
        const owner = row.key.startsWith('obs:') ? OBS : OBS_TN
        if ((f.resource === undefined || f.resource === owner) && (f.layer === undefined || f.layer === row.layer)) yield row
      }
    },
  }
  const model = await extractObs(source, 'en', [])
  if (model === null) throw new Error('The synthetic story gave no Open Bible Stories')
  return builtSegment(obsSegment(model), '1'.repeat(64))
}

/**
 * Big segments of the sample, built in memory: the Titus original, the `tw:kt` art group, the lexicon group `G0`, the language catalog,
 * the common catalog, an OBS segment from a synthetic story, and a `full` transfer file of them, whole (`full.tcpack`) and cut in the
 * middle of its last entry (`full-cut.tcpack`). By file name.
 */
export async function buildBigSegments(): Promise<Map<string, Uint8Array>> {
  const built = await language()
  const common = await buildCommon({ source: await originalsOnly(), about: ABOUT })
  const byClass = (cls: string) => built.segments.find((s) => s.seg.h.class === cls)!
  const orig = common.segments[0]
  const obs = await obsOfStory()
  const art = byClass('art')
  const lex = byClass('lex')

  const out = new Map<string, Uint8Array>()
  out.set('orig-tit.seg', orig.bytes)
  out.set('art-tw-kt.seg', art.bytes)
  out.set('lex-G0.seg', lex.bytes)
  out.set('catalog-es-419.seg', built.catalog.bytes)
  out.set('catalog-common.seg', common.catalog.bytes)
  out.set('obs.seg', obs.bytes)
  const whole = writeTransfer({ mode: 'full', catalogs: [built.catalog, common.catalog], entries: [orig, obs, art, lex], made: MADE, by: BY })
  out.set('full.tcpack', whole)
  out.set('full-cut.tcpack', cutMiddleOfLast(whole, lex.bytes.length))
  return out
}

// Command line

async function main(args: string[]): Promise<number> {
  const unknown = args.filter((arg) => arg !== '--refreeze' && arg !== '--check')
  if (unknown.length > 0) {
    console.error(`usage: bun spec/tests/build-cases.ts [--refreeze] [--check]   (unknown: ${unknown.join(' ')})`)
    return 2
  }
  const report = await runBuildCases({ refreeze: args.includes('--refreeze'), check: args.includes('--check') })
  for (const name of report.written) console.log(`written ${name}`)
  for (const problem of report.problems) console.error(problem)
  console.log(report.problems.length === 0 ? `ok: ${report.written.length} files written` : `${report.problems.length} problems: nothing was changed for them`)
  return report.problems.length === 0 ? 0 : 1
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))

