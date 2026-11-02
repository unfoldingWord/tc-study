import { describe, expect, test } from 'bun:test'
import type { HelpTable, OrigModel } from '../../model'
import { partsSource } from '../../node/partsSource'
import { extractHelps } from '../bookHelps'
import { extractOrig, OrigIndex } from '../orig'
import { strongsOfLinks, strongsRecord } from './strongs'

const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data')
const TWL = 'es-419_gl/es-419/twl'

async function titus(): Promise<{ orig: OrigModel; links: HelpTable }> {
  const src = await partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })
  const orig = await extractOrig(src, 'tit')
  const rows = []
  for await (const row of src.rows({ lang: 'es-419', book: 'tit', resource: TWL })) rows.push(row)
  return { orig, links: extractHelps(rows, 'tit', TWL, 'links', new OrigIndex(orig)) }
}

describe('strongsOfLinks', () => {
  test('es-419 Titus: grace has G54850, every set is non-empty and every key is Greek', async () => {
    const { orig, links } = await titus()
    const into = new Map<string, Set<string>>()
    strongsOfLinks(links, orig, into)
    expect(into.get('tw:kt/grace')?.has('G54850')).toBe(true)
    expect(into.size).toBeGreaterThan(0)
    for (const set of into.values()) {
      expect(set.size).toBeGreaterThan(0)
      for (const key of set) expect(key.startsWith('G')).toBe(true)
    }
  })

  test('a quote of -1 only adds nothing', async () => {
    const { orig } = await titus()
    const links: HelpTable = { res: TWL, rows: [{ id: 'a', ref: '1:1', from: 56001001, to: 56001001, concept: 'tw:kt/grace', cols: {}, quote: [-1, -1] }] }
    const into = new Map<string, Set<string>>()
    strongsOfLinks(links, orig, into)
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
