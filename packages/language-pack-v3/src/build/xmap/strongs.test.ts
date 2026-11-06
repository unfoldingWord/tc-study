import { describe, expect, test } from 'bun:test'
import type { OrigModel } from '../../model'
import type { Row } from '../../source/rows'
import { partsSource } from '../../node/partsSource'
import { verseId } from '../../ids'
import { extractOrig, OrigIndex } from '../orig'
import { strongsOfQuotes, strongsRecord } from './strongs'

const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data')
const TWL = 'es-419_gl/es-419/twl'

async function titus(): Promise<{ orig: OrigModel; rows: Row[] }> {
  const src = await partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })
  const orig = await extractOrig(src, 'tit')
  const rows: Row[] = []
  for await (const row of src.rows({ lang: 'es-419', book: 'tit', resource: TWL })) rows.push(row)
  return { orig, rows }
}

/** The rows of a link list of Titus, as the part files hold them. */
const linkRows = (items: Record<string, string>[]): Row[] => [
  { layer: 'sot', key: `twl:${TWL}:tit:1`, value: { links: items } } as unknown as Row,
]

describe('strongsOfQuotes', () => {
  test('es-419 Titus: grace has G54850, every set is non-empty and every key is Greek', async () => {
    const { orig, rows } = await titus()
    const into = new Map<string, Set<string>>()
    strongsOfQuotes(rows, 'tit', TWL, orig, into)
    expect(into.get('tw:kt/grace')?.has('G54850')).toBe(true)
    expect(into.size).toBeGreaterThan(0)
    for (const set of into.values()) {
      expect(set.size).toBeGreaterThan(0)
      for (const key of set) expect(key.startsWith('G')).toBe(true)
    }
  })

  test('a quote that is not in the verse, or a piece of it, gives no key', async () => {
    const { orig, rows } = await titus()
    const real = (rows.find((r) => r.key.startsWith('twl:')) as unknown as { value: { links: Record<string, string>[] } }).value.links[0]
    const base = { id: 'a', reference: real.reference, twLink: real.twLink, occurrence: '1' }
    const into = new Map<string, Set<string>>()
    strongsOfQuotes(linkRows([{ ...base, origWords: 'zzzz' }, { ...base, origWords: `${real.origWords} & zzzz` }]), 'tit', TWL, orig, into)
    expect(into.size).toBe(0)
    strongsOfQuotes(linkRows([{ ...base, origWords: real.origWords }]), 'tit', TWL, orig, into)
    expect(into.size).toBe(1)
  })

  test('the mark-free form is tried only when the exact form has no run', async () => {
    const { orig, rows } = await titus()
    const real = (rows.find((r) => r.key.startsWith('twl:')) as unknown as { value: { links: Record<string, string>[] } }).value.links[0]
    const index = new OrigIndex(orig)
    const [c, v] = real.reference.split(':').map(Number)
    const at = orig.words.map((_, i) => i).filter((i) => index.verseOf(i) === verseId('tit', c, v))
    // Three words of the verse: one exact (no marks) and two with an accent, so the exact form has 1 run and the mark-free form 3.
    const words = orig.words.map((w) => ({ ...w }))
    at.slice(0, 3).forEach((i, k) => {
      words[i].form = k === 0 ? 'λογος' : 'λόγος'
      words[i].strong = 'G30560'
    })
    const changed = { ...orig, words }
    const ask = (occurrence: string): number => {
      const into = new Map<string, Set<string>>()
      strongsOfQuotes(linkRows([{ id: 'a', reference: real.reference, twLink: real.twLink, origWords: 'λογος', occurrence }]), 'tit', TWL, changed, into)
      return into.size
    }
    expect(ask('1')).toBe(1)
    expect(ask('2')).toBe(0)
  })

  test('an occurrence beyond the runs finds nothing', async () => {
    const { orig, rows } = await titus()
    const real = (rows.find((r) => r.key.startsWith('twl:')) as unknown as { value: { links: Record<string, string>[] } }).value.links[0]
    const into = new Map<string, Set<string>>()
    strongsOfQuotes(linkRows([{ id: 'a', reference: real.reference, twLink: real.twLink, origWords: real.origWords, occurrence: '9' }]), 'tit', TWL, orig, into)
    expect(into.size).toBe(0)
  })
})

describe('strongsRecord', () => {
  test('sorts keys and values and leaves out empty concepts', () => {
    const m = new Map<string, Set<string>>([
      ['tw:b', new Set(['G2', 'G10'])],
      ['tw:a', new Set(['G3'])],
      ['tw:c', new Set()],
    ])
    const record = strongsRecord(m)
    expect(Object.keys(record)).toEqual(['tw:a', 'tw:b'])
    expect(record['tw:b']).toEqual(['G10', 'G2'])
  })
})
