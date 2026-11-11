import { describe, expect, test } from 'bun:test'
import type { CatalogModel, SegmentEntry, Unit } from '@bt-synergy/language-pack-v3'
import { activate, planInstall, updates } from './plan'
import { emptyState, qualify } from './state'
import type { VerifiedCatalog } from './verify'

const idOf = (n: number): Uint8Array => new Uint8Array(32).fill(n)
const hexOf = (n: number): string => n.toString(16).padStart(2, '0').repeat(32)

/** A segment per entry of `segs`: [id byte, size]. Units refer to indexes. */
function cat(
  name: string,
  revision: number,
  segs: [number, number][],
  units: Unit[],
  requires?: string[],
  classes: string[] = [],
): VerifiedCatalog {
  const segments: SegmentEntry[] = segs.map(([n, size], i) => ({
    id: idOf(n),
    class: classes[i] ?? 'text',
    size,
    ulen: size,
    inputs: new Uint8Array(32),
  }))
  const catalog = {
    ...(name === 'common' ? {} : { lang: name }),
    about: { format: '3.0', catalog: name, publisher: 'pub', origin: 'published', revision, built: 'x', builder: 'x' },
    resources: [],
    segments,
    units,
    ...(requires ? { requires: requires.map((r) => [r, 1, idOf(0)] as [string, number, Uint8Array]) } : {}),
  } as CatalogModel
  return { id: String(revision).repeat(64).slice(0, 64), bytes: new Uint8Array(), catalog, name, publisher: 'pub', revision, origin: 'published' }
}

const common = () =>
  cat('common', 1, [[1, 10], [2, 20], [3, 30]], [
    { id: 'xmap', segments: [0] },
    { id: 'orig:rut', segments: [1] },
    { id: 'orig:tit', segments: [2] },
  ])
const es = (rutSeg = 14, rev = 5) =>
  cat(
    'es-419',
    rev,
    [[11, 100], [12, 200], [13, 300], [rutSeg, 400], [15, 500]],
    [
      { id: 'map', segments: [0] },
      { id: 'art:tw:kt', segments: [1] },
      { id: 'book:rut', segments: [3], needs: ['orig:rut', 'map', 'art:tw:kt'] },
      { id: 'book:tit', segments: [2], needs: ['orig:tit'] },
      { id: 'aligned:a-am', segments: [4], optional: true },
    ],
    ['common'],
  )

describe('qualify', () => {
  test('own catalog first, then a required one, else own', () => {
    const cs = [common(), es()]
    expect(qualify(cs, 'es-419', 'map')).toBe('es-419/map')
    expect(qualify(cs, 'es-419', 'orig:rut')).toBe('common/orig:rut')
    expect(qualify(cs, 'es-419', 'orig:zzz')).toBe('es-419/orig:zzz')
  })
})

describe('planInstall', () => {
  const cs = [common(), es()]
  test('Ruth: maps first, then its needs, then the book; bytes counts what is missing', () => {
    const p = planInstall(cs, emptyState(), { books: ['rut'] }, new Set())
    expect(p.steps.map((s) => s.key)).toEqual(['common/xmap', 'es-419/map', 'common/orig:rut', 'es-419/art:tw:kt', 'es-419/book:rut'])
    expect(p.bytes).toBe(10 + 100 + 20 + 200 + 400)
    expect(p.unknown).toEqual([])
    const q = planInstall(cs, emptyState(), { books: ['rut'] }, new Set([hexOf(2), hexOf(11)]))
    expect(q.bytes).toBe(10 + 200 + 400)
    expect(q.steps.find((s) => s.key === 'common/orig:rut')!.complete).toBe(true)
  })
  test('aligned units only when named; true brings all', () => {
    expect(planInstall(cs, emptyState(), { books: ['rut'] }, new Set()).steps.some((s) => s.unit.startsWith('aligned:'))).toBe(false)
    expect(planInstall(cs, emptyState(), { aligned: true, defaults: false }, new Set()).steps.map((s) => s.key)).toEqual(['es-419/aligned:a-am'])
    expect(planInstall(cs, emptyState(), { aligned: ['a-am'], defaults: false }, new Set()).steps.map((s) => s.key)).toEqual(['es-419/aligned:a-am'])
  })
  test('defaults: false brings only what is named; unknown is reported', () => {
    const p = planInstall(cs, emptyState(), { units: ['art:tw:kt', 'nope'], defaults: false }, new Set())
    expect(p.steps.map((s) => s.key)).toEqual(['es-419/art:tw:kt'])
    expect(p.unknown).toEqual(['nope'])
  })
  test('a need no catalog has is unknown, qualified', () => {
    const bad = cat('xx', 1, [[9, 1]], [{ id: 'book:gen', segments: [0], needs: ['orig:gen'] }])
    const p = planInstall([bad], emptyState(), { books: ['gen'], defaults: false }, new Set())
    expect(p.unknown).toEqual(['xx/orig:gen'])
  })
})

describe('activate', () => {
  test('orig:rut missing keeps book:rut waiting and names the segment; map activates', () => {
    const have = new Set([hexOf(11), hexOf(12), hexOf(14)])
    const r = activate(emptyState(), [common(), es()], have)
    expect(r.activated.sort()).toEqual(['es-419/art:tw:kt', 'es-419/map'])
    expect(r.waiting.find((w) => w.key === 'es-419/book:rut')!.missing).toEqual(['common/orig:rut'])
    expect(r.waiting.find((w) => w.key === 'common/orig:rut')!.missing).toEqual([hexOf(2)])
    expect(r.state.units['es-419/book:rut']).toBeUndefined()
    expect(r.state.active['es-419']!.revision).toBe(5)
    expect(r.state.published['common']!.revision).toBe(1)
  })
  test('with everything present the book activates with qualified needs', () => {
    const have = new Set([1, 2, 3, 11, 12, 13, 14, 15].map(hexOf))
    const r = activate(emptyState(), [common(), es()], have)
    expect(r.state.units['es-419/book:rut']!.needs).toEqual(['common/orig:rut', 'es-419/map', 'es-419/art:tw:kt'])
    expect(r.waiting).toEqual([])
    expect(r.state.units['es-419/aligned:a-am']!.optional).toBe(true)
  })
  test('an older book stays until the new one is complete', () => {
    const all = [1, 2, 3, 11, 12, 13, 14, 15].map(hexOf)
    const s1 = activate(emptyState(), [common(), es()], new Set(all)).state
    const r = activate(s1, [common(), es(24, 6)], new Set(all))
    expect(r.state.units['es-419/book:rut']!.revision).toBe(5)
    expect(r.state.units['es-419/book:rut']!.segments).toEqual([hexOf(14)])
    expect(r.waiting).toEqual([{ key: 'es-419/book:rut', missing: [hexOf(24)] }])
    // other units took the new revision at once
    expect(r.state.units['es-419/book:tit']!.revision).toBe(6)
    const done = activate(r.state, [common(), es(24, 6)], new Set([...all, hexOf(24)]))
    expect(done.state.units['es-419/book:rut']!.segments).toEqual([hexOf(24)])
    expect(done.activated).toEqual(['es-419/book:rut'])
  })
  test('two languages with book:tit keep separate keys', () => {
    const pt = cat('pt-BR', 2, [[31, 5]], [{ id: 'book:tit', segments: [0] }])
    const have = new Set([1, 2, 3, 11, 12, 13, 14, 15, 31].map(hexOf))
    const r = activate(emptyState(), [common(), es(), pt], have)
    expect(r.state.units['es-419/book:tit']).toBeDefined()
    expect(r.state.units['pt-BR/book:tit']!.catalog).toBe('pt-BR')
  })
})

describe('updates', () => {
  test('a changed book reports the new segments size', () => {
    const all = [1, 2, 3, 11, 12, 13, 14, 15].map(hexOf)
    const s1 = activate(emptyState(), [common(), es()], new Set(all)).state
    expect(updates(s1, [common(), es()])).toEqual([])
    expect(updates(s1, [common(), es(24, 6)])).toEqual([{ key: 'es-419/book:rut', from: 5, to: 6, bytes: 400 }])
  })

  // A device with Titus bridged from an old pack: the bridge made the published segment ids, but its book needs its own orig.
  const bridged = (o: { flag?: boolean } = {}) => {
    const local = (key: string, segs: number[], needs: string[] = []) => ({
      catalog: 'es-419',
      revision: 1,
      catalogId: 'l'.repeat(64),
      segments: segs.map(hexOf),
      needs,
      ...(o.flag !== false ? { local: true as const } : {}),
    })
    return {
      ...emptyState(),
      units: {
        'es-419/map': local('es-419/map', [11]),
        'es-419/orig:tit': local('es-419/orig:tit', [3]),
        'es-419/book:tit': local('es-419/book:tit', [13], ['es-419/orig:tit']),
        // A book the published catalog lacks: it stays bridged, so it is no update.
        'es-419/book:jon': local('es-419/book:jon', [40], ['es-419/orig:jon']),
        'es-419/orig:jon': local('es-419/orig:jon', [41]),
      },
    }
  }
  test('a bridged book the published catalog lists is an update even with the same segments, with the orig it needs', () => {
    const u = updates(bridged(), [common(), es()])
    expect(u).toEqual([
      { key: 'es-419/map', from: 1, to: 5, bytes: 0 },
      { key: 'es-419/book:tit', from: 1, to: 5, bytes: 0 },
      // The bridged orig had the published bytes: nothing to fetch, but the install must name it.
      { key: 'common/orig:tit', from: 1, to: 1, bytes: 0 },
    ])
    // A state saved before units carried `local`: the local catalog's id tells them.
    expect(updates(bridged({ flag: false }), [common(), es()], new Set(['l'.repeat(64)]))).toEqual(u)
    expect(updates(bridged({ flag: false }), [common(), es()])).toEqual([])
  })
  test('a published book that needs a unit the device lacks lists it once, sized whole', () => {
    const s = bridged()
    const rut = { ...s.units['es-419/book:tit']!, segments: [hexOf(14)], needs: ['es-419/orig:rut'] }
    const u = updates({ ...s, units: { ...s.units, 'es-419/book:rut': rut } }, [common(), es()])
    expect(u.filter((x) => x.key === 'es-419/art:tw:kt')).toEqual([{ key: 'es-419/art:tw:kt', from: 0, to: 5, bytes: 200 }])
    expect(u.filter((x) => x.key === 'common/orig:rut')).toEqual([{ key: 'common/orig:rut', from: 0, to: 1, bytes: 20 }])
  })
})
