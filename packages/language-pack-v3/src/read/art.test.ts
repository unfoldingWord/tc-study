import { describe, expect, test } from 'bun:test'
import { artSegment } from '../build/art'
import { readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { ArticleModel } from '../model'
import { ART_TABLES, artView } from './art'

const TW = 'es-419_gl/es-419/tw'

const model: ArticleModel[] = [
  {
    id: 'tw:kt/faith',
    res: TW,
    title: 'fe, creer',
    subtitle: 'una pregunta',
    related: ['tw:kt/grace'],
    aliases: ['tw:other/faith'],
    sections: [
      { sid: 'intro', level: 0, role: 'intro', lang: 'es-419', md: 'Antes.' },
      { sid: 'definition', level: 2, role: 'definition', title: 'Definición', lang: 'es-419', md: 'La fe.', aliases: ['s1'] },
      { sid: 's2', level: 3, role: 'unknown', title: 'Raro', lang: 'en', md: '' },
    ],
  },
  { id: 'tw:kt/grace', res: TW, title: 'gracia', sections: [{ sid: 'definition', level: 2, role: 'definition', lang: 'es-419', md: 'La gracia.' }] },
]

const fresh = (): Segment => structuredClone(artSegment('es-419', 'tw:kt', [[TW, 'v37']], model))
const articles = (s: Segment) => s.t.articles as any[]

describe('artView', () => {
  test('the untouched copy is fine, and is the model', () => {
    expect(artView(fresh())).toEqual({ group: 'tw:kt', articles: model })
  })

  test('gives copies: changing the model does not change the segment it came from', () => {
    const seg = fresh()
    const view = artView(seg)
    view.articles[0].related![0] = 'x'
    view.articles[0].sections[1].aliases![0] = 'x'
    expect(articles(seg)[0].related).toEqual(['tw:kt/grace'])
    expect(articles(seg)[0].sections[1].aliases).toEqual(['s1'])
  })

  test('keys it does not know are left alone, and so are tables it does not know', () => {
    const seg = fresh()
    articles(seg)[0].future = 1
    articles(seg)[0].sections[0].future = 'x'
    seg.t.future = []
    seg.h.tables.future = [1, false]
    expect(artView(seg).articles).toEqual(model)
  })

  test('the known tables are the one table, version 1', () => {
    expect(ART_TABLES).toEqual({ articles: [1] })
  })

  test('a segment that readSegment gave: write, read, view', async () => {
    const { bytes } = await writeSegment(fresh())
    const { seg } = await readSegment(bytes, { known: ART_TABLES })
    expect(artView(seg)).toEqual({ group: 'tw:kt', articles: model })
  })

  test('an empty group is a group with no articles', () => {
    const seg = fresh()
    seg.t.articles = []
    expect(artView(seg)).toEqual({ group: 'tw:kt', articles: [] })
  })

  const broken: [string, (s: Segment) => void][] = [
    ['another class', (s) => void (s.h.class = 'book')],
    ['no lang in the header', (s) => void delete s.h.lang],
    ['no group in the header', (s) => void delete s.h.group],
    ['no res in the header', (s) => void delete s.h.res],
    ['an empty res in the header', (s) => void (s.h.res = [])],
    ['articles that is not a list', (s) => void (s.t.articles = {} as never)],
    ['an article that is not a map', (s) => void (articles(s)[0] = 'x')],
    ['an article that is a list', (s) => void (articles(s)[0] = [])],
    ['no id', (s) => void delete articles(s)[0].id],
    ['an id that is not text', (s) => void (articles(s)[0].id = 3)],
    ['an empty id', (s) => void (articles(s)[0].id = '')],
    ['an id twice', (s) => void (articles(s)[1].id = articles(s)[0].id)],
    ['res that is not a number', (s) => void (articles(s)[0].res = '0')],
    ['res outside the header', (s) => void (articles(s)[0].res = 1)],
    ['a negative res', (s) => void (articles(s)[0].res = -1)],
    ['a title that is not text', (s) => void (articles(s)[0].title = 1)],
    ['no title', (s) => void delete articles(s)[0].title],
    ['a subtitle that is not text', (s) => void (articles(s)[0].subtitle = [])],
    ['related that is not a list', (s) => void (articles(s)[0].related = 'tw:kt/grace')],
    ['related with a number', (s) => void (articles(s)[0].related = [1])],
    ['aliases that is not a list of text', (s) => void (articles(s)[0].aliases = [null])],
    ['no sections', (s) => void delete articles(s)[0].sections],
    ['empty sections', (s) => void (articles(s)[0].sections = [])],
    ['sections that is not a list', (s) => void (articles(s)[0].sections = {})],
    ['a section that is not a map', (s) => void (articles(s)[0].sections[0] = 5)],
    ['no sid', (s) => void delete articles(s)[0].sections[0].sid],
    ['an empty sid', (s) => void (articles(s)[0].sections[0].sid = '')],
    ['a sid twice', (s) => void (articles(s)[0].sections[1].sid = 'intro')],
    ['a level that is not a number', (s) => void (articles(s)[0].sections[0].level = '0')],
    ['a negative level', (s) => void (articles(s)[0].sections[0].level = -1)],
    ['a role that is not in the list', (s) => void (articles(s)[0].sections[0].role = 'summary')],
    ['a role that is not text', (s) => void (articles(s)[0].sections[0].role = 4)],
    ['no role', (s) => void delete articles(s)[0].sections[0].role],
    ['a section title that is not text', (s) => void (articles(s)[0].sections[1].title = 1)],
    ['no lang in a section', (s) => void delete articles(s)[0].sections[0].lang],
    ['no md', (s) => void delete articles(s)[0].sections[0].md],
    ['an md that is a byte string', (s) => void (articles(s)[0].sections[0].md = new Uint8Array(1))],
    ['section aliases that is not a list of text', (s) => void (articles(s)[0].sections[1].aliases = 's1')],
  ]
  for (const [name, change] of broken) {
    test(`rejects ${name} with E_BODY`, () => {
      const seg = fresh()
      change(seg)
      let error: unknown
      try {
        artView(seg)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(FormatError)
      expect((error as FormatError).code).toBe('E_BODY')
    })
  }

  test('each role of the list is accepted', () => {
    for (const role of ['intro', 'definition', 'facts', 'translation-suggestions', 'examples', 'strategies', 'description', 'reason', 'bible-references', 'word-data', 'unknown']) {
      const seg = fresh()
      articles(seg)[1].sections[0].role = role
      expect(artView(seg).articles[1].sections[0].role).toBe(role)
    }
  })
})
