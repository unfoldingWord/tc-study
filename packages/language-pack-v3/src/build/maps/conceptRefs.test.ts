import { describe, expect, test } from 'bun:test'
import { partsSource } from '../../node/partsSource'
import type { Row } from '../../source/rows'
import { sourceRows } from '../bookHelps'
import { conceptRefs, tallyRefs } from './conceptRefs'
import { coverageOf } from './coverage'
import { Tally } from './tally'

const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data')
const TN = 'es-419_gl/es-419/tn'
const TWL = 'es-419_gl/es-419/twl'
const source = () => partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })

async function rowsOf(resource: string): Promise<Row[]> {
  const src = await source()
  const out: Row[] = []
  for await (const row of src.rows({ lang: 'es-419', book: 'tit', resource })) out.push(row)
  return out
}

/** A tN book row with the given notes. */
const notes = (list: Record<string, string>[]): Row[] => [{ layer: 'sot', key: `tn:${TN}:tit`, value: { notes: list } } as unknown as Row]

describe('conceptRefs', () => {
  test('tN: one per row with a SupportReference, metaphor included', async () => {
    const rows = await rowsOf(TN)
    const items = sourceRows(rows, 'tit', TN, 'notes').map((r) => r.item as Record<string, unknown>)
    const withRef = items.filter((i) => typeof i.supportReference === 'string' && i.supportReference !== '')
    const refs = conceptRefs(rows, 'tit', TN, 'notes')
    expect(withRef.length).toBeGreaterThan(0)
    expect(refs.length).toBe(withRef.length)
    expect(refs.some((r) => r.concept === 'ta:translate/figs-metaphor')).toBe(true)
    expect(refs.every((r) => r.from !== undefined)).toBe(true)
  })

  test('tWL: concepts of the links', async () => {
    const refs = conceptRefs(await rowsOf(TWL), 'tit', TWL, 'links')
    expect(refs.length).toBeGreaterThan(0)
    expect(refs.every((r) => r.concept.startsWith('tw:'))).toBe(true)
  })

  test('a concept is lowercased', () => {
    const refs = conceptRefs(notes([{ id: 'a', reference: '1:1', supportReference: 'rc://*/ta/man/translate/figs-orderHeb' }]), 'tit', TN, 'notes')
    expect(refs[0]?.concept).toBe('ta:translate/figs-orderheb')
  })

  test('a row without a concept is skipped', () => {
    expect(conceptRefs(notes([{ id: 'a', reference: '1:1', supportReference: '' }, { id: 'b', reference: '1:1' }]), 'tit', TN, 'notes')).toEqual([])
  })

  test('a list reference gives the lowest and highest verse', () => {
    const [ref] = conceptRefs(notes([{ id: 'a', reference: '1:1,3', supportReference: 'rc://*/ta/man/translate/figs-metaphor' }]), 'tit', TN, 'notes')
    expect(ref).toEqual({ concept: 'ta:translate/figs-metaphor', from: 56001001, to: 56001003 })
  })

  test('an unreadable reference: no range, one issue, still counted', () => {
    const issues: string[] = []
    const refs = conceptRefs(notes([{ id: 'a', reference: 'x:y', supportReference: 'rc://*/ta/man/translate/figs-metaphor' }]), 'tit', TN, 'notes', issues)
    expect(refs).toEqual([{ concept: 'ta:translate/figs-metaphor' }])
    expect(issues.length).toBe(1)
    const tally = new Tally('notes')
    tallyRefs(tally, 'tit', refs, [56001001])
    expect(tally.table().rows.get('ta:translate/figs-metaphor')?.get('tit')).toEqual([1, 0])
  })

  test('a note on 1:2-4 adds 3 verses', () => {
    const refs = conceptRefs(notes([{ id: 'a', reference: '1:2-4', supportReference: 'rc://*/ta/man/translate/figs-metaphor' }]), 'tit', TN, 'notes')
    const tally = new Tally('notes')
    tallyRefs(tally, 'tit', refs, [56001001, 56001002, 56001003, 56001004, 56001005])
    expect(tally.table().rows.get('ta:translate/figs-metaphor')?.get('tit')).toEqual([1, 3])
  })
})

describe('coverageOf', () => {
  test('whole and partial', async () => {
    const refs = await (await source()).resources('es-419')
    const whole = coverageOf(refs, false)
    expect(whole.get(TN)).toEqual({ whole: ['tit'], partial: [] })
    expect(coverageOf(refs, true).get(TN)).toEqual({ whole: [], partial: ['tit'] })
  })
})
