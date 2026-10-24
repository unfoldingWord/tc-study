import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compatKeyOf, PARTS_FORMAT_VERSION, partsListPath, readPart, slotId, unitOfPart, type PartEntry, type PartsList } from '@bt-synergy/language-pack'
import { buildLanguageParts, type PreviousParts } from './buildLanguageParts'
import { PACK_VERSIONS } from './packVersions'
import {
  discoverWith,
  fakeDoor43,
  GLT,
  LANG,
  LEXICON_FILES,
  lexiconFetchOf,
  LEXICONS_REF,
  MACULA_STAMP,
  maculaFolder,
  manifestOf,
  reposCopy,
  TW,
  releaseStampedRuth,
  TA,
  TN,
  UHL,
  type CatalogOverrides,
  type CatalogRow,
} from './partsFixture'

// Many builds of the fixture, each a full build or one reusing the baseline's lists: kept apart from
// buildLanguageParts.test.ts so its time is visible on its own.

const COMPAT = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function freshDir(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`))
  dirs.push(dir)
  return dir
}

/** A change to the fixture: its repositories, lexicon, MACULA folder or stamp, or its catalog. */
type Fixture = {
  repos?: Record<string, Record<string, string>>
  lexicon?: Record<string, string>
  lexiconCommit?: { sha: string; created: string }
  macula?: (dir: string) => void
  maculaStamp?: { version: string; publishedAt: string }
  catalog?: CatalogOverrides
  obs?: boolean
}

type Built = Awaited<ReturnType<typeof buildLanguageParts>> & {
  workDir: string
  lines: string[]
  /** The two lists as written: the language's, and the originals list (the same text at its content address). */
  texts: { language: string; originals: string }
}

async function build(f: Fixture = {}, previous?: PreviousParts): Promise<Built> {
  const workDir = freshDir(previous ? 'reuse' : 'full')
  const macula = maculaFolder(freshDir('macula'))
  f.macula?.(macula)
  const lines: string[] = []
  const result = await buildLanguageParts({
    language: LANG,
    workDir,
    macula: { folder: macula, ...(f.maculaStamp ?? MACULA_STAMP) },
    lexiconsRef: LEXICONS_REF,
    fetch: lexiconFetchOf({ files: f.lexicon, commit: f.lexiconCommit }),
    door43Client: fakeDoor43({ repos: f.repos, lexicon: f.lexicon, catalog: f.catalog }) as never,
    discover: discoverWith(f.catalog),
    obs: f.obs ?? false,
    log: (line) => lines.push(line),
    ...(previous ? { previous } : {}),
  })
  const read = (path: string) => readFileSync(join(workDir, path), 'utf8')
  const texts = { language: read(partsListPath(COMPAT, LANG)), originals: read(partsListPath(COMPAT, 'originals')) }
  expect(read(result.list.originals!.path)).toBe(texts.originals)
  return { ...result, workDir, lines, texts }
}

const partFiles = (workDir: string) => readdirSync(join(workDir, 'parts')).sort()

/** What a publish reads back: the lists as published, and the bucket as the baseline's part files. */
function previousOf(b: Built, o: { list?: (l: PartsList) => PartsList; lacks?: string } = {}): PreviousParts {
  const list = JSON.parse(b.texts.language) as PartsList
  return {
    list: o.list ? o.list(list) : list,
    originals: JSON.parse(b.texts.originals) as PartsList,
    has: async (sha) => sha !== o.lacks && existsSync(join(b.workDir, 'parts', `${sha}.part.gz`)),
  }
}

const allParts = (b: Pick<Built, 'list' | 'originals'>) => [...b.list.parts, ...b.originals.parts]
const builtUnits = (b: Built) => b.units.filter((u) => u.outcome === 'built').map((u) => u.unit).sort()
const unitFingerprints = (list: PartsList) => new Map((list.units ?? []).map((u) => [u.id, u.fingerprint]))
const bySlot = (b: Pick<Built, 'list' | 'originals'>) => new Map(allParts(b).map((p) => [slotId(p), p]))

/**
 * Every slot whose bytes differ between two full builds (or that only one has) must differ in fingerprint, and so
 * must its unit's: else a build reusing the first would carry the old part. Each violation, in words.
 */
function unnoticed(before: Built, after: Built): string[] {
  const out: string[] = []
  const [a, b] = [bySlot(before), bySlot(after)]
  const [ua, ub] = [unitFingerprints(before.list), unitFingerprints(after.list)]
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const [pa, pb] = [a.get(id), b.get(id)]
    if (pa && pb && pa.sha256 === pb.sha256) continue
    if (pa && pb && pa.fingerprint === pb.fingerprint) out.push(`${id}: its bytes changed, its fingerprint did not`)
    const unit = unitOfPart((pa ?? pb)!)
    if (ua.has(unit) && ua.get(unit) === ub.get(unit)) out.push(`${id}: ${pa && pb ? 'its bytes changed' : pa ? 'it is gone' : 'it is new'}, the fingerprint of ${unit} did not`)
  }
  return out
}

/** The slots whose bytes differ between two builds, or that only one has. */
function changedSlots(before: Built, after: Built): string[] {
  const [a, b] = [bySlot(before), bySlot(after)]
  return [...new Set([...a.keys(), ...b.keys()])].filter((id) => a.get(id)?.sha256 !== b.get(id)?.sha256).sort()
}

const edit = (repo: string, path: string, content: string | ((old: string) => string) | undefined): Fixture => {
  const repos = reposCopy()
  const files = repos[repo]
  if (content === undefined) delete files[path]
  else files[path] = typeof content === 'function' ? content(files[path]) : content
  return { repos }
}

const changed = (from: string, to: string) => (old: string) => {
  if (!old.includes(from)) throw new Error(`The fixture has no ${from}`)
  return old.replace(from, to)
}

/** A catalog edit giving one ingredient of a resource another title, as discovery would after the file changed. */
const retitled = (key: string, identifier: string, title: string) => (row: CatalogRow) => {
  if (row.resourceKey !== key) return
  const ingredient = row.contentMetadata.ingredients.find((i) => i.identifier === identifier)
  if (!ingredient) throw new Error(`${key} has no ingredient ${identifier}`)
  ingredient.title = title
}

const NEW_COMMIT = { sha: 'fedcba9876543210fedcba9876543210fedcba98', created: '2026-09-15T00:00:00Z' }

const MUTATIONS: Array<{ name: string; fixture: Fixture; built: string[] }> = [
  { name: 'GLT 08-RUT.usfm text', fixture: edit('test_gl/es-419_glt', '08-RUT.usfm', changed('Sucedió', 'Aconteció')), built: ['book rut'] },
  { name: 'UHB 32-JON.usfm', fixture: edit('unfoldingWord/hbo_uhb', '32-JON.usfm', changed('\\id JON\n', '\\id JON\n\\h Jonás\n')), built: ['book jon'] },
  { name: 'TN tn_RUT.tsv', fixture: edit('test_gl/es-419_tn', 'tn_RUT.tsv', changed('Una nota de Rut', 'Otra nota de Rut')), built: ['book rut'] },
  { name: 'TWL twl_JON.tsv', fixture: edit('test_gl/es-419_twl', 'twl_JON.tsv', changed('bible/kt/god', 'bible/kt/faith')), built: ['book jon'] },
  { name: 'TW bible/kt/god.md', fixture: edit('test_gl/es-419_tw', 'bible/kt/god.md', changed('El creador.', 'El creador de todo.')), built: ['shared'] },
  {
    name: 'TA translate/figs-idiom/title.md',
    // Discovery reads the titles from the release zip too: the catalog row has the new one.
    fixture: { ...edit('test_gl/es-419_ta', 'translate/figs-idiom/title.md', 'Modismos\n'), catalog: { edit: retitled(TA, 'translate/figs-idiom', 'Modismos') } },
    built: ['shared'],
  },
  {
    name: 'lexicon content/H1961.json',
    fixture: { lexicon: { ...LEXICON_FILES, 'content/H1961.json': JSON.stringify({ brief: 'ser, estar, existir' }) }, lexiconCommit: NEW_COMMIT },
    built: ['shared'],
  },
  { name: 'MACULA trees/RUT.json', fixture: { macula: (dir) => writeFileSync(join(dir, 'trees', 'RUT.json'), JSON.stringify({ sentences: ['Rut 1:1', 'Rut 1:2'] })) }, built: ['shared'] },
  { name: 'MACULA commit only (same files)', fixture: { maculaStamp: { version: 'def7654321', publishedAt: '2026-09-15T00:00:00.000Z' } }, built: [] },
  { name: 'lexicon commit only (same files)', fixture: { lexiconCommit: NEW_COMMIT }, built: [] },
  {
    name: 'TN manifest: version, modified, issued only',
    fixture: edit('test_gl/es-419_tn', 'manifest.yaml', manifestOf('test_gl/es-419_tn', { version: '13', date: '2026-10-01' })),
    built: [],
  },
  { name: 'TN manifest: title', fixture: edit('test_gl/es-419_tn', 'manifest.yaml', manifestOf('test_gl/es-419_tn', { title: 'Notas para traducir' })), built: ['book jon', 'book rut'] },
  { name: 'GLT release tag only (same files)', fixture: { catalog: { tags: { [GLT]: 'v13' } } }, built: [] },
  { name: 'TW release tag only (same files)', fixture: { catalog: { tags: { [TW]: 'v13' } } }, built: ['shared'] },
  {
    name: 'GST gains its 01-GEN.usfm',
    fixture: edit('test_gl/es-419_gst', '01-GEN.usfm', '\\id GEN\n\\c 1\n\\p\n\\v 1 En el principio creó Dios los cielos y la tierra.\n'),
    built: ['book gen'],
  },
  { name: 'TQ loses tq_JON.tsv', fixture: edit('test_gl/es-419_tq', 'tq_JON.tsv', undefined), built: ['book jon'] },
  { name: 'a README.md added to TN', fixture: edit('test_gl/es-419_tn', 'README.md', '# Notas\n'), built: ['book jon', 'book rut'] },
]

/**
 * A build of `fixture` reusing `base`'s lists builds exactly `built` and gives the lists and part files a full build of
 * it gives; and every slot whose bytes changed from `base` changed fingerprint, and so did its unit.
 */
async function expectAsFull(base: Built, fixture: Fixture, built: string[]) {
  const full = await build(fixture)
  const reuse = await build(fixture, previousOf(base))
  expect(reuse.failures).toEqual(full.failures)
  expect(full.failures).toEqual([])
  expect(builtUnits(reuse)).toEqual([...built].sort())
  expect(reuse.texts).toEqual(full.texts)
  // The parts it wrote are those of the units it built; the rest the bucket (the base) has.
  const builtSet = new Set(builtUnits(reuse))
  expect(partFiles(reuse.workDir)).toEqual([...new Set(allParts(reuse).filter((p) => builtSet.has(unitOfPart(p))).map((p) => `${p.sha256}.part.gz`))].sort())
  for (const p of allParts(reuse)) {
    expect(existsSync(join(reuse.workDir, 'parts', `${p.sha256}.part.gz`)) || existsSync(join(base.workDir, 'parts', `${p.sha256}.part.gz`))).toBe(true)
  }
  expect(partFiles(full.workDir)).toEqual([...new Set(allParts(full).map((p) => `${p.sha256}.part.gz`))].sort())
  expect(unnoticed(base, full)).toEqual([])
  return { full, reuse }
}

let baseline: Built
beforeAll(async () => {
  baseline = await build()
  expect(baseline.failures).toEqual([])
}, 120_000)

describe('a build with the previous lists', () => {
  test('of the same inputs carries every unit, writes no part, and gives the lists byte for byte', async () => {
    const again = await build({}, previousOf(baseline))
    expect(again.failures).toEqual([])
    expect(builtUnits(again)).toEqual([])
    expect(again.carried).toEqual(baseline.units.map((u) => u.unit))
    expect(partFiles(again.workDir)).toEqual([])
    // The lexicons' and MACULA's catalog rows too, though the shared unit that adds them did not run.
    expect(again.texts).toEqual(baseline.texts)
    expect(again.units.every((u) => u.parts === baseline.units.find((b) => b.unit === u.unit)!.parts)).toBe(true)
  }, 120_000)

  test("a previous list lacking a resource's part of a book (a silent gap) is not carried on: that book is built", async () => {
    const gltRuth = (p: PartEntry) => p.kind === 'book' && p.book === 'rut' && p.resource === GLT
    const reuse = await build({}, previousOf(baseline, { list: (l) => ({ ...l, parts: l.parts.filter((p) => !gltRuth(p)) }) }))
    expect(reuse.failures).toEqual([])
    expect(builtUnits(reuse)).toEqual(['book rut'])
    expect(reuse.lines).toContainEqual(expect.stringContaining(`book rut: se construye (the previous lists have no book part of ${GLT} rut)`))
    expect(reuse.texts).toEqual(baseline.texts)
  }, 120_000)

  test("a previous list with no part of a shared resource (the lexicon) is not carried on: the shared unit is built", async () => {
    const reuse = await build({}, previousOf(baseline, { list: (l) => ({ ...l, parts: l.parts.filter((p) => p.resource !== UHL) }) }))
    expect(reuse.failures).toEqual([])
    expect(builtUnits(reuse)).toEqual(['shared'])
    expect(reuse.lines).toContainEqual(expect.stringContaining(`shared: se construye (the previous lists have no part of ${UHL})`))
    expect(reuse.texts).toEqual(baseline.texts)
  }, 120_000)


  for (const mutation of MUTATIONS) {
    test(`${mutation.name}: builds ${mutation.built.join(', ') || 'nothing'}, and gives what a full build gives`, async () => {
      await expectAsFull(baseline, mutation.fixture, mutation.built)
    }, 120_000)
  }

  test('a GLT tag bump changes only its entry in the list', async () => {
    const bumped = await build(MUTATIONS.find((m) => m.name.startsWith('GLT release tag'))!.fixture, previousOf(baseline))
    const without = (text: string) => {
      const list = JSON.parse(text) as PartsList
      return { ...list, resources: list.resources.filter((r) => r.key !== GLT) }
    }
    expect(without(bumped.texts.language)).toEqual(without(baseline.texts.language))
    expect(bumped.texts.originals).toBe(baseline.texts.originals)
    const glt = (text: string) => (JSON.parse(text) as PartsList).resources.find((r) => r.key === GLT)!
    expect(glt(bumped.texts.language).stamp).not.toBe(glt(baseline.texts.language).stamp)
  }, 120_000)

  test("a TW tag bump changes only TW's titles: no other row carries the release", async () => {
    const bumped = await build(MUTATIONS.find((m) => m.name.startsWith('TW release tag'))!.fixture)
    expect(changedSlots(baseline, bumped)).toEqual([`titles:${TW}`])
  }, 120_000)

  test("titles are read anew in every build, though another build in this process read the same resource and stamp", async () => {
    // The title index is memoized by resource and stamp: without a reset per build, this one would get the
    // baseline's titles, though the file changed under the same tag.
    const renamed = await build({
      ...edit('test_gl/es-419_tw', 'bible/kt/god.md', changed('# Dios', '# Dios todopoderoso')),
      catalog: { edit: retitled(TW, 'bible/kt/god', 'Dios todopoderoso') },
    })
    const titles = async (b: Built) => {
      const part = b.list.parts.find((p) => p.kind === 'titles' && p.resource === TW)!
      return JSON.stringify(await readPart(new Uint8Array(readFileSync(join(b.workDir, 'parts', `${part.sha256}.part.gz`)))))
    }
    expect(await titles(baseline)).not.toContain('Dios todopoderoso')
    expect(await titles(renamed)).toContain('Dios todopoderoso')
  }, 120_000)

  test('a part the bucket no longer has makes its unit built, and the others carried', async () => {
    const ruthPart = baseline.list.parts.find((p) => p.kind === 'book' && p.book === 'rut')!
    const reuse = await build({}, previousOf(baseline, { lacks: ruthPart.sha256 }))
    expect(reuse.failures).toEqual([])
    expect(builtUnits(reuse)).toEqual(['book rut'])
    expect(reuse.lines).toContainEqual(expect.stringContaining(`book rut: se construye (the bucket has no ${ruthPart.sha256}`))
    expect(reuse.texts).toEqual(baseline.texts)
    expect(partFiles(reuse.workDir)).toContain(`${ruthPart.sha256}.part.gz`)
  }, 120_000)

  test("a part whose recorded fingerprint is not the one its inputs give now makes its unit built", async () => {
    const tnJonah = (p: PartEntry) => p.kind === 'book' && p.book === 'jon' && p.resource.endsWith('/tn')
    const reuse = await build(
      {},
      previousOf(baseline, { list: (l) => ({ ...l, parts: l.parts.map((p) => (tnJonah(p) ? { ...p, fingerprint: '0'.repeat(64) } : p)) }) })
    )
    expect(builtUnits(reuse)).toEqual(['book jon'])
    expect(reuse.lines).toContainEqual(expect.stringContaining('book jon: se construye (the fingerprint of book:test_gl/es-419/tn:jon changed)'))
    expect(reuse.texts).toEqual(baseline.texts)
  }, 120_000)

  test('with OBS, the shared unit is always built (its stories are not read from the zip hashed), the books carried', async () => {
    const withObs = await build({ obs: true })
    expect(withObs.failures).toEqual([])
    const again = await build({ obs: true }, previousOf(withObs))
    expect(builtUnits(again)).toEqual(['shared'])
    expect(again.lines).toContainEqual(expect.stringContaining('shared: se construye (OBS stories are read one by one from Door43'))
    expect(again.texts).toEqual(withObs.texts)
  }, 120_000)

  test("a book its release has no file for is carried on the same tag, and built again when only the tag moves", async () => {
    const stamped = { catalog: { edit: releaseStampedRuth } }
    const base = await build(stamped)
    expect(base.failures).toEqual([])
    await expectAsFull(base, stamped, [])
    // Its rows carry the release stamp: a new tag changes them, and only that book's unit is built.
    const { full } = await expectAsFull(base, { catalog: { edit: releaseStampedRuth, tags: { [TN]: 'v13' } } }, ['book rut'])
    expect(changedSlots(base, full)).toEqual([`alignments:${TN}:rut`, `book:${TN}:rut`])
  }, 120_000)

  const IGNORED: Array<[string, (l: PartsList) => PartsList, string]> = [
    ['another compat', (l) => ({ ...l, compat: 'f2.0-u0' }), 'is of compat f2.0-u0'],
    ['another code', (l) => ({ ...l, code: `${l.code}0` }), 'was built by code'],
    ['another language', (l) => ({ ...l, language: 'en' }), 'is of en, not es-419'],
    ['no units', ({ units: _, ...l }) => l as PartsList, 'records no units'],
    ['schema 1', (l) => ({ ...l, schema: 1 as never }), 'has schema 1, not 2'],
    ['another originals list', (l) => ({ ...l, originals: { ...l.originals!, sha256: '0'.repeat(64) } }), 'is not the one its list names'],
  ]
  for (const [name, change, said] of IGNORED) {
    test(`a previous list with ${name} is ignored, with a log line, and every unit is built`, async () => {
      const reuse = await build({}, previousOf(baseline, { list: change }))
      expect(reuse.failures).toEqual([])
      expect(reuse.carried).toEqual([])
      expect(builtUnits(reuse)).toEqual(baseline.units.map((u) => u.unit).sort())
      expect(reuse.lines).toContainEqual(expect.stringMatching(new RegExp(`La lista anterior no se usa \\(.*${said.replace(/[()]/g, '\\$&')}`)))
      expect(reuse.texts).toEqual(baseline.texts)
    }, 120_000)
  }
})
