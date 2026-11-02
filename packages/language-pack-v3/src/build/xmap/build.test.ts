import { describe, expect, test } from 'bun:test'
import type { OrigModel } from '../../model'
import { partsSource } from '../../node/partsSource'
import { extractOrig } from '../orig'
import { strongTally } from './strong'
import { buildXmap } from './build'
import { versesOf } from '../maps/verses'

const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data')

async function setup() {
  const source = await partsSource({ list: join(DATA, 'en', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })
  const orig: OrigModel = await extractOrig(source, 'tit')
  return { source, orig }
}

describe('buildXmap, English Titus', () => {
  test('the core and the part of Titus', async () => {
    const { source, orig } = await setup()
    const { core, parts } = await buildXmap({ source, origs: [orig], lang: 'en' })

    let sum = 0
    for (const byBook of core.strong.rows.values()) sum += byBook.get('tit')?.[0] ?? 0
    expect(sum).toBe(orig.words.filter((w) => w.strong !== '').length)

    expect(core.notes?.rows.get('ta:translate/figs-metaphor')?.get('tit')).toEqual([22, 21])
    expect(core.coverage.get('unfoldingWord/en/tn')?.whole).toEqual(['tit'])
    expect(core.coverage.get('unfoldingWord/en/twl')?.whole).toEqual(['tit'])
    expect(core.concepts.get('tw:kt/grace')?.tw).toBe('kt')
    expect(core.concepts.get('tw:kt/grace')?.source).toBe('unfoldingWord/en/tw')
    expect(core.concepts.get('ta:translate/figs-metaphor')?.source).toBe('unfoldingWord/en/ta')
    expect(core.strongs?.['tw:kt/grace']).toContain('G54850')
    expect(core.res[0][0]).toBe('unfoldingWord/el-x-koine/ugnt')

    expect(parts.map((p) => p.part)).toEqual(['tit'])
    const wanted = new Set<number>()
    const tally = strongTally(orig)
    for (const list of tally.verseLists('tit').values()) for (const v of list) wanted.add(v)
    const got = new Set<number>()
    for (const list of parts[0].strong.values()) for (const v of list) got.add(v)
    expect(got).toEqual(wanted)
    const known = new Set(versesOf(orig))
    expect(known.size).toBeGreaterThan(0)
    expect([...got].filter((v) => !known.has(v))).toEqual([])
  })

  test('building twice gives equal results', async () => {
    const { source, orig } = await setup()
    const a = await buildXmap({ source, origs: [orig], lang: 'en' })
    const b = await buildXmap({ source, origs: [orig], lang: 'en' })
    expect(b).toEqual(a)
  })
})
