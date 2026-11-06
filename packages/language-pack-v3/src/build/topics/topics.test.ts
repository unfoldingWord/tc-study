import { describe, expect, test } from 'bun:test'
import { verseId } from '../../ids'
import type { XtopicsCore } from '../../model'
import { topicsSegment } from './segment'
import { buildTopics } from './topics'

const core = {
  part: 'core',
  res: [],
  coverage: new Map(),
  occurrences: new Map(),
  ranges: { 'obs:3': [[verseId('gen', 3, 1), verseId('gen', 3, 24)]] },
  topics: new Map([
    ['sec:tit/1-1', { kind: 'section', source: 'x', ref: 'tit/1-1', title: 'Greeting', ustrong: '' }],
    ['obs:3', { kind: 'story', source: 'x', ref: '3', title: 'The Fall', ustrong: '' }],
  ]),
} as unknown as XtopicsCore

const base = { lang: 'es-419', xtopics: core, records: [], books: [], origs: new Map(), lastVerse: () => 16, releases: new Map([['es/tn', 'v1'], ['es/obs', 'v2']]) }

describe('buildTopics', () => {
  test('outline entries name a section or become local topics; OBS titles name stories; ids not in the core are left out', () => {
    const outlines = new Map([
      [
        'tit',
        [
          { title: 'Saludo', from: verseId('tit', 1, 1), to: verseId('tit', 1, 16) },
          { title: 'Los ancianos y su conducta', from: verseId('tit', 1, 5), to: verseId('tit', 1, 9) },
        ],
      ],
    ])
    const out = buildTopics({ ...base, outlines, outlineRes: 'es/tn', obs: [{ n: 3, title: 'La caída' }, { n: 4, title: 'Sin id' }], obsRes: ['es/obs'] })
    expect(out.core.names['sec:tit/1-1']).toEqual([['Saludo', 'outline', 1, ['tit']]])
    expect(out.core.names['obs:3']).toEqual([['La caída', 'obs', 1, ['gen']]])
    expect(Object.keys(out.core.names).sort()).toEqual(['obs:3', 'sec:tit/1-1'])
    expect(out.core.local).toEqual({ 'es-419:tema/tit/los-ancianos-y-su-conducta': { names: ['Los ancianos y su conducta'], refs: [[verseId('tit', 1, 5), verseId('tit', 1, 9)]] } })
    expect(out.report.some((l) => l.includes('obs:4'))).toBe(true)
    expect(out.parts).toEqual([])
    expect(out.core.res).toEqual([['es/obs', 'v2'], ['es/tn', 'v1']])
    // the writer accepts it
    expect(topicsSegment(out.core).h.class).toBe('topics')
  })

  test('local topic ids do not depend on the books built; a clash inside one book gets -2, -3 in outline order', () => {
    const t = (a: number, b: number) => ({ title: 'La gracia', from: verseId('tit', 1, a), to: verseId('tit', 1, b) })
    const tit = [t(5, 9), t(10, 12), t(13, 15), t(5, 9)]
    const jud = [{ title: 'La gracia', from: verseId('jud', 1, 1), to: verseId('jud', 1, 4) }]
    const only = buildTopics({ ...base, outlines: new Map([['tit', tit]]), outlineRes: 'es/tn', obs: [] })
    const both = buildTopics({ ...base, outlines: new Map([['jud', jud], ['tit', tit]]), outlineRes: 'es/tn', obs: [] })
    expect(Object.keys(only.core.local!)).toEqual(['es-419:tema/tit/la-gracia', 'es-419:tema/tit/la-gracia-2', 'es-419:tema/tit/la-gracia-3'])
    expect(both.core.local!['es-419:tema/jud/la-gracia']).toBeDefined()
    for (const k of Object.keys(only.core.local!)) expect(both.core.local![k]).toEqual(only.core.local![k])
  })

  test('outline names are stored in NFC, for a section and for a local topic', () => {
    const decomposed = 'Salutación' // o + combining acute
    const outlines = new Map([
      [
        'tit',
        [
          { title: decomposed, from: verseId('tit', 1, 1), to: verseId('tit', 1, 16) },
          { title: 'Concepción', from: verseId('tit', 1, 5), to: verseId('tit', 1, 9) },
        ],
      ],
    ])
    const out = buildTopics({ ...base, outlines, outlineRes: 'es/tn', obs: [] })
    expect(out.core.names['sec:tit/1-1'][0][0]).toBe('Salutación')
    expect(out.core.names['sec:tit/1-1'][0][0]).not.toBe(decomposed)
    const local = Object.values(out.core.local!)[0]
    expect(local.names).toEqual(['Concepción'])
  })

  test('nothing to name gives an empty core that the writer accepts (res may be empty)', () => {
    const out = buildTopics({ ...base, outlines: new Map(), obs: [] })
    expect(out.core.res).toEqual([])
    expect(topicsSegment(out.core).h.res).toEqual([])
  })
})
