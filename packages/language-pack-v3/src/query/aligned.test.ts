import { beforeAll, describe, expect, test } from 'bun:test'
import { toHex } from '../codec/sha256'
import { ALIGNED_PARTS, buildAligned, isBridgeText } from '../build/aligned/build'
import type { AlignedModel, BookModel, OrigModel, TextModel } from '../model'
import { alignedKey, groupOfKey, phrase, type AlignedSet } from './aligned'
import { answer } from './maps'

const GLT = 'es-419_gl/es-419/glt'
const GST = 'es-419_gl/es-419/gst'

const orig: OrigModel = {
  book: 'rut',
  key: 'x/ugnt',
  stamp: 's1',
  words: ['H3225', 'G5101', 'G2424', 'H259', ''].map((strong) => ({ form: '', lemma: '', strong, morph: '' })),
  pieces: [],
  events: [],
}

const text = (res: string, verse: string, words: [string, number[]][]): TextModel => {
  const pieces: TextModel['pieces'] = []
  const align: number[][] = []
  words.forEach(([w, a], k) => {
    if (k > 0) pieces.push([' ', false])
    pieces.push([w, true])
    align.push(a)
  })
  return { res, pieces, events: [[0, 'chapter', '1'], [0, 'verse', verse]], align }
}

const book: BookModel = {
  lang: 'es-419',
  book: 'rut',
  orig: ['x/ugnt', 's1'],
  res: [[GLT, 'v1'], [GST, 'v2']],
  texts: [
    text(GLT, '1', [['A', [0]], ['la', [0]], ['Diestra', [0]], ['¿Qué', [1]], ['Ἰησοῦς', [2]], ['1', [3]], ['Ácido', [3]], ['sin', []]]),
    text(GST, '1-2', [['diestra', [0]]]),
  ],
}

const built = buildAligned({ lang: 'es-419', books: [book], origs: new Map([['rut', orig]]), texts: isBridgeText })
const everyPart = (): AlignedSet => ({ lang: 'es-419', groups: built.parts.map((p) => p.group), parts: new Map(built.parts.map((p) => [p.group, p])) })
const ask = (set: AlignedSet, t: string, lang = 'es-419') => phrase(set, lang, t) as Record<string, unknown>

describe('phrase', () => {
  test('a phrase in one text only: its verse once and the occurrences of that text (Review Focus 1)', () => {
    expect(ask(everyPart(), 'a la diestra')).toEqual({
      kind: 'phrase',
      lang: 'es-419',
      text: 'a la diestra',
      installed: true,
      found: true,
      strongs: { H3225: { books: 1, verses: 1, occurrences: 1 } },
    })
  })

  test('the same word in two texts: one verse, two occurrences', () => {
    expect(ask(everyPart(), 'diestra').strongs).toEqual({ H3225: { books: 1, verses: 1, occurrences: 2 } })
  })

  test('keys outside basic Latin are in other and found there (Review Focus 2)', () => {
    const set = everyPart()
    for (const t of ['¿Qué', 'Ἰησοῦς', '1', '1 ácido']) {
      expect(groupOfKey(set.groups, alignedKey('es-419', t))).toBe('other')
      expect(ask(set, t).found).toBe(true)
    }
    expect(ask(set, '1').strongs).toEqual({ H259: { books: 1, verses: 1, occurrences: 1 } })
    expect(ask(set, 'Ἰησοῦς').strongs).toEqual({ G2424: { books: 1, verses: 1, occurrences: 1 } })
  })

  test('a phrase that is not in an installed part is not found, with installed true', () => {
    expect(ask(everyPart(), 'a la izquierda')).toMatchObject({ installed: true, found: false, strongs: {} })
    expect(ask(everyPart(), 'zzz')).toMatchObject({ installed: true, found: false })
  })

  test('case and normalization: Diestra, diestra, DIESTRA and decomposed accents give the same answer (Review Focus 5)', () => {
    const set = everyPart()
    const same = ask(set, 'diestra').strongs
    expect(ask(set, 'Diestra').strongs).toEqual(same)
    expect(ask(set, 'DIESTRA').strongs).toEqual(same)
    const nfd = 'Ácido'.normalize('NFD')
    expect(nfd).not.toBe('Ácido')
    expect(ask(set, nfd)).toMatchObject({ found: true, strongs: ask(set, 'ácido').strongs })
    expect(ask(set, 'ácido')).toMatchObject({ found: true })
  })

  test('a part that is not installed, or not in the catalog, or another language: installed false, never not found (Review Focus 3)', () => {
    const full = everyPart()
    const offered: AlignedSet = { ...full, parts: new Map([...full.parts].filter(([g]) => g !== 'other')) }
    expect(ask(offered, '¿Qué')).toEqual({ kind: 'phrase', lang: 'es-419', text: '¿Qué', installed: false })
    expect(ask(offered, 'diestra')).toMatchObject({ installed: true, found: true })
    const nothing: AlignedSet = { ...full, parts: new Map() }
    expect(ask(nothing, 'diestra')).toEqual({ kind: 'phrase', lang: 'es-419', text: 'diestra', installed: false })
    const noCatalog: AlignedSet = { ...full, groups: full.groups.filter((g) => g !== 'other') }
    expect(ask(noCatalog, 'Ἰησοῦς').installed).toBe(false)
    expect(ask({ lang: 'es-419', groups: [], parts: new Map() }, 'diestra').installed).toBe(false)
    expect(ask(full, 'right hand', 'en').installed).toBe(false)
  })

  test('the catalog routes: a key goes to the unit of its range, and a part not built is the part of its neighbour only by range', () => {
    expect(groupOfKey(['a-and ha', 'contad-foo'], 'a la')).toBe('a-and ha')
    expect(groupOfKey(['a-and ha', 'contad-foo'], 'cosa')).toBe('contad-foo')
    expect(groupOfKey(['a-and ha', 'contad-foo'], 'zorro')).toBe('other')
    // the whole table: every first letter has a group
    for (const c of 'abcdefghijklmnopqrstuvwxyz') expect(groupOfKey(ALIGNED_PARTS, c + 'm')).not.toBe('other')
    // a unit that is a lone prefix holds its own keys
    expect(groupOfKey(['t', 'other'], 'the end')).toBe('t')
  })

  test('answer() dispatches phrase, and says installed false without an index', () => {
    const q = { kind: 'phrase', lang: 'es-419', text: 'Diestra' }
    expect(answer({ revision: 1, aligned: everyPart() }, q)).toMatchObject({ found: true })
    expect(answer({ revision: 1 }, q)).toEqual({ kind: 'phrase', lang: 'es-419', text: 'Diestra', installed: false })
  })
})

describe('phrase on more than one book', () => {
  test('books, verses and occurrences are summed over the books', () => {
    const part: AlignedModel = {
      lang: 'en',
      group: 'r-r',
      res: [['x/ult', 'v1']],
      entries: new Map([['right hand', new Map([['H3225', new Map<string, [number, number]>([['psa', [3, 4]], ['rut', [1, 1]]])]])]]),
    }
    const set: AlignedSet = { lang: 'en', groups: ['r-r'], parts: new Map([['r-r', part]]) }
    expect(ask(set, 'Right Hand', 'en').strongs).toEqual({ H3225: { books: 2, verses: 4, occurrences: 5 } })
  })
})

// The three fixed queries `phrase-*.json` against a build of the phase 0 sample (LP3_SAMPLE is its folder): the expected answers are
// those of `spec/tests/queries/answers.py`, which reads the raw parts and no builder.
const SAMPLE = process.env.LP3_SAMPLE
describe.skipIf(SAMPLE === undefined)('the fixed phrase queries on a build of the sample', () => {
  const dir = `${import.meta.dir}/../../spec/tests/queries`
  const sets = new Map<string, AlignedSet>()
  beforeAll(async () => {
    const { readSegment } = await import('../codec/container')
    const { partsSource } = await import('../node/partsSource')
    const { buildLanguage, BUILDER } = await import('../build/language')
    const { alignedView, ALIGNED_TABLES } = await import('../read/aligned')
    const { catalogView, CATALOG_TABLES } = await import('../read/catalog')
    const about = { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER } as const
    const { existsSync, mkdtempSync, readFileSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const tmp = mkdtempSync(`${tmpdir()}/lp3-phrase-`)
    // The lists name parts the sample does not hold; the build gets lists with the parts it has.
    const have = (path: string, name: string): string => {
      const list = JSON.parse(readFileSync(path, 'utf8')) as { parts: { sha256?: string }[] }
      list.parts = list.parts.filter((p) => p.sha256 !== undefined && existsSync(`${SAMPLE}/parts/${p.sha256}.part.gz`))
      writeFileSync(`${tmp}/${name}.json`, JSON.stringify(list))
      return `${tmp}/${name}.json`
    }
    for (const lang of ['en', 'es-419']) {
      const source = await partsSource({ list: have(`${SAMPLE}/${lang}/list.json`, lang), partsDir: `${SAMPLE}/parts`, originals: have(`${SAMPLE}/originals/list.json`, 'originals') })
      const b = await buildLanguage({ source, lang, registry: {}, about, aligned: true })
      const catalog = catalogView((await readSegment(b.catalog.bytes, { known: CATALOG_TABLES })).seg)
      const units = catalog.units.filter((u) => u.id.startsWith('aligned:'))
      const groups = units.map((u) => u.id.slice('aligned:'.length))
      const parts = new Map<string, AlignedModel>()
      for (const unit of units) {
        const id = unit.id.slice('aligned:'.length)
        for (const index of unit.segments) {
          const s = b.segments.find((x) => x.id === toHex(catalog.segments[index]!.id))
          if (!s) continue
          const view = alignedView((await readSegment(s.bytes, { known: ALIGNED_TABLES })).seg, groups)
          expect(view.group).toBe(id)
          parts.set(id, view)
        }
      }
      sets.set(lang, { lang, groups, parts })
    }
  }, 600_000)

  for (const name of ['phrase-diestra', 'phrase-right-hand', 'phrase-before-his-face']) {
    test(`${name} matches answers.py`, async () => {
      const doc = JSON.parse(await Bun.file(`${dir}/${name}.json`).text()) as { query: { lang: string; text: string }; expected: unknown }
      expect(phrase(sets.get(doc.query.lang)!, doc.query.lang, doc.query.text)).toEqual(doc.expected)
    })
  }
})
