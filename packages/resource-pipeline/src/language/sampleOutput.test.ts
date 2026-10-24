/**
 * Packs are filed by a compatibility key made of every processing version (PACK_VERSIONS): a phone only opens packs
 * whose key it knows. A builder change that alters the rows but not a version would put new rows in an old folder and
 * no phone would ever fetch the fix. This test keeps a hash of the quote and align rows and of the prepared
 * chapters (full and light) of a fixed sample (Ruth 4:5, with its Q footnote) next to the key it was made under, and fails when the hash moves and the key does not.
 *
 * Parts raise the stakes: a part whose inputs did not change is carried from the last list, bytes and all, so an output
 * change under the same parts key would never reach it. A second hash covers the sample as parts (their bytes, under
 * keys shaped as the build writes them), where rows go (slots, bucket counts) and the fingerprint rules. It also covers
 * every part of the parts fixture (partsFixture.ts, OBS on) as the real build writes them: each layer of each kind of
 * resource made by its real producer (loaders, parsers, preparers, quotes, alignments, titles, lexicons, MACULA). Those
 * rows may change only with the parts code (`partsCode`: the parts compat key and every row-producing code version),
 * which is in every fingerprint, so a bump rebuilds what was carried.
 */

import 'fake-indexeddb/auto'
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FINGERPRINT_VERSION,
  LEXICON_RANGE,
  OBS_STORIES_PER_PART,
  PACK_FORMAT_VERSION,
  PARTS_FORMAT_VERSION,
  TA_TRANSLATE_BUCKETS,
  TW_BUCKETS,
  compatKeyOf,
  fingerprintOf,
  lexiconGroupOf,
  partInputs,
  partPath,
  readPart,
  slotId,
  slotOfRow,
  taGroupOf,
  twGroupOf,
  unitInputs,
  writePart,
  type PackLayer,
  type PartRow,
  type PartSlot,
  type ResourceFiles,
} from '@bt-synergy/language-pack'
import { RESOURCE_TYPE_IDS } from '@bt-synergy/resource-catalog'
import { writeCachedAlignments } from '../helps/helpsAlignCache'
import { buildQuoteTokens } from '../helps/quoteTokens/buildQuoteTokens'
import { readCachedQuoteTokens, toCachedQuoteTokens, writeCachedQuoteTokens } from '../helps/helpsQuoteCache'
import { compactFromAlignResult } from '../helps/reconstructAlignFromPositions'
import { writePreparedUnit } from '../prepare/prepareCache'
import { SCRIPTURE_PREPARE_VERSION, buildFullChapter, buildLightChapter } from '../scripture/scripturePreparer'
import { DYA3, UT23, alignWarm, link, ruth } from '../helps/ketivQere.fixtures'
import { MACULA_KEYS } from '../../cli/companions'
import { buildLanguageParts } from './buildLanguageParts'
import { PACK_VERSIONS } from './packVersions'
import { partsCode, partsCodeVersions } from './partsCode'
import * as fixture from './partsFixture'

const SAMPLE_FILE = join(import.meta.dir, 'sample-output.json')

// A single-part row (a word-list link) beside the two multi-part, qere-quoting notes.
const TWL1 = link('twl1', 'הַ⁠שָּׂדֶ֖ה')
const LINKS = [UT23, DYA3, TWL1]

// Fields that differ from one run to the next; none of the rows below has one today, the filter keeps it so.
const VOLATILE = new Set(['createdAt', 'updatedAt', 'expiresAt', 'timestamp', 'cachedAt'])

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && !VOLATILE.has(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function sampleRows() {
  const { uhb, glt, original } = await ruth()

  // Quote rows go through the cache as the app writes and reads them.
  const store = new Map<string, unknown>()
  const cache = {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => void store.set(k, JSON.parse(JSON.stringify(v))),
  }
  const where = { helpsKey: 'sample/tn', helpsStamp: 's', olKey: 'sample/uhb', olStamp: 's', book: 'rut', chapter: 4 }
  const built = Object.fromEntries(
    LINKS.map((l) => [l.id, toCachedQuoteTokens(buildQuoteTokens({ link: l, originalChapters: [original], bookCode: 'RUT' }))])
  )
  await writeCachedQuoteTokens(cache, where, built)
  const quote = await readCachedQuoteTokens(cache, where)

  // The prepared tier is what an app reads without rebuilding (Servos): its shape is guarded by the same key.
  const prepared = {
    uhb: { full: buildFullChapter(uhb.viewModel, 4), light: buildLightChapter(uhb.viewModel, 4) },
    glt: { full: buildFullChapter(glt.viewModel, 4), light: buildLightChapter(glt.viewModel, 4) },
  }

  const align: Record<string, Record<string, unknown>> = {}
  for (const [target, viewModel, language] of [
    ['uhb', uhb.viewModel, 'hbo'],
    ['glt', glt.viewModel, 'es-419'],
  ] as const) {
    const rows: Record<string, unknown> = {}
    for (const r of alignWarm(LINKS, original, viewModel, language)) {
      rows[r.id] = compactFromAlignResult({
        alignedTokens: r.alignedTokens,
        quoteTokens: (quote?.[r.id] ?? []) as never,
        bookCode: 'rut',
        chapter: 4,
        verse: 5,
        occurrence: '1',
      })
    }
    align[target] = rows
  }
  return { quote, align, prepared }
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

// Resources and stamps as the parts build of the fixture (partsFixture.ts) writes them: content stamps (`g` + blob).
const TN = { key: 'test_gl/es-419/tn', type: 'notes', subject: 'TSV Translation Notes' }
const GLT = { key: 'test_gl/es-419/glt', type: 'scripture', subject: 'Aligned Bible' }
const UHB = { key: 'unfoldingWord/hbo/uhb', type: 'scripture', subject: 'Hebrew Old Testament' }
const TW = { key: 'test_gl/es-419/tw', type: 'words', subject: 'Translation Words' }
const TA = { key: 'test_gl/es-419/ta', type: 'academy', subject: 'Translation Academy' }
const UHL = { key: 'test_gl/es-419/uhl', type: 'lexicon', subject: 'Hebrew Lexicon' }
const OBS = { key: 'test_gl/es-419/obs', type: 'obs', subject: 'Open Bible Stories' }
const MACULA = { key: 'Biblica/hbo/macula', type: 'original-syntax', subject: 'Original Language Syntax' }
const TN_STAMP = 'g6f3a7923c2'
const UHB_STAMP = 'g85210dc7b8+2.3.0-usj'
const GLT_STAMP = 'g0411ad34d0+6000230'

/** Where rows of each kind go: one key of every slot rule, as the build writes them. */
const SLOTTED: Array<[{ key: string; type: string; subject: string }, PackLayer, string]> = [
  [TN, 'sot', `tn:${TN.key}:rut:1`],
  [TN, 'prepared', `prepared:notes:${TN.key}:rut:1:full`],
  [TN, 'quote', `helps-quote:${TN.key}@${TN_STAMP}:${UHB.key}@${UHB_STAMP}:rut:1`],
  [TN, 'align', `helps-align:${TN.key}@${TN_STAMP}:${UHB.key}@${UHB_STAMP}:${GLT.key}@${GLT_STAMP}:rut:1`],
  [GLT, 'sot', `scripture-usj:${GLT.key}:rut`],
  [UHB, 'prepared', `prepared:scripture:${UHB.key}:rut:1:full`],
  [TW, 'sot', `${TW.key}/bible/kt/faith`],
  [TW, 'sot', `${TW.key}/bible/names/naomi`],
  [TW, 'prepared', `prepared:words:${TW.key}:bible/kt/faith:bible/kt/faith:full`],
  [TW, 'text', `helps-text:tw-title:${TW.key}@v12#2026-09-01T00_00_00Z:kt/faith`],
  [TA, 'sot', `${TA.key}/translate/figs-hyperbole`],
  [TA, 'prepared', `prepared:academy:${TA.key}:translate/figs-idiom:translate/figs-idiom:full`],
  [TA, 'sot', `${TA.key}/checking/acceptable`],
  [TA, 'text', `helps-text:ta-title:${TA.key}@v12#2026-09-01T00_00_00Z:translate/figs-idiom`],
  [UHB, 'sot', `scripture-usj:${UHB.key}:rut`],
  [MACULA, 'sot', `${MACULA.key}/trees/RUT`],
  [MACULA, 'sot', `${MACULA.key}/referents/RUT`],
  [UHL, 'sot', `${UHL.key}/content/H1961.json`],
  [UHL, 'sot', `${UHL.key}/domains/12.json`],
  [OBS, 'sot', `obs:${OBS.key}:12`],
]

/** The sample as parts, where rows go, the bucket counts and a fixed fingerprint: what a carried part must agree on. */
async function sampleParts() {
  const { uhb, glt, original } = await ruth()
  const store = new Map<string, unknown>()
  const cache = {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => void store.set(k, JSON.parse(JSON.stringify(v))),
  }
  const where = { helpsKey: TN.key, helpsStamp: TN_STAMP, olKey: UHB.key, olStamp: UHB_STAMP, book: 'rut', chapter: 4 }
  const built = Object.fromEntries(
    LINKS.map((l) => [l.id, toCachedQuoteTokens(buildQuoteTokens({ link: l, originalChapters: [original], bookCode: 'RUT' }))])
  )
  await writeCachedQuoteTokens(cache, where, built)
  const quote = await readCachedQuoteTokens(cache, where)
  const aligned: Record<string, unknown> = {}
  for (const r of alignWarm(LINKS, original, glt.viewModel, 'es-419')) {
    aligned[r.id] = compactFromAlignResult({
      alignedTokens: r.alignedTokens,
      quoteTokens: (quote?.[r.id] ?? []) as never,
      bookCode: 'rut',
      chapter: 4,
      verse: 5,
      occurrence: '1',
    })
  }
  await writeCachedAlignments(cache, { ...where, targetKey: GLT.key, targetStamp: GLT_STAMP }, aligned as never)
  for (const [r, viewModel] of [
    [GLT, glt.viewModel],
    [UHB, uhb.viewModel],
  ] as const) {
    await writePreparedUnit(cache, RESOURCE_TYPE_IDS.SCRIPTURE, r.key, 'rut', 4, 'full', SCRIPTURE_PREPARE_VERSION, buildFullChapter(viewModel, 4))
    await writePreparedUnit(cache, RESOURCE_TYPE_IDS.SCRIPTURE, r.key, 'rut', 4, 'light', SCRIPTURE_PREPARE_VERSION, buildLightChapter(viewModel, 4))
  }

  // Each row in the part slotOfRow gives it, and each part's bytes as writePart makes them.
  const layerOf = (key: string): PackLayer => (key.startsWith('helps-quote:') ? 'quote' : key.startsWith('helps-align:') ? 'align' : 'prepared')
  const byPart = new Map<string, PartRow[]>()
  for (const [key, value] of store) {
    const layer = layerOf(key)
    const resource = [TN, GLT, UHB].find((r) => slotOfRow({ layer, key }, r))!
    const id = slotId(slotOfRow({ layer, key }, resource)!)
    byPart.set(id, [...(byPart.get(id) ?? []), { layer, key, value }])
  }
  const parts: Record<string, string> = {}
  for (const [id, rows] of [...byPart].sort(([a], [b]) => (a < b ? -1 : 1))) parts[id] = (await writePart(rows)).sha256

  const slots = SLOTTED.map(([r, layer, key]) => [key, slotOfRow({ layer, key }, r) && slotId(slotOfRow({ layer, key }, r)!)])
  const buckets = { TW_BUCKETS, TA_TRANSLATE_BUCKETS, LEXICON_RANGE, OBS_STORIES_PER_PART, FINGERPRINT_VERSION }
  // The golden input of fingerprint.test.ts in language-pack.
  const fingerprint = await fingerprintOf({
    code: 'f2.0-u2.3.0-p6000230-q9-a12-t1',
    id: 'book:test_gl/es-419/tn:rut',
    inputs: {
      files: [
        ['test_gl/es-419/tn', 'tn_RUT.tsv', 'ce013625030ba8dba906f756967f9e9ca394464a'],
        ['unfoldingWord/hbo/uhb', '08-RUT.usfm', 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'],
      ],
      manifests: [['test_gl/es-419/tn', '2acd14c15af65b9062bf6a32dba51ec43828f8a7e835d4b473a73d46d4b86f85']],
      stamps: [],
    },
  })
  return { parts, slots, buckets, fingerprint, inputs: inputsGolden() }
}

/** Which files each kind of part and both kinds of unit read, over a small context: the rules the fingerprints follow. */
function inputsGolden() {
  const files = (entries: Record<string, number>) => new Map(Object.entries(entries).map(([path, n]) => [path, n.toString(16).padStart(40, '0')]))
  const stamp = 'v12#2026-09-01T00:00:00Z'
  const manifest = 'a'.repeat(64)
  const resources: ResourceFiles[] = [
    { ...TN, stamp, manifest, files: files({ 'tn_RUT.tsv': 1, 'tn_JON.tsv': 2, 'README.md': 3, 'manifest.yaml': 4 }), books: { rut: './tn_RUT.tsv', jon: './tn_JON.tsv' } },
    { ...GLT, stamp, manifest, files: files({ '08-RUT.usfm': 5, 'LICENSE.md': 6 }), books: { rut: './08-RUT.usfm' } },
    { ...UHB, stamp, manifest, files: files({ '08-RUT.usfm': 7 }), books: { rut: './08-RUT.usfm' } },
    { ...TW, stamp, manifest, files: files({ 'bible/kt/god.md': 8, 'bible/kt/faith.md': 9, 'bible/config.yaml': 10 }) },
    { ...TA, stamp, manifest, files: files({ 'translate/toc.yaml': 11, 'translate/figs-idiom/01.md': 12, 'translate/figs-idiom/title.md': 13, 'checking/acceptable/01.md': 14 }) },
    { ...UHL, stamp, manifest, files: files({ 'content/H1961.json': 15, 'domains/12.json': 16 }) },
    { ...MACULA, stamp, files: files({ 'trees/RUT.json': 17, 'referents/RUT.json': 18, 'trees/TIT.json': 19 }) },
    { ...OBS, stamp, manifest, files: files({ 'content/01.md': 20 }) },
  ]
  const ctx = { resources: new Map(resources.map((r) => [r.key, r])), originalOf: (book: string) => (book === 'rut' ? UHB.key : undefined) }
  const slots: PartSlot[] = [
    { kind: 'book', resource: TN.key, book: 'rut' },
    { kind: 'alignments', resource: TN.key, book: 'rut' },
    { kind: 'book', resource: GLT.key, book: 'rut' },
    { kind: 'original', resource: UHB.key, book: 'rut' },
    { kind: 'macula', resource: MACULA.key, book: 'rut' },
    { kind: 'tw', resource: TW.key, group: twGroupOf('bible/kt/god.md')! },
    { kind: 'ta', resource: TA.key, group: taGroupOf('translate/figs-idiom')! },
    { kind: 'titles', resource: TW.key },
    { kind: 'lexicon', resource: UHL.key, group: lexiconGroupOf('content/H1961.json') },
    { kind: 'obs', resource: OBS.key, group: '1-10' },
  ]
  return {
    parts: Object.fromEntries(slots.map((slot) => [slotId(slot), partInputs(slot, ctx)])),
    units: {
      'book rut': unitInputs('book rut', [TN.key, GLT.key, UHB.key], ctx),
      shared: unitInputs('shared', [TW.key, TA.key, UHL.key, MACULA.key, OBS.key], ctx),
    },
  }
}

/** Which producer made a fixture resource's rows: the first half of a layer group's name. */
const PRODUCER: Record<string, string> = {
  [fixture.GLT]: 'text',
  [fixture.GST]: 'text',
  [fixture.UHB]: 'original',
  [fixture.UGNT]: 'original',
  [fixture.TN]: 'tn',
  [fixture.TWL]: 'twl',
  [fixture.TQ]: 'tq',
  [fixture.TW]: 'tw',
  [fixture.TA]: 'ta',
  [fixture.UHL]: 'lexicon',
  [fixture.OBS]: 'obs',
  ...Object.fromEntries(MACULA_KEYS.map((k) => [k, 'macula'])),
}

/**
 * The version that covers each group of the sample: `<producer> <layer>` for the fixture's rows, `ruth` for the Ruth 4:5
 * sample, `rules` for slots, bucket counts, input rules and the fingerprint, `part bytes` for the part files themselves.
 */
const COVERS: Record<string, string> = {
  'text sot': 'USJ_PROCESSING_VERSION (usj-processor; USJ_TOOL_VERSIONS for the parser and usj-core)',
  'original sot': 'USJ_PROCESSING_VERSION (usj-processor; USJ_TOOL_VERSIONS for the parser and usj-core)',
  'text prepared': 'SCRIPTURE_PREPARE_SCHEMA (scripturePreparer.ts)',
  'original prepared': 'SCRIPTURE_PREPARE_SCHEMA (scripturePreparer.ts)',
  'tn sot': 'NOTES_TSV_PARSER_VERSION (resource-parsers notes-parser.ts)',
  'tn prepared': 'NOTES_PREPARE_VERSION (notesPreparer.ts), or MARKDOWN_HAST_VERSION if markdownToHast changed',
  'tn quote': 'HELPS_QUOTE_VERSION (helpsQuoteCache.ts)',
  'tn align': 'HELPS_ALIGN_VERSION (helpsAlignCache.ts)',
  'twl sot': 'WORDS_LINKS_TSV_PARSER_VERSION (resource-parsers words-links-parser.ts)',
  'twl prepared': 'WORDS_LINKS_PREPARE_VERSION (wordsLinksPreparer.ts)',
  'twl quote': 'HELPS_QUOTE_VERSION (helpsQuoteCache.ts)',
  'twl align': 'HELPS_ALIGN_VERSION (helpsAlignCache.ts)',
  'tq sot': 'QUESTIONS_TSV_PARSER_VERSION (resource-parsers questions-parser.ts)',
  'tq prepared': 'QUESTIONS_PREPARE_VERSION (questionsPreparer.ts), or MARKDOWN_HAST_VERSION if markdownToHast changed',
  'tw sot': 'TW_ROWS_VERSION (translation-words-loader)',
  'tw prepared': 'WORDS_PREPARE_VERSION (wordsPreparer.ts), or MARKDOWN_HAST_VERSION if markdownToHast changed',
  'tw text': 'ARTICLE_TITLES_VERSION (buildLanguageArtifacts.ts; HELPS_TEXT_VERSION for the row envelope)',
  'ta sot': 'TA_ROWS_VERSION (translation-academy-loader)',
  'ta prepared': 'ACADEMY_PREPARE_VERSION (academyPreparer.ts), or MARKDOWN_HAST_VERSION if markdownToHast changed',
  'ta text': 'ARTICLE_TITLES_VERSION (buildLanguageArtifacts.ts; HELPS_TEXT_VERSION for the row envelope)',
  'lexicon sot': 'LEXICON_ROWS_VERSION (cli/companions.ts)',
  'macula sot': 'MACULA_ROWS_VERSION (cli/companions.ts)',
  'obs sot': 'OBS_ROWS_VERSION (loaders/ObsLoader.ts)',
  'obs prepared': 'OBS_PREPARE_VERSION (obsPreparer.ts), or MARKDOWN_HAST_VERSION if markdownToHast changed',
  ruth: 'HELPS_QUOTE_VERSION, HELPS_ALIGN_VERSION or SCRIPTURE_PREPARE_SCHEMA (the Ruth 4:5 qere sample)',
  rules: 'PARTS_FORMAT_VERSION (language-pack types.ts) for slots, bucket counts and input rules; FINGERPRINT_VERSION for the fingerprint',
  'part bytes': 'PARTS_FORMAT_VERSION (language-pack types.ts): the part file format',
}

/** The parts fixture built as parts (OBS on), every row grouped by producer and layer, and every part's sha256. */
async function fixtureParts() {
  const dir = mkdtempSync(join(tmpdir(), 'sample-parts-'))
  try {
    const workDir = join(dir, 'work')
    const macula = join(dir, 'macula')
    mkdirSync(macula)
    const { list, originals, failures } = await buildLanguageParts({
      language: fixture.LANG,
      workDir,
      macula: { folder: fixture.maculaFolder(macula), ...fixture.MACULA_STAMP },
      lexiconsRef: fixture.LEXICONS_REF,
      fetch: fixture.lexiconFetch,
      door43Client: fixture.fakeDoor43() as never,
      discover: fixture.discover,
      obs: true,
      obsTestOnly: true,
    })
    if (failures.length) throw new Error(`the parts fixture did not build: ${JSON.stringify(failures)}`)
    const rows = new Map<string, PartRow[]>()
    const files: Record<string, string> = {}
    for (const part of [...list.parts, ...originals.parts]) {
      files[slotId(part)] = part.sha256
      const producer = PRODUCER[part.resource]
      if (!producer) throw new Error(`no producer named for ${part.resource}: add it to PRODUCER`)
      for (const row of await readPart(new Uint8Array(readFileSync(join(workDir, partPath(part.sha256)))))) {
        const group = `${producer} ${row.layer}`
        rows.set(group, [...(rows.get(group) ?? []), row])
      }
    }
    const layers: Record<string, string> = {}
    for (const [group, list] of rows) layers[group] = sha256(stableJson([...list].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))))
    return { layers, files }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Each group's hash: the fixture's rows by producer and layer, the Ruth sample, the rules and the part bytes. */
async function partsGroups(): Promise<Record<string, string>> {
  const { parts, ...rules } = await sampleParts()
  const fixtureBuilt = await fixtureParts()
  const groups: Record<string, string> = {
    ...fixtureBuilt.layers,
    ruth: sha256(stableJson(parts)),
    rules: sha256(stableJson(rules)),
    'part bytes': sha256(stableJson(fixtureBuilt.files)),
  }
  // Sorted, so sample-output.json lists them in a fixed order.
  return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => (a < b ? -1 : 1)))
}

type Sample = { compat: string; hash: string; partsCompat?: string; partsCode?: string; partsHash?: string; partsGroups?: Record<string, string> }

const readSample = (): Sample => JSON.parse(readFileSync(SAMPLE_FILE, 'utf8')) as Sample

/** Each test refreshes its own fields and keeps the other's. */
function updateSample(fields: Partial<Sample>) {
  const stored = existsSync(SAMPLE_FILE) ? readSample() : {}
  writeFileSync(SAMPLE_FILE, JSON.stringify({ ...stored, ...fields }, null, 2) + '\n')
}

const REFRESH = '`UPDATE_SAMPLE=1 bun test src/language/sampleOutput.test.ts` in packages/resource-pipeline and commit sample-output.json'

describe('the pack output of a fixed sample', () => {
  test('is the same on every run', async () => {
    const first = stableJson(await sampleRows())
    const second = stableJson(await sampleRows())
    expect(second).toBe(first)
  })

  test('only changes together with a pack version', async () => {
    const compat = compatKeyOf(PACK_FORMAT_VERSION, PACK_VERSIONS)
    const hash = sha256(stableJson(await sampleRows()))

    if (process.env.UPDATE_SAMPLE === '1') {
      updateSample({ compat, hash })
      return
    }

    expect(existsSync(SAMPLE_FILE)).toBe(true)
    const stored = readSample()
    const refresh = REFRESH
    // A bumped version is expected; the stored sample must follow it, or the guard would be off from then on.
    if (stored.compat !== compat) {
      // The serving Worker dispatches builds for the compat it was deployed with; a workflow given another one stops.
      throw new Error(
        `the pack compatibility key changed (${stored.compat} → ${compat}): run ${refresh}, ` +
          'then update CURRENT_PACK_COMPAT in translation-helps-mcp (v2) src/packs/dispatch.ts and redeploy v2'
      )
    }
    if (stored.hash !== hash) {
      throw new Error(
        'pack output changed without a version bump: bump the version that covers the change (USJ_PROCESSING_VERSION, ' +
          'SCRIPTURE_PREPARE_SCHEMA, HELPS_QUOTE_VERSION, HELPS_ALIGN_VERSION or HELPS_TEXT_VERSION), then run ' +
          `${refresh}. Running UPDATE_SAMPLE=1 without a bump defeats this check.`
      )
    }
  })

  test('as parts is the same on every run', async () => {
    expect(stableJson(await partsGroups())).toBe(stableJson(await partsGroups()))
  }, 60_000)

  test('as parts has every layer of every producer, and each group names the version that covers it', async () => {
    const groups = await partsGroups()
    // A group the table does not name could change with no message saying what to bump; a named one the fixture
    // lost would leave its producer unguarded.
    expect(Object.keys(groups).sort()).toEqual(Object.keys(COVERS).sort())
    const versions = partsCodeVersions()
    for (const covers of Object.values(COVERS)) {
      for (const name of covers.match(/\b[A-Z][A-Z0-9_]*_(?:VERSION|SCHEMA)\b/g) ?? []) {
        expect(name in versions || name === 'PARTS_FORMAT_VERSION' || name === 'FINGERPRINT_VERSION').toBe(true)
      }
    }
  }, 60_000)

  test('as parts only changes together with the parts code', async () => {
    const partsCompat = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)
    const code = await partsCode()
    const groups = await partsGroups()
    const partsHash = sha256(stableJson(groups))

    if (process.env.UPDATE_SAMPLE === '1') {
      updateSample({ partsCompat, partsCode: code, partsHash, partsGroups: groups })
      return
    }

    const stored = readSample()
    if (stored.partsCode === undefined || stored.partsHash === undefined || stored.partsGroups === undefined) {
      throw new Error(`no parts sample stored: run ${REFRESH}`)
    }
    // A bump is expected now and then; the stored sample must follow it, or the guard would be off from then on.
    if (stored.partsCompat !== partsCompat) throw new Error(`the parts compatibility key changed (${stored.partsCompat} → ${partsCompat}): run ${REFRESH}`)
    if (stored.partsCode !== code) throw new Error(`the parts code changed (${stored.partsCode} → ${code}): a row-producing version was bumped; run ${REFRESH}`)
    if (stored.partsHash !== partsHash) {
      const changed = Object.keys({ ...stored.partsGroups, ...groups }).filter((g) => stored.partsGroups![g] !== groups[g])
      // Part bytes follow their rows; only on their own do they say the format changed.
      const named = changed.length > 1 ? changed.filter((g) => g !== 'part bytes') : changed
      throw new Error(
        'part output changed without a version bump. Parts are reused by fingerprint: a part whose inputs did not change ' +
          'is carried from the last list with the bytes it was built with, so an output change under the same parts code ' +
          `would never reach it. What changed, and the version to bump (rows made from a changed source row change with it: ` +
          `bump the source's):\n${named.map((g) => `  - ${g}: ${COVERS[g] ?? 'a group COVERS does not name'}`).join('\n')}\n` +
          `Then run ${REFRESH}. If partsFixture.ts itself changed (no code did), refresh without a bump. Running ` +
          'UPDATE_SAMPLE=1 without a bump otherwise defeats this check.'
      )
    }
  }, 60_000)
})
