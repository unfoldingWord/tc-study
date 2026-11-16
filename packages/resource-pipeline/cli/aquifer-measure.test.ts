import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type BookModel, bookSegment, buildCatalog, builtSegment, type OrigModel, origSegment } from '@bt-synergy/language-pack-v3'
import fixture from '../../language-pack-v3/src/build/aquiferHelps.fixture.json'
import { main as buildPatch } from './build-patch-v3'
import { gapCells, invertTitles, main, optionsFromArgs, sampleNotes, spreadRefs, taLinks, UsageError } from './aquifer-measure'

const BUILT = '2026-11-15T10:00:00Z'
const temps: string[] = []
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'aquifer-measure-'))
  temps.push(dir)
  return dir
}
const write = (path: string, value: unknown): void => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
}
const asPhilemon = (items: unknown): unknown => JSON.parse(JSON.stringify(items).replace(/"56(\d{6})"/g, '"57$1"'))
const metadata = (title: string) => ({
  title,
  license_info: { title, copyright: { dates: '2022', holder: { name: 'unfoldingWord' } }, licenses: [{ eng: { name: 'CC BY-SA 4.0 license' } }] },
  adaptation_notice: `<p>${title} adapted by Mission Mutual</p>`,
})

async function writeCatalog(dir: string, segs: Parameters<typeof builtSegment>[0][], about: object, resources: object[] = []): Promise<void> {
  const segments = await Promise.all(segs.map((seg) => builtSegment(seg, '0'.repeat(64))))
  const catalog = await buildCatalog({ about: about as never, resources: resources as never, segments })
  mkdirSync(join(dir, 'segments'), { recursive: true })
  for (const s of segments) writeFileSync(join(dir, 'segments', `${s.id}.seg`), s.bytes)
  writeFileSync(join(dir, `catalog-${(about as { catalog: string }).catalog}.seg`), catalog.bytes)
}

/** A built patch (Titus: notes and questions; Philemon: questions only, Door43 has its notes), its common catalog and a base `hi` with Philemon notes. */
async function world() {
  const root = temp()
  const tn = join(root, 'tn')
  const tq = join(root, 'tq')
  write(join(tn, 'json', '56.content.json'), fixture.notes)
  write(join(tn, 'json', '57.content.json'), asPhilemon(fixture.notes))
  write(join(tn, 'resource_metadata.json'), metadata('Notes'))
  write(join(tn, 'manifest.json'), { repo: 'UWTranslationNotes', lang: 'hin', commit: '603546cd949d694d42d2b85dc0e37fdacb20407f', files: [] })
  write(join(tq, 'json', '56.content.json'), fixture.questions)
  write(join(tq, 'json', '57.content.json'), asPhilemon(fixture.questions))
  write(join(tq, 'resource_metadata.json'), metadata('Questions'))
  write(join(tq, 'manifest.json'), { repo: 'UWTranslationQuestions', lang: 'hin', commit: 'f8cc284556dbf4b1bfbd5d8c7bdd7d41ee8775e9', files: [] })
  write(join(root, 'ta', 'json', '001.content.json'), fixture.hinTa)
  write(join(root, 'ta-eng', 'json', '001.content.json'), fixture.engTa)
  write(join(root, 'titles.json'), fixture.enTaTitles)
  write(join(root, 'base-books.json'), { tn: ['phm'], tq: [] })

  const verses: [string, string[]][] = [
    ['tit', ['1:1', '1:2', '1:6', '2:1', '2:2']],
    ['phm', ['1:1', '1:2']],
  ]
  const origModels = verses.map(([book, list]): OrigModel => {
    const events: OrigModel['events'] = []
    let chapter = ''
    for (const v of list) {
      const [c, n] = v.split(':')
      if (c !== chapter) events.push([0, 'chapter', c])
      chapter = c
      events.push([0, 'verse', n])
    }
    return { book, key: 'unfoldingWord/el-x-koine/ugnt', stamp: `v0.40#${book}`, words: [{ form: 'a', lemma: 'a', strong: 'G1', morph: '' }], pieces: [['a', true]], events }
  })
  const common = join(root, 'common')
  await writeCatalog(common, origModels.map((m) => origSegment(m)), { format: '3.0', catalog: 'common', publisher: 'unfoldingWord', origin: 'published', revision: 7, built: BUILT, builder: 'test' })

  const patch = join(root, 'patch')
  const code = await buildPatch(
    ['--lang', 'hi', '--source', 'aquifer', '--tn', tn, '--tq', tq, '--ta', join(root, 'ta'), '--ta-eng', join(root, 'ta-eng'), '--en-ta-titles', join(root, 'titles.json'), '--base-books', join(root, 'base-books.json'), '--common', common, '--out', patch, '--built', BUILT],
    {
      log: () => {},
      error: (l) => {
        throw new Error(l)
      },
    },
  )
  expect(code).toBe(0)

  const phm: BookModel = {
    lang: 'hi',
    book: 'phm',
    orig: ['unfoldingWord/el-x-koine/ugnt', 'v0.40#phm'],
    res: [['door43/hi/tn', 'v1']],
    texts: [],
    notes: { res: 'door43/hi/tn', rows: [{ id: 'd43-1', ref: '1:1', from: 57001001, to: 57001001, cols: { note: 'door43 note' } }] },
  }
  const base = join(root, 'base')
  await writeCatalog(base, [bookSegment(phm)], { format: '3.0', catalog: 'hi', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: BUILT, builder: 'test' }, [
    { key: 'door43/hi/tn', title: 'tN', subject: 'TSV Translation Notes', release: 'v1', license: 'CC-BY-SA-4.0', books: new Uint8Array(9) },
  ])
  return { root, patch, common, base, args: (extra: string[] = []) => ['--base-books', join(root, 'base-books.json'), '--patch', patch, '--common', common, '--out-md', join(root, 'out.md'), ...extra] }
}

async function run(args: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = await main(args, { log: (l) => out.push(l), error: (l) => err.push(l) })
  return { code, out, err, summary: out.length > 0 ? JSON.parse(out[out.length - 1]) : undefined }
}

describe('pieces', () => {
  test('gapCells: Door43 wins, the patch fills the rest, totals add up to 66', () => {
    const g = gapCells({ tn: ['phm'], tq: ['gen'] }, { tn: new Set(['tit', 'phm']), tq: new Set(['tit', 'phm', 'gen']) })
    const row = (rows: { book: string }[], b: string) => rows.find((r) => r.book === b)
    expect(g.before).toHaveLength(66)
    expect(row(g.before, 'tit')).toMatchObject({ tn: '', tq: '' })
    expect(row(g.after, 'tit')).toMatchObject({ tn: 'aquifer', tq: 'aquifer' })
    expect(row(g.after, 'phm')).toMatchObject({ tn: 'door43', tq: 'aquifer' })
    expect(row(g.after, 'gen')).toMatchObject({ tn: '', tq: 'door43' })
    expect(g.totals.before.tn).toEqual({ door43: 1, aquifer: 0, empty: 65 })
    expect(g.totals.after.tq).toEqual({ door43: 1, aquifer: 2, empty: 63 })
  })

  test('taLinks counts concepts, inline links and the report line', () => {
    const row = (note: string, concept?: string) => ({ id: note, ref: '1:1', from: 1, to: 1, ...(concept ? { concept } : {}), cols: { note } })
    const t = taLinks([row('a [[ta:translate/x]] b [[ta:translate/y]]', 'ta:translate/x'), row('plain'), row('c [[ta:translate/x]]')], 'a\nta links left as text: 2 inline links; 4 associated concept articles with no ta: id\n')
    expect(t).toMatchObject({ notes: 3, withConcept: 1, withInlineLink: 2, inlineLinks: 3, leftAsText: 2, conceptArticlesWithoutId: 4, linkHitRate: 3 / 5 })
    expect(taLinks([row('x')], undefined)).toMatchObject({ leftAsText: null, linkHitRate: null })
  })

  test('the sample is deterministic by seed and has no repeats', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, ref: '1:1', from: 1, to: 1, cols: { note: `note ${i}` } }))
    const books = new Map<string, BookModel>([['tit', { notes: { res: 'x', rows } } as unknown as BookModel]])
    const ids = (seed: number) => sampleNotes(books, 20, seed).map((s) => s.row.id)
    expect(ids(1)).toEqual(ids(1))
    expect(ids(1)).not.toEqual(ids(2))
    expect(new Set(ids(1)).size).toBe(20)
  })

  test('invertTitles keeps ambiguous titles for each id', () => {
    const m = invertTitles({ titles: { Metaphor: 'ta:translate/figs-metaphor' }, ambiguous: { 'Word Order': ['ta:translate/a', 'ta:translate/b'] } })
    expect(m.get('ta:translate/figs-metaphor')).toEqual(['Metaphor'])
    expect(m.get('ta:translate/b')).toEqual(['Word Order'])
  })

  test('spreadRefs gives n references, an even share per book', () => {
    const v = new Map([
      ['rut', Array.from({ length: 85 }, (_, i) => `1:${i + 1}`)],
      ['gen', Array.from({ length: 100 }, (_, i) => `1:${i + 1}`)],
    ])
    const refs = spreadRefs(v, 30)
    expect(refs).toHaveLength(30)
    expect(refs.filter((r) => r.startsWith('gen')).length).toBe(15)
    expect(refs[0].startsWith('gen')).toBe(true)
  })

  test('usage errors', () => {
    expect(() => optionsFromArgs(['--nope', 'x'])).toThrow(UsageError)
    expect(() => optionsFromArgs([])).toThrow('--base-books is missing')
  })
})

describe('aquifer-measure', () => {
  test('measures a two-book patch with the patch alone', async () => {
    const w = await world()
    const r = await run(w.args(['--en-ta-titles', join(w.root, 'titles.json'), '--sample', '3', '--seed', '5']))
    expect(r.err).toEqual([])
    expect(r.code).toBe(0)
    const s = r.summary
    expect(s.books).toEqual({ tn: 1, tq: 2 })
    expect(s.gap.before.tn).toEqual({ door43: 1, aquifer: 0, empty: 65 })
    expect(s.gap.after.tn).toEqual({ door43: 1, aquifer: 1, empty: 64 })
    expect(s.gap.after.tq).toEqual({ door43: 0, aquifer: 2, empty: 64 })
    expect(s.ta.notes).toBe(fixture.notes.length)
    expect(s.ta.withConcept).toBeGreaterThan(0)
    expect(typeof s.ta.leftAsText).toBe('number')
    // 7 verses over 2 books, all of them asked: tit has nothing from Door43, phm has its notes
    expect(s.empty.refs).toBe(7)
    expect(s.empty.before).toBe(5)
    expect(s.empty.after).toBeLessThan(s.empty.before)
    const md = readFileSync(join(w.root, 'out.md'), 'utf8')
    expect(md).toContain('## Gap cells')
    expect(md).toContain('| tit | - | aquifer | - | aquifer |')
    expect(md).toContain('3 notes to check by hand (seed 5)')
  })

  test('with a base reader the after answers are the merged ones', async () => {
    const w = await world()
    const r = await run(w.args(['--base', w.base, '--refs', 'tit 1:1,phm 1:1,phm 1:2,gen 1:1']))
    expect(r.err).toEqual([])
    expect(r.code).toBe(0)
    // before by books: tit and gen are empty (2); measured on the base reader: tit, phm 1:2 and gen (3)
    expect(r.summary.empty.mode).toBe('merged')
    expect(r.summary.empty.refs).toBe(4)
    expect(r.summary.empty.before).toBe(2)
    expect(r.summary.empty.beforeMeasured).toBe(3)
    expect(r.summary.empty.after).toBeLessThan(3)
  })

  test('without a base the books Door43 has count as answered', async () => {
    const w = await world()
    const r = await run(w.args(['--refs', 'tit 1:1,gen 1:1']))
    expect(r.code).toBe(0)
    expect(r.summary.empty).toEqual({ mode: 'book-level', refs: 2, before: 2, beforeMeasured: null, after: 1 })
  })

  test('a bad option is a usage error, a folder with no catalog a read error', async () => {
    const w = await world()
    expect((await run(w.args(['--lang', 'HI']))).code).toBe(1)
    expect((await run(['--base-books', join(w.root, 'base-books.json'), '--patch', w.root, '--common', w.common, '--out-md', join(w.root, 'o.md')])).code).toBe(2)
  })
})

describe('review fixes', () => {
  test('with more books than references the sample covers the canon, not the first books', () => {
    const v = new Map(['gen', 'exo', 'lev', 'mat', 'mrk', 'luk', 'jhn', 'rev'].map((b) => [b, ['1:1', '1:2', '1:3']]))
    const refs = spreadRefs(v, 4)
    expect(refs).toHaveLength(4)
    expect(refs.some((r) => r.startsWith('rev') || r.startsWith('jhn'))).toBe(true)
  })

  test('a table with no rows does not fill a cell, and the markdown says lower bound without a base', async () => {
    const g = gapCells({ tn: [], tq: [] }, { tn: new Set(), tq: new Set() })
    expect(g.totals.after.tn.aquifer).toBe(0)
    const w = await world()
    expect((await run(w.args([]))).code).toBe(0)
    expect(readFileSync(join(w.root, 'out.md'), 'utf8')).toContain('Lower bound')
  })
})
