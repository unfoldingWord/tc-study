import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  bookView,
  buildCatalog,
  builtSegment,
  catalogView,
  hex,
  KNOWN,
  keyId,
  type OrigModel,
  origSegment,
  readSegment,
  verifyCatalog,
} from '@bt-synergy/language-pack-v3'
import fixture from '../../language-pack-v3/src/build/aquiferHelps.fixture.json'
import { main, optionsFromArgs, readCommon, UsageError } from './build-patch-v3'
import { door43Books, main as door43Main } from './door43-books'
import { testKey } from './testKey'

const BUILT = '2026-11-15T10:00:00Z'
const COMMIT_TN = '603546cd949d694d42d2b85dc0e37fdacb20407f'
const COMMIT_TQ = 'f8cc284556dbf4b1bfbd5d8c7bdd7d41ee8775e9'
const PYTHON = process.env.LP3_PYTHON
const READER_PY = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'reader-py')

const temps: string[] = []
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'build-patch-'))
  temps.push(dir)
  return dir
}
const write = (path: string, value: unknown): void => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
}

/** The fixture's Titus articles as the second book (Philemon, number 57): same text, the references moved. */
const asPhilemon = (items: unknown): unknown => JSON.parse(JSON.stringify(items).replace(/"56(\d{6})"/g, '"57$1"'))

function metadata(title: string, notice: string) {
  return {
    title,
    license_info: {
      title,
      copyright: { dates: '2022', holder: { name: 'unfoldingWord' } },
      licenses: [{ eng: { name: 'CC BY-SA 4.0 license' } }],
    },
    adaptation_notice: notice,
  }
}

async function commonDir(dir: string): Promise<void> {
  const origs = ['tit', 'phm'].map((book): OrigModel => ({ book, key: 'unfoldingWord/el-x-koine/ugnt', stamp: `v0.40#${book}`, words: [{ form: 'α', lemma: 'α', strong: 'G1', morph: '' }], pieces: [['α', true]], events: [[0, 'chapter', '1']] }))
  const segments = await Promise.all(origs.map((m) => builtSegment(origSegment(m), '0'.repeat(64))))
  const catalog = await buildCatalog({
    about: { format: '3.0', catalog: 'common', publisher: 'unfoldingWord', origin: 'published', revision: 7, built: BUILT, builder: 'test' },
    resources: [],
    segments,
  })
  mkdirSync(join(dir, 'segments'), { recursive: true })
  for (const s of segments) writeFileSync(join(dir, 'segments', `${s.id}.seg`), s.bytes)
  writeFileSync(join(dir, 'catalog-common.seg'), catalog.bytes)
}

/** Every input of a two-book build: Door43 has the notes of Philemon already. */
async function inputs(): Promise<{ args: (out: string, extra?: string[]) => string[]; root: string }> {
  const root = temp()
  const tn = join(root, 'tn')
  const tq = join(root, 'tq')
  write(join(tn, 'json', '56.content.json'), fixture.notes)
  write(join(tn, 'json', '57.content.json'), asPhilemon(fixture.notes))
  write(join(tn, 'resource_metadata.json'), metadata('unfoldingWord® Translation Notes', '<p><b>unfoldingWord® Translation Notes</b> © 2022 unfoldingWord. <cite>Notes</cite> adapted &amp; released by Mission Mutual</p>\n'))
  write(join(tn, 'manifest.json'), { repo: 'UWTranslationNotes', lang: 'hin', commit: COMMIT_TN, files: [] })
  write(join(tq, 'json', '56.content.json'), fixture.questions)
  write(join(tq, 'json', '57.content.json'), asPhilemon(fixture.questions))
  write(join(tq, 'resource_metadata.json'), metadata('unfoldingWord® Translation Questions', '<p>Questions by Mission Mutual</p>'))
  write(join(tq, 'manifest.json'), { repo: 'UWTranslationQuestions', lang: 'hin', commit: COMMIT_TQ, files: [] })
  write(join(root, 'ta', 'json', '001.content.json'), fixture.hinTa)
  write(join(root, 'ta-eng', 'json', '001.content.json'), fixture.engTa)
  write(join(root, 'titles.json'), fixture.enTaTitles)
  write(join(root, 'base.json'), { tn: ['phm'], tq: [] })
  await commonDir(join(root, 'common'))
  return {
    root,
    args: (out, extra = []) => [
      '--lang', 'hi', '--source', 'aquifer', '--tn', tn, '--tq', tq, '--ta', join(root, 'ta'), '--ta-eng', join(root, 'ta-eng'),
      '--en-ta-titles', join(root, 'titles.json'), '--base-books', join(root, 'base.json'), '--common', join(root, 'common'),
      '--out', out, '--built', BUILT, ...extra,
    ],
  }
}

async function run(args: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = await main(args, { log: (line) => out.push(line), error: (line) => err.push(line) })
  return { code, out, err }
}

const read = (path: string): Uint8Array => new Uint8Array(readFileSync(path))

describe('build-patch-v3', () => {
  test('a two-book build: the book Door43 has the notes of gets only its questions', async () => {
    const { args } = await inputs()
    const out = temp()
    const r = await run(args(out))
    expect(r.err).toEqual([])
    expect(r.code).toBe(0)
    const summary = JSON.parse(r.out[r.out.length - 1])
    expect(summary.books).toEqual({ tn: ['tit'], tq: ['tit', 'phm'] })
    expect(summary.rows.tn).toBe(fixture.notes.length)
    expect(summary.rows.tq).toBe(fixture.questions.length * 2)
    expect(summary.signed).toBe(false)

    const catalog = catalogView((await readSegment(read(join(out, 'catalog-hi-x-aquifer.seg')), { known: KNOWN.catalog, expectedClass: 'catalog' })).seg)
    expect(catalog.about.catalog).toBe('hi-x-aquifer')
    expect(catalog.about.publisher).toBe('unfoldingWord')
    expect(catalog.requires?.map(([name, revision]) => [name, revision])).toEqual([['common', 7]])
    expect(catalog.units.map((u) => u.id)).toEqual(['book:phm', 'book:tit'])
    // needs are only the original of the book: no art:, no map
    for (const unit of catalog.units) expect(unit.needs).toEqual([`orig:${unit.id.slice('book:'.length)}`])

    const books = new Map<string, ReturnType<typeof bookView>>()
    for (const entry of catalog.segments) {
      const file = join(out, 'segments', `${hex(entry.id)}.seg`)
      const { seg } = await readSegment(read(file), { known: KNOWN.book, expectedId: hex(entry.id), expectedClass: 'book' })
      expect(seg.h.lang).toBe('hi-x-aquifer')
      books.set(entry.book!, bookView(seg))
    }
    const tit = books.get('tit')!
    const phm = books.get('phm')!
    expect(tit.texts).toEqual([])
    expect(tit.orig).toEqual(['unfoldingWord/el-x-koine/ugnt', 'v0.40#tit'])
    expect(tit.notes?.rows.length).toBe(fixture.notes.length)
    expect(tit.questions?.rows.length).toBe(fixture.questions.length)
    expect(tit.res).toEqual([
      ['aquifer/hi/tn', `UWTranslationNotes@${COMMIT_TN}`],
      ['aquifer/hi/tq', `UWTranslationQuestions@${COMMIT_TQ}`],
    ])
    expect(phm.notes).toBeUndefined()
    expect(phm.questions?.rows.length).toBe(fixture.questions.length)
    expect(phm.res).toEqual([['aquifer/hi/tq', `UWTranslationQuestions@${COMMIT_TQ}`]])

    const report = readFileSync(join(out, 'report.txt'), 'utf8')
    expect(report).toContain('tn: 1 books')
    expect(report).toContain('tq: 2 books')
    expect(report).toContain('book phm: tn left out, Door43 has it')
    expect(report).toContain('unmatched ta links:')
  })

  test('the resources carry provenance, source and review', async () => {
    const { args } = await inputs()
    const out = temp()
    expect((await run(args(out))).code).toBe(0)
    const catalog = catalogView((await readSegment(read(join(out, 'catalog-hi-x-aquifer.seg')), { known: KNOWN.catalog, expectedClass: 'catalog' })).seg)
    const byKey = Object.fromEntries(catalog.resources.map((r) => [r.key, r]))
    expect(Object.keys(byKey)).toEqual(['aquifer/hi/tn', 'aquifer/hi/tq'])
    const tn = byKey['aquifer/hi/tn']
    expect(tn).toMatchObject({
      title: 'unfoldingWord® Translation Notes',
      subject: 'TSV Translation Notes',
      release: `UWTranslationNotes@${COMMIT_TN}`,
      license: 'CC-BY-SA-4.0',
      rights: '© 2022 unfoldingWord; adapted by Mission Mutual',
      attribution: 'unfoldingWord® Translation Notes © 2022 unfoldingWord. Notes adapted & released by Mission Mutual',
      source: 'aquifer',
      review: 'none',
    })
    expect(byKey['aquifer/hi/tq']).toMatchObject({ subject: 'TSV Translation Questions', source: 'aquifer', review: 'professional' })
    // the books of a resource are the ones built with it
    expect(Array.from(tn.books).reduce((n, byte) => n + byte.toString(2).replace(/0/g, '').length, 0)).toBe(1)
    expect(Array.from(byKey['aquifer/hi/tq'].books).reduce((n, byte) => n + byte.toString(2).replace(/0/g, '').length, 0)).toBe(2)
  })

  test('mixed review levels give mixed', async () => {
    const { args, root } = await inputs()
    const items = JSON.parse(JSON.stringify(fixture.notes)) as { review_level: string }[]
    items[0].review_level = 'Community'
    write(join(root, 'tn', 'json', '56.content.json'), items)
    const out = temp()
    expect((await run(args(out))).code).toBe(0)
    const catalog = catalogView((await readSegment(read(join(out, 'catalog-hi-x-aquifer.seg')), { known: KNOWN.catalog, expectedClass: 'catalog' })).seg)
    expect(catalog.resources.find((r) => r.key === 'aquifer/hi/tn')!.review).toBe('mixed')
  })

  test('with a key the catalog is signed and verifies; the segments are the same bytes', async () => {
    const { args } = await inputs()
    const key = testKey()
    const [plain, signed] = [temp(), temp()]
    expect((await run(args(plain))).code).toBe(0)
    const r = await run(args(signed, ['--sign-key', key.pem]))
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out[r.out.length - 1]).signed).toBe(true)
    const bytes = read(join(signed, 'catalog-hi-x-aquifer.seg'))
    const ok = await verifyCatalog(bytes, { [keyId(key.publicKey)]: key.publicKey })
    expect(ok.valid).toBe(true)
    await expect(verifyCatalog(read(join(plain, 'catalog-hi-x-aquifer.seg')), { [keyId(key.publicKey)]: key.publicKey })).rejects.toThrow()
    expect(readdirSync(join(plain, 'segments')).sort()).toEqual(readdirSync(join(signed, 'segments')).sort())
    expect(readFileSync(join(signed, 'report.txt'), 'utf8')).toContain('signed: key ')
    // the signature leaves the id as it was
    expect(JSON.parse(r.out[r.out.length - 1]).id).toBe((await readSegment(read(join(plain, 'catalog-hi-x-aquifer.seg')), { known: KNOWN.catalog, expectedClass: 'catalog' })).id)
  })

  test('the same inputs give the same bytes; --books limits the build', async () => {
    const { args } = await inputs()
    const [a, b, c] = [temp(), temp(), temp()]
    await run(args(a))
    await run(args(b))
    expect(read(join(a, 'catalog-hi-x-aquifer.seg'))).toEqual(read(join(b, 'catalog-hi-x-aquifer.seg')))
    const r = await run(args(c, ['--books', 'phm']))
    expect(JSON.parse(r.out[r.out.length - 1]).books).toEqual({ tn: [], tq: ['phm'] })
  })

  test('a build with nothing to add is an error, and a missing flag a usage error', async () => {
    const { args, root } = await inputs()
    write(join(root, 'base.json'), { tn: ['tit', 'phm'], tq: ['tit', 'phm'] })
    const r = await run(args(temp()))
    expect(r.code).toBe(2)
    expect(r.err.join('\n')).toContain('Nothing to build')
    const u = await run(['--lang', 'hi'])
    expect(u.code).toBe(1)
    expect(() => optionsFromArgs(['--lang', 'hi'])).toThrow(UsageError)
  })

  test('a license that is not CC-BY-SA-4.0 stops the build', async () => {
    const { args, root } = await inputs()
    write(join(root, 'tn', 'resource_metadata.json'), { ...metadata('T', ''), license_info: { licenses: [{ eng: { name: 'CC BY-NC-ND 4.0' } }], copyright: { dates: '2022', holder: { name: 'x' } } } })
    const r = await run(args(temp()))
    expect(r.code).toBe(2)
    expect(r.err.join('\n')).toContain('only CC-BY-SA-4.0')
  })

  test('the common catalog gives each orig', async () => {
    const { root } = await inputs()
    const common = await readCommon(join(root, 'common'))
    expect(common.revision).toBe(7)
    expect(common.origs.get('phm')).toEqual(['unfoldingWord/el-x-koine/ugnt', 'v0.40#phm'])
  })

  test.skipIf(PYTHON === undefined || PYTHON === '')('the Python reader opens the catalog and the segments', async () => {
    const { args } = await inputs()
    const out = temp()
    expect((await run(args(out))).code).toBe(0)
    const files = [join(out, 'catalog-hi-x-aquifer.seg'), ...readdirSync(join(out, 'segments')).map((f) => join(out, 'segments', f))]
    const script = 'import sys\nsys.path.insert(0, sys.argv[1])\nfrom lp3read import read_file\nfor f in sys.argv[2:]:\n    r = read_file(open(f, "rb").read())\n    assert "error" not in r, (f, r)\nprint("ok", len(sys.argv) - 2)\n'
    const r = spawnSync(PYTHON!, ['-I', '-c', script, READER_PY, ...files], { encoding: 'utf8' })
    expect(r.stderr).toBe('')
    expect(r.stdout.trim()).toBe(`ok ${files.length}`)
  })
})

describe('door43-books', () => {
  const entry = (subject: string, ids: string[]) => ({ subject, ingredients: ids.map((identifier) => ({ identifier })) })
  const answer = (data: unknown[]) => new Response(JSON.stringify({ ok: true, data }))

  test('counts only the notes and the questions, books in canon order', async () => {
    const urls: string[] = []
    const fetcher = (async (url: string) => {
      urls.push(url)
      return answer([entry('TSV Translation Notes', ['act']), entry('TSV Translation Questions', ['rut', 'gen']), entry('TSV Translation Words Links', ['tit']), entry('OBS Translation Notes', ['obs'])])
    }) as unknown as typeof fetch
    expect(await door43Books('hi', fetcher, 'http://x')).toEqual({ lang: 'hi', tn: ['act'], tq: ['gen', 'rut'] })
    expect(urls).toEqual(['http://x/api/v1/catalog/search?lang=hi&stage=prod&limit=100&page=1'])
  })

  test('writes the file, and exits 1 when the catalog cannot be read', async () => {
    const out = join(temp(), 'b.json')
    const ok = (async () => answer([entry('TSV Translation Notes', ['act'])])) as unknown as typeof fetch
    expect(await door43Main(['--lang', 'hi', '--out', out], { log: () => {}, error: () => {} }, ok)).toBe(0)
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ lang: 'hi', tn: ['act'], tq: [] })
    const bad = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch
    const errors: string[] = []
    expect(await door43Main(['--lang', 'hi'], { log: () => {}, error: (l) => errors.push(l) }, bad)).toBe(1)
    expect(errors[0]).toContain('HTTP 500')
    expect(await door43Main([], { log: () => {}, error: () => {} }, ok)).toBe(2)
  })
})
