import { beforeAll, describe, expect, test } from 'bun:test'
import { partsSource } from '../node/partsSource'
import { type ResourceRef, type Row, type RowFilter, type RowSource } from '../source/rows'
import { type BuiltSegment } from './catalog'
import { BUILDER, buildCommon, buildLanguage } from './language'

// What a change in one row or one stamp invalidates (spec/catalog.md): the ids of the segments, on the real sample.
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const PARTS = join(DATA, 'parts')
const ORIGINALS_LIST = join(DATA, 'originals', 'list.json')
const ES = 'es-419'
const TN_ES = 'es-419_gl/es-419/tn'
const TN_EN = 'unfoldingWord/en/tn'
const about = { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER } as const

const source = (lang: string) => partsSource({ list: join(DATA, lang, 'list.json'), partsDir: PARTS, originals: ORIGINALS_LIST })

type Tweak = { ref?: (ref: ResourceRef) => Partial<ResourceRef>; row?: (row: Row, f: RowFilter) => Row }
function tweak(inner: RowSource, t: Tweak): RowSource {
  return {
    async resources(lang) {
      return (await inner.resources(lang)).map((ref) => ({ ...ref, ...t.ref?.(ref) }))
    },
    async *rows(f) {
      for await (const row of inner.rows(f)) yield t.row === undefined ? row : t.row(row, f)
    },
  }
}

type Note = { id: string; note: string; supportReference: string; isIntro: boolean }
/** Edits the first non-intro note with a SupportReference of the notes chunk of Titus in `resource`; `edit` gets the note. */
function editNote(resource: string, edit: (note: Note) => Note): Tweak {
  let done = false
  return {
    row: (row) => {
      if (done || row.layer !== 'sot' || !/^tn:.*:tit:\d+$/.test(row.key) || !row.key.startsWith(`tn:${resource}:`)) return row
      const value = JSON.parse(JSON.stringify(row.value))
      const notes: Note[] | undefined = value.content?.notes
      const target = notes?.find((n) => !n.isIntro && n.supportReference !== '')
      if (target === undefined) return row
      done = true
      Object.assign(target, edit(target))
      return { ...row, value }
    },
  }
}
const reworded = (n: Note): Note => ({ ...n, note: `${n.note} (otra palabra)` })
const rereferenced = (n: Note): Note => ({ ...n, supportReference: 'rc://*/ta/man/translate/figs-zzz-other' })

const label = (s: BuiltSegment) => `${s.seg.h.class}:${s.seg.h.part ?? s.seg.h.book ?? s.seg.h.group ?? ''}`
const idsByLabel = (segments: BuiltSegment[]) => Object.fromEntries(segments.map((s) => [label(s), s.id]))
const changed = (a: BuiltSegment[], b: BuiltSegment[]) => {
  const x = idsByLabel(a)
  const y = idsByLabel(b)
  expect(Object.keys(y)).toEqual(Object.keys(x))
  return Object.keys(x).filter((k) => x[k] !== y[k])
}

describe('invalidation of the segment ids', () => {
  let base: Awaited<ReturnType<typeof buildLanguage>>
  let baseCommon: Awaited<ReturnType<typeof buildCommon>>
  const language = async (t: Tweak) => buildLanguage({ source: tweak(await source(ES), t), lang: ES, registry: {}, about })
  const common = async (t: Tweak) => buildCommon({ source: tweak(await source('en'), t), about, mapLang: 'en' })

  beforeAll(async () => {
    base = await language({})
    baseCommon = await common({})
  })

  test('the base has the segments the tests look at', () => {
    expect(Object.keys(idsByLabel(base.segments))).toEqual(expect.arrayContaining(['map:core', 'map:tit', 'book:tit']))
    expect(Object.keys(idsByLabel(baseCommon.segments))).toEqual(expect.arrayContaining(['xmap:core', 'xmap:tit', 'orig:tit']))
  })

  test('the wording of an es-419 note changes the book of Titus and the catalog, and nothing else', async () => {
    const built = await language(editNote(TN_ES, reworded))
    expect(changed(base.segments, built.segments)).toEqual(['book:tit'])
    expect(built.catalog.id).not.toBe(base.catalog.id)
  })

  test('the SupportReference of an es-419 note changes the book, the map core, the map part tit and the catalog', async () => {
    const built = await language(editNote(TN_ES, rereferenced))
    expect(changed(base.segments, built.segments).sort()).toEqual(['book:tit', 'map:core', 'map:tit'])
    expect(built.catalog.id).not.toBe(base.catalog.id)
  })

  test('the release stamp of es-419 tN, same rows: the book, the map core and the catalog change; the map part tit keeps its id', async () => {
    const built = await language({ ref: (ref) => (ref.key === TN_ES ? { stamp: 'v67#2030-01-01T00_00_00Z' } : {}) })
    // Same rows, another release: the ids of the book and of the core follow it (v66 -> v67), the part does not.
    const changedIds = changed(base.segments, built.segments)
    expect(changedIds).toContain('map:core')
    expect(changedIds).toContain('book:tit')
    expect(changedIds).not.toContain('map:tit')
    expect(built.catalog.id).not.toBe(base.catalog.id)
    const inputs = (b: typeof base, l: string) => b.segments.find((s) => label(s) === l)!.inputs
    expect(inputs(built, 'book:tit')).not.toBe(inputs(base, 'book:tit'))
    expect(inputs(built, 'map:tit')).toBe(inputs(base, 'map:tit'))
  })

  test('the SupportReference of an English note changes the xmap core, its part tit and the common catalog; no es-419 segment changes', async () => {
    const edit = editNote(TN_EN, rereferenced)
    const built = await common(edit)
    expect(changed(baseCommon.segments, built.segments).sort()).toEqual(['xmap:core', 'xmap:tit'])
    expect(built.catalog.id).not.toBe(baseCommon.catalog.id)
    // The es-419 build does not read the English rows.
    const es = await buildLanguage({ source: tweak(await source(ES), {}), lang: ES, registry: {}, about })
    expect(changed(base.segments, es.segments)).toEqual([])
    expect(es.catalog.id).toBe(base.catalog.id)
  })
})
