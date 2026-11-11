import { beforeAll, describe, expect, test } from 'bun:test'
import { decodeCbor } from '../codec/cbor'
import { readSegment, writeSegment } from '../codec/container'
import type { ArticleModel } from '../model'
import { partsSource } from '../node/partsSource'
import { ART_TABLES, artView } from '../read/art'
import type { ResourceRef, Row, RowFilter, RowSource } from '../source/rows'
import { articleResources, artSegment, extractArticles } from './art'
import { articlePath, type SectionRegistry } from './sections'

// The data is a sample of real files (spec/tests/data/README.md): the es-419 tW, with the titles of all its articles and the
// text of 30 of them (the part kt:0).
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const TW = 'es-419_gl/es-419/tw'
const ES = 'es-419'

const sampleSource = () => partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts') })

// Synthetic sources

const STAMP = 'v37#2024-07-17T20_12_37Z'
const twRef = (owner = 'es-419_gl'): ResourceRef => ({ key: `${owner}/es-419/tw`, stamp: STAMP, kind: 'Translation Words', books: [] })
const taRef = (owner = 'es-419_gl'): ResourceRef => ({ key: `${owner}/es-419/ta`, stamp: 'v4#2024-07-17T20_15_35Z', kind: 'Translation Academy', books: [] })

type Item = { path: string; md: unknown; title?: string; subtitle?: string }

/** The rows of a tW or tA resource: a `sot` row for each article and the `text` rows of the titles that it has. */
function rowsOf(ref: ResourceRef, items: Item[]): Row[] {
  const tw = ref.kind === 'Translation Words'
  const rows: Row[] = []
  for (const item of items) {
    rows.push({ layer: 'sot', key: tw ? `${ref.key}/bible/${item.path}` : `${ref.key}/${item.path}`, value: item.md })
    if (item.title !== undefined) {
      rows.push({ layer: 'text', key: `helps-text:${tw ? 'tw' : 'ta'}-title:${ref.key}@${ref.stamp}:${item.path}`, value: { content: item.title, version: 1 } })
    }
    if (item.subtitle !== undefined) {
      rows.push({ layer: 'text', key: `helps-text:ta-sub-title:${ref.key}@${ref.stamp}:${item.path}`, value: { content: item.subtitle, version: 1 } })
    }
  }
  return rows
}

function fakeSource(resources: { ref: ResourceRef; rows: Row[] }[], others: ResourceRef[] = []): RowSource {
  return {
    async resources() {
      return [...resources.map((r) => r.ref), ...others]
    },
    async *rows(f: RowFilter) {
      for (const r of resources) {
        if (f.resource !== undefined && r.ref.key !== f.resource) continue
        for (const row of r.rows) if (f.layer === undefined || row.layer === f.layer) yield row
      }
    },
  }
}

const tw = (items: Item[], ref = twRef()) => ({ ref, rows: rowsOf(ref, items) })
const ta = (items: Item[], ref = taRef()) => ({ ref, rows: rowsOf(ref, items) })

async function build(resources: { ref: ResourceRef; rows: Row[] }[], registry: SectionRegistry = {}) {
  const issues: string[] = []
  const out = await extractArticles(fakeSource(resources), ES, registry, issues)
  return { ...out, issues }
}

const sidsOf = (article: ArticleModel) => article.sections.map((s) => s.sid)

// The sample

describe('the es-419 tW of the sample', () => {
  let groups: Map<string, ArticleModel[]>
  let registry: SectionRegistry
  let issues: string[]
  let refs: ResourceRef[]

  beforeAll(async () => {
    const source = sampleSource()
    issues = []
    ;({ groups, registry } = await extractArticles(await source, ES, {}, issues))
    refs = await (await source).resources(ES)
  })

  test('its 30 articles are the group tw:kt, ordered by id', () => {
    expect([...groups.keys()]).toEqual(['tw:kt'])
    const ids = groups.get('tw:kt')!.map((a) => a.id)
    expect(ids).toHaveLength(30)
    expect(ids).toEqual([...ids].sort())
    expect(ids).toContain('tw:kt/grace')
    expect(Object.keys(registry)).toHaveLength(30)
    expect(registry[articlePath(TW, 'tw:kt/grace')]).toHaveLength(4)
  })

  test('tw:kt/grace: the title is the title row, the level-1 heading is not a section', () => {
    const grace = groups.get('tw:kt')!.find((a) => a.id === 'tw:kt/grace')!
    expect(grace.title).toBe('gracia, amable')
    expect(grace.res).toBe(TW)
    expect(grace.subtitle).toBeUndefined()
    expect(grace.related).toBeUndefined()
    expect(grace.sections.map((s) => [s.sid, s.role, s.level, s.title, s.lang])).toEqual([
      ['definition', 'definition', 2, 'Definición', ES],
      ['translation-suggestions', 'translation-suggestions', 2, 'Sugerencias de traducción', ES],
      ['bible-references', 'bible-references', 2, 'Referencias bíblicas', ES],
      ['word-data', 'word-data', 2, 'Datos de esta palabra', ES],
    ])
    expect(grace.sections[0].md.startsWith('La palabra “gracia” se refiere')).toBe(true)
    expect(grace.sections.some((s) => s.md.startsWith('#') || s.md.includes('# gracia, amable'))).toBe(false)
    expect(grace.sections[3].md).toBe('*   Números de Strong: H2580, H2587, H2589, H2603, H8467, G2143, G5485, G5543')
  })

  test('the numbered sub-headings of a definition are sections of level 3 that no rule places, and the report lists them', () => {
    const believe = groups.get('tw:kt')!.find((a) => a.id === 'tw:kt/believe')!
    expect(believe.sections.filter((s) => s.role === 'unknown').map((s) => [s.sid, s.level, s.title])).toEqual([
      ['s1', 3, '1\\. Creer'],
      ['s2', 3, '2\\. Creer en'],
      ['s3', 3, '3\\. Creyente'],
      ['s4', 3, '4\\. Incredulidad'],
    ])
    expect(issues).toContain('tw:kt/believe (es-419_gl/es-419/tw): the heading "1\\\\. Creer" is not placed (role unknown, sid s1)')
    expect(issues.every((line) => line.includes('is not placed'))).toBe(true)
  })

  test('segment → file → reader gives the articles back; the tw:kt group weighs about 23 KB', async () => {
    const articles = groups.get('tw:kt')!
    const res = articleResources(articles, refs)
    expect(res).toEqual([[TW, 'v37']])
    const { bytes } = await writeSegment(artSegment(ES, 'tw:kt', res, articles))
    const { seg, skipped } = await readSegment(bytes, { known: ART_TABLES })
    expect(skipped).toEqual([])
    expect(seg.h).toEqual({ class: 'art', v: 1, tables: { articles: [1, true] }, lang: ES, group: 'tw:kt', res: [[TW, 'v37']] })
    expect(artView(seg)).toEqual({ group: 'tw:kt', articles })
    expect(bytes.length).toBeGreaterThan(15_000)
    expect(bytes.length).toBeLessThan(35_000)
  })

  test('built again with the registry, the articles and the segment are the same', async () => {
    const again = await extractArticles(await sampleSource(), ES, registry, [])
    expect(again.groups).toEqual(groups)
    expect(again.registry).toEqual(registry)
    const articles = groups.get('tw:kt')!
    const res = articleResources(articles, refs)
    const a = await writeSegment(artSegment(ES, 'tw:kt', res, articles))
    const b = await writeSegment(artSegment(ES, 'tw:kt', res, again.groups.get('tw:kt')!))
    expect(a.id).toBe(b.id)
  })
})

// extractArticles on rows we write

describe('extractArticles: tW', () => {
  test('# title is the title and not a section; the text between it and the first ## is the intro', async () => {
    const md = '# gracia, amable\n\nUna introducción.\n\n## Definición\n\nLa palabra gracia.\n\n## Referencias bíblicas\n\n* Hechos 4:33'
    const { groups } = await build([tw([{ path: 'kt/grace', md, title: 'gracia, amable' }])])
    const article = groups.get('tw:kt')![0]
    expect(article.sections.map((s) => [s.sid, s.role, s.level, s.title, s.md])).toEqual([
      ['intro', 'intro', 0, undefined, 'Una introducción.'],
      ['definition', 'definition', 2, 'Definición', 'La palabra gracia.'],
      ['bible-references', 'bible-references', 2, 'Referencias bíblicas', '* Hechos 4:33'],
    ])
  })

  test('the title row wins over the level-1 heading; without a row the heading is the title; without both the name, and the report says so', async () => {
    const { groups, issues } = await build([
      tw([
        { path: 'kt/a', md: '# Del encabezado\n\n## Definición\n\nx', title: 'De la fila' },
        { path: 'kt/b', md: '# Del encabezado\n\n## Definición\n\nx' },
        { path: 'kt/c', md: '## Definición\n\nx' },
      ]),
    ])
    expect(groups.get('tw:kt')!.map((a) => a.title)).toEqual(['De la fila', 'Del encabezado', 'c'])
    expect(issues).toEqual(['tw:kt/c (es-419_gl/es-419/tw) has no title row and no level-1 heading: used "c"'])
  })

  test('a level-1 heading that is not first stays a section, and gives the title when there is no row', async () => {
    const { groups } = await build([tw([{ path: 'kt/a', md: '## Definición\n\nx\n\n# Título tardío\n\ny' }])])
    const article = groups.get('tw:kt')![0]
    expect(article.title).toBe('Título tardío')
    expect(article.sections.map((s) => [s.sid, s.level])).toEqual([
      ['definition', 2],
      ['s1', 1],
    ])
  })

  test('groups by category, in order, and articles in order of id', async () => {
    const md = '# t\n\n## Definition\n\nx'
    const { groups } = await build([tw([{ path: 'other/b', md }, { path: 'names/z', md }, { path: 'kt/b', md }, { path: 'kt/a', md }, { path: 'other/a', md }])])
    expect([...groups.keys()]).toEqual(['tw:kt', 'tw:names', 'tw:other'])
    expect([...groups].map(([, list]) => list.map((a) => a.id))).toEqual([['tw:kt/a', 'tw:kt/b'], ['tw:names/z'], ['tw:other/a', 'tw:other/b']])
  })

  test('links are rewritten as ids (ids.md); the other links stay as published', async () => {
    const md = [
      '# t',
      '## Definición',
      'Vea [[rc://*/ta/man/translate/figs-metaphor]] y [[rc://es-419/tw/dict/bible/kt/faith]] y [ley](../kt/law.md) y [[rc://*/tn/help/tit/02/03]].',
      'En [Tito 2:3](rc://*/tn/help/tit/02/03) y [web](https://example.org/a).',
    ].join('\n')
    const { groups } = await build([tw([{ path: 'kt/a', md }])])
    expect(groups.get('tw:kt')![0].sections[0].md).toBe(
      [
        'Vea [[ta:translate/figs-metaphor]] y [[tw:kt/faith]] y [ley](../kt/law.md) y [[rc://*/tn/help/tit/02/03]].',
        'En [Tito 2:3](ref:tit 2:3) y [web](https://example.org/a).',
      ].join('\n'),
    )
  })

  test('an article with nothing but a title has one empty intro, and the report says so', async () => {
    const { groups, issues } = await build([tw([{ path: 'kt/a', md: '# Solo título', title: 'Solo' }])])
    expect(groups.get('tw:kt')![0].sections).toEqual([{ sid: 'intro', level: 0, role: 'intro', lang: ES, md: '' }])
    expect(issues).toEqual(['tw:kt/a (es-419_gl/es-419/tw) has no text: one empty section'])
  })

  test('two owners publish the same tW: the first resource by key wins for an id, and the report says so', async () => {
    const gl = twRef('es-419_gl')
    const obt = twRef('es-419_obt')
    const md = (who: string) => `# ${who}\n\n## Definición\n\n${who}`
    const { groups, issues } = await build([
      tw([{ path: 'kt/a', md: md('obt') }, { path: 'kt/only-obt', md: md('obt') }], obt),
      tw([{ path: 'kt/a', md: md('gl') }, { path: 'kt/only-gl', md: md('gl') }], gl),
    ])
    const list = groups.get('tw:kt')!
    expect(list.map((a) => [a.id, a.res, a.title])).toEqual([
      ['tw:kt/a', 'es-419_gl/es-419/tw', 'gl'],
      ['tw:kt/only-gl', 'es-419_gl/es-419/tw', 'gl'],
      ['tw:kt/only-obt', 'es-419_obt/es-419/tw', 'obt'],
    ])
    expect(issues).toEqual(['tw:kt/a is in es-419_gl/es-419/tw and in es-419_obt/es-419/tw: kept the one of es-419_gl/es-419/tw'])
    // Every article names its resource by the index in the header's res.
    const res = articleResources(list, [gl, obt])
    expect(res).toEqual([['es-419_gl/es-419/tw', 'v37'], ['es-419_obt/es-419/tw', 'v37']])
    expect(artView(artSegment(ES, 'tw:kt', res, list)).articles.map((a) => a.res)).toEqual(list.map((a) => a.res))
  })

  test('rows that are not articles are left out with a line in the report', async () => {
    const ref = twRef()
    const rows = [
      ...rowsOf(ref, [{ path: 'kt/ok', md: '# t\n\n## Definición\n\nx' }]),
      { layer: 'sot', key: `${ref.key}/bible/kt/notmd`, value: { not: 'markdown' } },
      { layer: 'sot', key: `${ref.key}/bible/odd/place`, value: '# t\n\nx' },
      { layer: 'sot', key: `${ref.key}/toc.yaml`, value: 'a: b' },
      { layer: 'sot', key: `other/es/tw/bible/kt/elsewhere`, value: '# t' },
    ]
    const { groups, issues } = await build([{ ref, rows }])
    expect(groups.get('tw:kt')!.map((a) => a.id)).toEqual(['tw:kt/ok'])
    expect(issues).toEqual([
      'tw:kt/notmd (es-419_gl/es-419/tw): its text is not markdown (a string): left out',
      'es-419_gl/es-419/tw/bible/odd/place is not the key of an article of es-419_gl/es-419/tw: left out',
      'es-419_gl/es-419/tw/toc.yaml is not the key of an article of es-419_gl/es-419/tw: left out',
      'other/es/tw/bible/kt/elsewhere is not the key of an article of es-419_gl/es-419/tw: left out',
    ])
  })

  test('an article published with capitals gets the lowercase id, is not skipped, and the report says so', async () => {
    const md = '# T\n\n## Q\n\n### Descripción\n\nx'
    const { groups, registry, issues } = await build([ta([{ path: 'translate/figs-orderHeb', md, title: 'Orden hebreo' }, { path: 'translate/figs-order', md }])])
    // The title row is found by the published name; the id and the registry key are lowercase.
    expect(groups.get('ta:translate')!.map((a) => [a.id, a.title])).toEqual([
      ['ta:translate/figs-order', 'T'],
      ['ta:translate/figs-orderheb', 'Orden hebreo'],
    ])
    expect(Object.keys(registry)).toEqual(['es-419_gl/es-419/ta/translate/figs-order', 'es-419_gl/es-419/ta/translate/figs-orderheb'])
    expect(issues).toEqual(['ta:translate/figs-orderheb (es-419_gl/es-419/ta): published as "translate/figs-orderHeb", and ids are lowercase (ids.md)'])
  })

  test('a tW name with capitals is lowercased the same way, and two rows that give one id keep the first', async () => {
    const md = '# T\n\n## Definición\n\nx'
    const { groups, issues } = await build([tw([{ path: 'names/Abraham', md: '# Primero\n\n## Definición\n\nx' }, { path: 'names/abraham', md }])])
    expect(groups.get('tw:names')!.map((a) => [a.id, a.title])).toEqual([['tw:names/abraham', 'Primero']])
    expect(issues).toEqual([
      'tw:names/abraham (es-419_gl/es-419/tw): published as "names/Abraham", and ids are lowercase (ids.md)',
      'tw:names/abraham (es-419_gl/es-419/tw): the rows es-419_gl/es-419/tw/bible/names/Abraham and es-419_gl/es-419/tw/bible/names/abraham give the same id: kept the first',
    ])
  })

  test('resources of other kinds are not read', async () => {
    const notes: ResourceRef = { key: 'es-419_gl/es-419/tn', stamp: 'v1#x', kind: 'TSV Translation Notes', books: ['tit'] }
    const ref = twRef()
    const out = await extractArticles(fakeSource([tw([{ path: 'kt/a', md: '# t\n\n## Definición\n\nx' }])], [notes]), ES)
    expect([...out.groups.keys()]).toEqual(['tw:kt'])
    expect(ref.kind).toBe('Translation Words')
  })
})

describe('extractArticles: tA', () => {
  test('related: the articles of the config and of the links, both ways, in every group', async () => {
    const source = fakeSource([
      ta([
        { path: 'translate/figs-metaphor', md: '# Metáfora\n\n## ¿Qué es?\n\nVer [Símil](../figs-simile/01.md).', title: 'Metáfora' },
        { path: 'translate/figs-simile', md: '# Símil\n\n## ¿Qué es?\n\nx', title: 'Símil' },
        { path: 'translate/figs-simetaphor', md: '# Metáfora simple\n\n## ¿Qué es?\n\nVer [[rc://*/ta/man/translate/figs-metaphor]].', title: 'Metáfora simple' },
        { path: 'checking/acceptable', md: '# Aceptable\n\n## ¿Qué es?\n\nx', title: 'Aceptable' },
      ]),
    ])
    const issues: string[] = []
    const configs = new Map([['es-419_gl/es-419/ta', new Map([['checking', 'acceptable:\n  dependencies:\n    - figs-metaphor\n']])]])
    const { groups } = await extractArticles(source, ES, {}, issues, configs)
    const byId = new Map([...groups.values()].flat().map((a) => [a.id, a.related]))
    expect(byId.get('ta:translate/figs-metaphor')).toEqual(['ta:checking/acceptable', 'ta:translate/figs-simetaphor', 'ta:translate/figs-simile'])
    expect(byId.get('ta:checking/acceptable')).toEqual(['ta:translate/figs-metaphor'])
    expect(byId.get('ta:translate/figs-simile')).toEqual(['ta:translate/figs-metaphor'])
    expect(issues).toEqual([])
  })

  test('# title, then ## subtitle (the question), then the sections under ###', async () => {
    const md = '# Metáfora\n\n## ¿Qué es una metáfora?\n\n### Descripción\n\nUna comparación.\n\n### Estrategias de traducción\n\nSe puede traducir así.'
    const { groups } = await build([ta([{ path: 'translate/figs-metaphor', md, title: 'Metáfora' }])])
    expect([...groups.keys()]).toEqual(['ta:translate'])
    const article = groups.get('ta:translate')![0]
    expect(article).toMatchObject({ id: 'ta:translate/figs-metaphor', res: 'es-419_gl/es-419/ta', title: 'Metáfora', subtitle: '¿Qué es una metáfora?' })
    expect(article.related).toBeUndefined()
    expect(article.sections.map((s) => [s.sid, s.role, s.level, s.title])).toEqual([
      ['description', 'description', 3, 'Descripción'],
      ['strategies', 'strategies', 3, 'Estrategias de traducción'],
    ])
  })

  test('a tA with only the title and the subtitle and some text: the text is the intro', async () => {
    const { groups } = await build([ta([{ path: 'checking/spelling', md: '# Ortografía\n\n## ¿Se escribe igual?\n\nPara que el lector entienda.\n\nSegundo párrafo.', title: 'Ortografía' }])])
    const article = groups.get('ta:checking')![0]
    expect(article.subtitle).toBe('¿Se escribe igual?')
    expect(article.sections.map((s) => [s.sid, s.level, s.md])).toEqual([['intro', 0, 'Para que el lector entienda.\n\nSegundo párrafo.']])
  })

  test('a second ## after the subtitle is a section, as in the grammar-connect articles', async () => {
    const md = '# Conectar\n\n## ¿Cómo lo traduzco?\n\n## Relaciones condicionales\n\nTexto.\n\n### Hechos contrarios\n\n#### Descripción\n\nDefinición.'
    const { groups } = await build([ta([{ path: 'translate/grammar-connect-condition-contrary', md, title: 'Conectar' }])])
    const article = groups.get('ta:translate')![0]
    expect(article.subtitle).toBe('¿Cómo lo traduzco?')
    expect(article.sections.map((s) => [s.sid, s.level, s.role])).toEqual([
      ['s1', 2, 'unknown'],
      ['s2', 3, 'unknown'],
      ['description', 4, 'description'],
    ])
  })

  test('without a ## right after the title there is no subtitle, and a ## with text under the title before it is not one', async () => {
    const { groups } = await build([
      ta([
        { path: 'intro/a', md: '# Uno\n\n### Descripción\n\nx' },
        { path: 'intro/b', md: '# Dos\n\nAntes.\n\n## Pregunta\n\ny' },
      ]),
    ])
    const [a, b] = groups.get('ta:intro')!
    expect(a.subtitle).toBeUndefined()
    expect(b.subtitle).toBeUndefined()
    expect(b.sections.map((s) => [s.sid, s.level, s.title])).toEqual([
      ['intro', 0, undefined],
      ['s1', 2, 'Pregunta'],
    ])
  })

  test('a row of sub-titles, when the parts have one, gives the subtitle; the heading is not a section either way', async () => {
    const { groups } = await build([ta([{ path: 'process/x', md: '# T\n\n## Del texto\n\n### Descripción\n\nx', title: 'T', subtitle: 'De la fila' }])])
    const article = groups.get('ta:process')![0]
    expect(article.subtitle).toBe('De la fila')
    expect(article.sections.map((s) => s.sid)).toEqual(['description'])
  })

  test('English sections in an es-419 tA have the language en', async () => {
    const md = '# T\n\n## Q\n\n### Description\n\nIn English.\n\n### Estrategias de traducción\n\nEn español.\n\n### Translation Principles\n\nAlso English but no rule.'
    const { groups, issues } = await build([ta([{ path: 'translate/a', md, title: 'T' }])])
    expect(groups.get('ta:translate')![0].sections.map((s) => [s.sid, s.lang])).toEqual([
      ['description', 'en'],
      ['strategies', ES],
      ['s1', ES],
    ])
    expect(issues).toEqual(['ta:translate/a (es-419_gl/es-419/ta): the heading "Translation Principles" is not placed (role unknown, sid s1)'])
  })

  test('the four manuals are four groups, in order', async () => {
    const md = '# T\n\n## Q\n\n### Descripción\n\nx'
    const { groups } = await build([ta(['translate/a', 'process/a', 'intro/a', 'checking/a'].map((path) => ({ path, md })))])
    expect([...groups.keys()]).toEqual(['ta:checking', 'ta:intro', 'ta:process', 'ta:translate'])
  })

  test('tW and tA in one language are read together', async () => {
    const { groups } = await build([tw([{ path: 'kt/a', md: '# t\n\n## Definición\n\nx' }]), ta([{ path: 'translate/a', md: '# t\n\n## q\n\n### Descripción\n\nx' }])])
    expect([...groups.keys()]).toEqual(['ta:translate', 'tw:kt'])
  })
})

describe('extractArticles: the registry', () => {
  const v1 = (def: string) => `# t\n\n## ${def}\n\nLa palabra gracia se refiere a la ayuda que se da.\n\n## Sugerencias de traducción\n\nOtras formas de traducir la palabra gracia.`
  const v2 = `# t\n\n## Definición\n\nLa palabra gracia se refiere a la ayuda que se da.\n\n## Ejemplos de las historias bíblicas\n\nUn ejemplo de una historia.\n\n## Sugerencias de traducción\n\nOtras formas de traducir la palabra gracia.`

  test('the sids of the first build last: a corrected heading, a section inserted', async () => {
    const one = await build([tw([{ path: 'kt/grace', md: v1('Definition') }])])
    expect(sidsOf(one.groups.get('tw:kt')![0])).toEqual(['definition', 'translation-suggestions'])
    const two = await build([tw([{ path: 'kt/grace', md: v2 }])], one.registry)
    expect(sidsOf(two.groups.get('tw:kt')![0])).toEqual(['definition', 'examples', 'translation-suggestions'])
  })

  test('the registry goes through JSON and gives the same result', async () => {
    const one = await build([tw([{ path: 'kt/grace', md: v1('Definition') }])])
    const revived = JSON.parse(JSON.stringify(one.registry)) as SectionRegistry
    const a = await build([tw([{ path: 'kt/grace', md: v2 }])], one.registry)
    const b = await build([tw([{ path: 'kt/grace', md: v2 }])], revived)
    expect(b.groups).toEqual(a.groups)
    expect(b.registry).toEqual(a.registry)
  })

  test('the new registry has the articles built now and keeps those not built now; a deleted section\'s entry goes', async () => {
    const other = 'es-419_gl/es-419/ta/translate/not-built-now'
    const kept = [{ sid: 'description', level: 3, role: 'description' as const, fingerprint: 'f', trigrams: [1, 2] }]
    const one = await build([tw([{ path: 'kt/grace', md: v1('Definition') }])], { [other]: kept })
    expect(Object.keys(one.registry).sort()).toEqual([other, 'es-419_gl/es-419/tw/kt/grace'])
    expect(one.registry[other]).toEqual(kept)

    const two = await build([tw([{ path: 'kt/grace', md: '# t\n\n## Definición\n\nLa palabra gracia se refiere a la ayuda que se da.' }])], one.registry)
    expect(two.registry['es-419_gl/es-419/tw/kt/grace'].map((e) => e.sid)).toEqual(['definition'])
    expect(two.registry[other]).toEqual(kept)
  })

  test('the registry is canonical: the same state gives the same JSON text, whatever the history', async () => {
    const a = { path: 'kt/a', md: v1('Definition') }
    const b = { path: 'kt/b', md: v2 }
    const kept = [{ sid: 'description', level: 3, role: 'description' as const, fingerprint: 'f', trigrams: [1, 2] }]
    const k1 = 'es-419_gl/es-419/ta/translate/not-built-now'
    const k2 = 'es-419_gl/es-419/tw/kt/zzz'

    const x = await build([tw([a, b])], { [k1]: kept, [k2]: kept })
    const y = await build([tw([b, a])], { [k2]: kept, [k1]: kept })
    expect(JSON.stringify(x.registry)).toBe(JSON.stringify(y.registry))
    expect(Object.keys(x.registry)).toEqual([k1, 'es-419_gl/es-419/tw/kt/a', 'es-419_gl/es-419/tw/kt/b', k2])

    // One build of both, or one after the other, with the registry in between.
    const first = await build([tw([a])], { [k1]: kept, [k2]: kept })
    const second = await build([tw([a, b])], first.registry)
    expect(JSON.stringify(second.registry)).toBe(JSON.stringify(x.registry))
  })

  test('the registry given is not changed', async () => {
    const one = await build([tw([{ path: 'kt/grace', md: v1('Definition') }])])
    const before = JSON.stringify(one.registry)
    await build([tw([{ path: 'kt/grace', md: v2 }])], one.registry)
    expect(JSON.stringify(one.registry)).toBe(before)
  })

  test('the same rows give the same articles, the same registry and the same segment', async () => {
    const run = async () => {
      const out = await build([tw([{ path: 'kt/a', md: v1('Definition') }, { path: 'kt/b', md: v2 }]), ta([{ path: 'translate/x', md: '# T\n\n## Q\n\n### Raro\n\nUn texto con palabras.' }])])
      const articles = out.groups.get('tw:kt')!
      const { id } = await writeSegment(artSegment(ES, 'tw:kt', articleResources(articles, [twRef()]), articles))
      return JSON.stringify([[...out.groups], out.registry, out.issues, id])
    }
    expect(await run()).toBe(await run())
  })
})

describe('extractArticles: a big group', () => {
  // A word list and a generator with a fixed seed, so that 3 000 articles are different and the same on every run.
  const vocabulary = Array.from({ length: 2_000 }, (_, i) => `palabra${i.toString(36)}`)
  const article = (n: number): string => {
    let seed = n * 7919 + 1
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff)
    const paragraph = (count: number) => Array.from({ length: count }, () => vocabulary[next() % vocabulary.length]).join(' ')
    return [
      `# artículo ${n}`,
      '## Definición',
      paragraph(60),
      '## Hechos',
      paragraph(40),
      '## Sugerencias de traducción',
      paragraph(60),
      '## Ejemplos de las historias bíblicas',
      paragraph(60),
      '## Referencias bíblicas',
      paragraph(20),
      '## Datos de esta palabra',
      paragraph(10),
    ].join('\n\n')
  }

  test('3 000 articles build in a few seconds, the second time with the registry too, with the same sids', async () => {
    const items: Item[] = Array.from({ length: 3_000 }, (_, n) => ({ path: `kt/a${n.toString().padStart(4, '0')}`, md: article(n), title: `artículo ${n}` }))
    const source = [tw(items)]

    const t0 = performance.now()
    const one = await build(source)
    const first = performance.now() - t0
    expect(one.groups.get('tw:kt')).toHaveLength(3_000)
    expect(Object.keys(one.registry)).toHaveLength(3_000)

    const t1 = performance.now()
    const two = await build(source, one.registry)
    const second = performance.now() - t1
    expect(two.groups).toEqual(one.groups)
    // Not a benchmark: the sids of 18 000 sections do not take a scan of the registry each (that would be minutes).
    expect(first).toBeLessThan(15_000)
    expect(second).toBeLessThan(15_000)
    console.log(`3 000 articles: first build ${Math.round(first)} ms, second build ${Math.round(second)} ms`)
  }, 60_000)
})

// The segment

describe('artSegment', () => {
  const RES: [string, string][] = [[TW, 'v37']]
  const section = (sid: string, extra: Partial<ArticleModel['sections'][number]> = {}): ArticleModel['sections'][number] => ({
    sid,
    level: 2,
    role: 'unknown',
    lang: ES,
    md: `texto de ${sid}`,
    ...extra,
  })
  const full: ArticleModel = {
    id: 'tw:kt/grace',
    res: TW,
    title: 'gracia, amable',
    subtitle: 'una pregunta',
    related: ['ta:translate/figs-metaphor', 'tw:kt/faith'],
    aliases: ['tw:other/grace'],
    sections: [
      section('intro', { level: 0, role: 'intro', md: '' }),
      section('definition', { role: 'definition', title: 'Definición', aliases: ['s1', 's2'] }),
      section('s3', { title: 'Raro', lang: 'en', md: 'multi\nline\n\ntext with “unicode” ñ' }),
    ],
  }
  const plain: ArticleModel = { id: 'tw:kt/faith', res: TW, title: 'fe', sections: [section('definition', { role: 'definition' })] }

  test('the header and the table as art.cddl says: no string table, the articles as maps', () => {
    const seg = artSegment(ES, 'tw:kt', RES, [plain, full])
    expect(seg.h).toEqual({ class: 'art', v: 1, tables: { articles: [1, true] }, lang: ES, group: 'tw:kt', res: [[TW, 'v37']] })
    expect(Object.keys(seg.t)).toEqual(['articles'])
    const articles = seg.t.articles as Record<string, unknown>[]
    expect(articles.map((a) => a.id)).toEqual(['tw:kt/faith', 'tw:kt/grace'])
    expect(articles[0].res).toBe(0)
  })

  test('the keys an article or a section lacks are left out', () => {
    const articles = artSegment(ES, 'tw:kt', RES, [plain]).t.articles as any[]
    expect(Object.keys(articles[0]).sort()).toEqual(['id', 'res', 'sections', 'title'])
    expect(Object.keys(articles[0].sections[0]).sort()).toEqual(['lang', 'level', 'md', 'role', 'sid'])
  })

  test('artView(artSegment(...)) is the input, with every optional key', () => {
    const view = artView(artSegment(ES, 'tw:kt', RES, [plain, full]))
    expect(view).toEqual({ group: 'tw:kt', articles: [plain, full] })
  })

  test('through the file: write, read with the known tables, view', async () => {
    const { bytes } = await writeSegment(artSegment(ES, 'tw:kt', RES, [plain, full]))
    const { seg } = await readSegment(bytes, { known: ART_TABLES })
    expect(artView(seg)).toEqual({ group: 'tw:kt', articles: [plain, full] })
  })

  test('the order of the input does not matter: the same bytes', async () => {
    const a = await writeSegment(artSegment(ES, 'tw:kt', RES, [full, plain]))
    const b = await writeSegment(artSegment(ES, 'tw:kt', RES, [plain, full]))
    expect(a.id).toBe(b.id)
    expect(Array.from(a.body)).toEqual(Array.from(b.body))
  })

  test('the ids are ordered by code point, not by UTF-16 code unit', () => {
    const ids = ['tw:kt/\u{1d538}', 'tw:kt/\uFFFF', 'tw:kt/a']
    const seg = artSegment(ES, 'tw:kt', RES, ids.map((id) => ({ ...plain, id })))
    expect((seg.t.articles as any[]).map((a) => a.id)).toEqual(['tw:kt/a', 'tw:kt/\uFFFF', 'tw:kt/\u{1d538}'])
  })

  test('the body is deterministic CBOR that decodes to the same map', async () => {
    const { body } = await writeSegment(artSegment(ES, 'tw:kt', RES, [plain]))
    const decoded = decodeCbor(body) as any
    expect(decoded.t.articles[0].sections[0].sid).toBe('definition')
  })

  test('two resources: an article names its own', () => {
    const res: [string, string][] = [[TW, 'v37'], ['es-419_obt/es-419/tw', 'v2']]
    const view = artView(artSegment(ES, 'tw:kt', res, [plain, { ...full, res: res[1][0] }]))
    expect(view.articles.map((a) => a.res)).toEqual([TW, 'es-419_obt/es-419/tw'])
  })

  const refuses: [string, () => unknown][] = [
    ['no resource in res', () => artSegment(ES, 'tw:kt', [], [plain])],
    ['a resource twice in res', () => artSegment(ES, 'tw:kt', [[TW, 'v1'], [TW, 'v2']], [plain])],
    ['an article of a resource res does not list', () => artSegment(ES, 'tw:kt', RES, [{ ...plain, res: 'other' }])],
    ['an id twice', () => artSegment(ES, 'tw:kt', RES, [plain, plain])],
    ['an article with no sections', () => artSegment(ES, 'tw:kt', RES, [{ ...plain, sections: [] }])],
    ['a sid twice in an article', () => artSegment(ES, 'tw:kt', RES, [{ ...plain, sections: [section('a'), section('a')] }])],
    ['a role that is not in the list', () => artSegment(ES, 'tw:kt', RES, [{ ...plain, sections: [section('a', { role: 'summary' as never })] }])],
    ['a level that is not a count', () => artSegment(ES, 'tw:kt', RES, [{ ...plain, sections: [section('a', { level: -1 })] }])],
    ['a title that is not text', () => artSegment(ES, 'tw:kt', RES, [{ ...plain, title: undefined as never }])],
    ['aliases that are not text', () => artSegment(ES, 'tw:kt', RES, [{ ...plain, aliases: [1] as never }])],
  ]
  for (const [name, run] of refuses) test(`refuses ${name}`, () => expect(run).toThrow(Error))

  test('articleResources lists the resources of the articles by key, with the tag before the #', () => {
    const refs = [twRef('es-419_obt'), twRef('es-419_gl')]
    expect(articleResources([{ ...plain, res: refs[0].key }, plain], refs)).toEqual([['es-419_gl/es-419/tw', 'v37'], ['es-419_obt/es-419/tw', 'v37']])
    expect(() => articleResources([plain], [])).toThrow(Error)
  })
})
