import { describe, expect, test } from 'bun:test'
import type { BookModel } from '../../model'
import { partsSource } from '../../node/partsSource'
import { extractArticles } from '../art'
import { extractBook } from '../bookHelps'
import { extractObs } from '../obs'
import { extractOrig } from '../orig'
import { versesOf } from '../maps/verses'
import { buildMap } from './build'

const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data')

async function setup() {
  const source = await partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })
  const refs = await source.resources('es-419')
  const orig = await extractOrig(source, 'tit')
  const model: BookModel = await extractBook(source, 'es-419', 'tit', orig, [])
  const { groups } = await extractArticles(source, 'es-419', {}, [])
  const articles = [...groups.values()].flat()
  const obs = await extractObs(source, 'es-419', [])
  return { refs, model, verses: versesOf(orig), articles, obs }
}

describe('buildMap, es-419 Titus', () => {
  test('usage counts the notes by concept; the part lists the same verses; coverage is whole', async () => {
    const { refs, model, verses, articles, obs } = await setup()
    const { core, parts } = buildMap({ lang: 'es-419', refs, books: [{ model, verses }], articles, obs })
    const metaphor = model.notes!.rows.filter((r) => r.concept === 'ta:translate/figs-metaphor')
    expect(metaphor.length).toBe(15)
    const distinct = new Set<number>()
    for (const r of metaphor) for (const v of verses.filter((x) => x >= r.from && x <= r.to)) distinct.add(v)
    const cell = core.usage!.rows.get('ta:translate/figs-metaphor')!.get('tit')!
    expect(cell).toEqual([metaphor.length, distinct.size])
    expect(parts.map((p) => p.part)).toEqual(['tit'])
    expect(parts[0].usage!.get('ta:translate/figs-metaphor')).toEqual([...distinct].sort((a, b) => a - b))
    expect(core.coverage.get('es-419_gl/es-419/tn')).toEqual({ whole: ['tit'], partial: [] })
    expect(core.names['tw:kt/grace'].length).toBeGreaterThan(0)
    expect(core.books.length).toBe(66)
    expect(core.part).toBe('core')
    expect(core.res.length).toBe(refs.length)
  })

  test('partial marks the coverage partial', async () => {
    const { refs, model, verses, articles, obs } = await setup()
    const { core } = buildMap({ lang: 'es-419', refs, books: [{ model, verses }], articles, obs, partial: true })
    expect(core.coverage.get('es-419_gl/es-419/tn')).toEqual({ whole: [], partial: ['tit'] })
  })

  test('a language with no notes has no usage and no parts', async () => {
    const { refs, model, verses, articles, obs } = await setup()
    const { core, parts } = buildMap({ lang: 'es-419', refs, books: [{ model: { ...model, notes: undefined }, verses }], articles, obs })
    expect(core.usage).toBeUndefined()
    expect(parts).toEqual([])
  })

  test('building twice gives equal results', async () => {
    const { refs, model, verses, articles, obs } = await setup()
    const o = { lang: 'es-419', refs, books: [{ model, verses }], articles, obs }
    expect(buildMap(o)).toEqual(buildMap(o))
  })
})
