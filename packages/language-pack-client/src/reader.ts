/**
 * The reader over installed segments. It reads a unit's segments through `get`, checks each one again with
 * `readSegment(bytes, { known, expectedId })`, and keeps the views per segment id. A segment whose bytes fail is treated as not
 * installed and recorded in `problems`: no `FormatError` reaches the caller (Review Focus 2). No Node module here: the reader runs
 * in a browser, a Worker and Bun.
 */
import {
  type AlignedModel,
  alignedView,
  type ArticleModel,
  artView,
  type BookModel,
  bookView,
  FormatError,
  KNOWN,
  mapView,
  type MapSet,
  type OrigModel,
  origView,
  readSegment,
  type Segment,
  topicsView,
  xmapView,
  xtopicsView,
} from '@bt-synergy/language-pack-v3'
import type { InstalledState } from './state'
import { hex } from './state'
import type { VerifiedCatalog } from './verify'

export type ReaderProblem = { id: string; code: string }

export interface PackReader {
  lang: string
  /** Segments that were stored but do not read as the segment their id says. */
  problems: ReaderProblem[]
  revisions(): { lang?: number; common?: number }
  /** Whether the unit is active and none of its segments is known to be missing or bad. */
  installed(unit: string): boolean
  book(book: string): Promise<BookModel | undefined>
  orig(book: string): Promise<OrigModel | undefined>
  articles(group: string): Promise<ArticleModel[] | undefined>
  maps(): Promise<MapSet>
  /** The bytes of the unit's segments as the catalog lists them (0 for a unit no catalog lists). */
  size(unit: string): number
  unitOf(cls: 'book' | 'art' | 'orig', key: string): string | undefined
  /** Whether the catalogs list the unit, installed or not. */
  listed(unit: string): boolean
  /** The checked segments of an installed unit, or `undefined` when it is not installed. For the queries of later tasks. */
  segments(unit: string): Promise<Segment[] | undefined>
}

export type ReaderInput = {
  lang: string
  catalogs: VerifiedCatalog[]
  get: (id: string) => Promise<Uint8Array | undefined>
  /** Units that are active, as `<catalog>/<unit>` -> segment ids. Absent: every unit the catalogs list counts as installed until its bytes are missing. */
  active?: Record<string, string[]>
  revisions?: { lang?: number; common?: number }
}

export function makeReader(o: ReaderInput): PackReader {
  const listedUnits = new Set<string>()
  const sizes = new Map<string, number>()
  const activeIds = new Map<string, string[]>()
  for (const cat of o.catalogs) {
    for (const u of cat.catalog.units) {
      if (listedUnits.has(u.id)) continue
      listedUnits.add(u.id)
      sizes.set(u.id, u.segments.reduce((n, i) => n + (cat.catalog.segments[i]?.size ?? 0), 0))
      if (o.active === undefined) activeIds.set(u.id, u.segments.map((i) => hex(cat.catalog.segments[i]!.id)))
      else {
        const mine = o.active[`${cat.name}/${u.id}`]
        if (mine !== undefined) activeIds.set(u.id, mine)
      }
    }
  }
  const langCat = o.catalogs.find((c) => c.catalog.lang !== undefined) ?? o.catalogs[0]
  const commonCat = o.catalogs.find((c) => c !== langCat)

  const problems: ReaderProblem[] = []
  const missing = new Set<string>()
  const segCache = new Map<string, Promise<Segment | undefined>>()
  const viewCache = new Map<string, unknown>()

  function readOne(id: string, cls: string): Promise<Segment | undefined> {
    const key = `${cls}:${id}`
    let p = segCache.get(key)
    if (p === undefined) {
      p = (async () => {
        const known = (KNOWN as Record<string, Record<string, number[]> | undefined>)[cls]
        const bytes = await o.get(id)
        if (bytes === undefined) {
          missing.add(id)
          return undefined
        }
        try {
          if (known === undefined) throw new FormatError('E_BODY', `unknown class "${cls}"`)
          const { seg } = await readSegment(bytes, { known, expectedId: id })
          if (seg.h.class !== cls) throw new FormatError('E_BODY', `the class is "${seg.h.class}", not "${cls}"`)
          return seg
        } catch (e) {
          if (!(e instanceof FormatError)) throw e
          missing.add(id)
          if (!problems.some((x) => x.id === id)) problems.push({ id, code: e.code })
          return undefined
        }
      })()
      segCache.set(key, p)
    }
    return p
  }

  const unitSegments = new Map<string, Promise<Segment[] | undefined>>()
  function segments(unit: string): Promise<Segment[] | undefined> {
    const ids = activeIds.get(unit)
    if (ids === undefined) return Promise.resolve(undefined)
    let p = unitSegments.get(unit)
    if (p === undefined) {
      const cls = unit.split(':')[0]!
      p = (async () => {
        const out: Segment[] = []
        for (const id of ids) {
          const seg = await readOne(id, cls)
          if (seg === undefined) return undefined
          out.push(seg)
        }
        return out
      })()
      unitSegments.set(unit, p)
    }
    return p
  }

  /** Runs a view over a segment; a view that fails is a problem like bad bytes. Cached by segment id. */
  function viewOf<T>(unit: string, index: number, seg: Segment, view: (s: Segment) => T): T | undefined {
    const id = activeIds.get(unit)![index]!
    const key = `${unit}:${id}`
    if (!viewCache.has(key)) {
      try {
        viewCache.set(key, view(seg))
      } catch (e) {
        if (!(e instanceof FormatError)) throw e
        missing.add(id)
        if (!problems.some((x) => x.id === id)) problems.push({ id, code: e.code })
        viewCache.set(key, undefined)
      }
    }
    return viewCache.get(key) as T | undefined
  }

  async function single<T>(unit: string, view: (seg: Segment) => T): Promise<T | undefined> {
    const seg = (await segments(unit))?.[0]
    return seg === undefined ? undefined : viewOf(unit, 0, seg, view)
  }

  async function buildMaps(): Promise<MapSet> {
    const set: MapSet = { revision: o.revisions?.lang ?? langCat?.revision ?? 0 }
    const read = async <V extends { part: string }>(unit: string, view: (s: Segment) => V): Promise<{ core: V; parts: Map<string, V> } | undefined> => {
      const segs = await segments(unit)
      if (segs === undefined) return undefined
      let core: V | undefined
      const parts = new Map<string, V>()
      for (const [i, seg] of segs.entries()) {
        const v = viewOf(unit, i, seg, view)
        if (v === undefined) return undefined
        if (v.part === 'core') core = v
        else parts.set(v.part, v)
      }
      return core === undefined ? undefined : { core, parts }
    }
    const xmap = await read('xmap', xmapView)
    if (xmap) set.xmap = xmap as unknown as NonNullable<MapSet['xmap']>
    const map = await read('map', mapView)
    if (map) set.map = map as unknown as NonNullable<MapSet['map']>
    const xt = await read('xtopics', xtopicsView)
    if (xt) set.xtopics = xt as unknown as NonNullable<MapSet['xtopics']>
    const tp = await read('topics', topicsView)
    if (tp) set.topics = tp as unknown as NonNullable<MapSet['topics']>
    const groups = [...listedUnits].filter((u) => u.startsWith('aligned:')).map((u) => u.slice('aligned:'.length))
    if (groups.length > 0) {
      const parts = new Map<string, AlignedModel>()
      for (const g of groups) {
        const m = await single(`aligned:${g}`, (s) => alignedView(s, groups))
        if (m !== undefined) parts.set(g, m)
      }
      set.aligned = { lang: o.lang, groups, parts }
    }
    return set
  }

  let mapsOnce: Promise<MapSet> | undefined
  const lang = o.revisions?.lang ?? langCat?.revision
  const common = o.revisions?.common ?? commonCat?.revision
  return {
    lang: o.lang,
    problems,
    revisions: () => ({ ...(lang !== undefined ? { lang } : {}), ...(common !== undefined ? { common } : {}) }),
    installed(unit) {
      const ids = activeIds.get(unit)
      return ids !== undefined && !ids.some((id) => missing.has(id))
    },
    listed: (unit) => listedUnits.has(unit),
    book: (book) => single(`book:${book}`, bookView),
    orig: (book) => single(`orig:${book}`, origView),
    async articles(group) {
      return (await single(`art:${group}`, artView))?.articles
    },
    maps() {
      mapsOnce ??= buildMaps()
      return mapsOnce
    },
    size: (unit) => sizes.get(unit) ?? 0,
    unitOf(cls, key) {
      const exact = `${cls}:${key}`
      if (listedUnits.has(exact)) return exact
      if (cls === 'art') {
        // `tw:kt/grace` lives in `art:tw:kt`.
        const slash = key.lastIndexOf('/')
        const unit = `art:${slash < 0 ? key : key.slice(0, slash)}`
        if (listedUnits.has(unit)) return unit
      }
      return undefined
    },
    segments,
  }
}

export function openFromSegments(o: { lang: string; catalogs: VerifiedCatalog[]; get: (id: string) => Promise<Uint8Array | undefined> }): PackReader {
  return makeReader(o)
}

/** The reader of the installed state: units are active as `state.units` says, with the segments they were installed with. */
export function readerOfState(o: {
  lang: string
  catalogs: VerifiedCatalog[]
  state: InstalledState
  get: (id: string) => Promise<Uint8Array | undefined>
  name: string
}): PackReader {
  const active: Record<string, string[]> = {}
  for (const [k, u] of Object.entries(o.state.units)) active[k] = u.segments
  const common = o.catalogs.find((c) => c.catalog.lang === undefined)
  const lang = o.state.active[o.name]?.revision
  const comm = common === undefined ? undefined : o.state.active[common.name]?.revision
  return makeReader({
    lang: o.lang,
    catalogs: o.catalogs,
    get: o.get,
    active,
    revisions: { ...(lang !== undefined ? { lang } : {}), ...(comm !== undefined ? { common: comm } : {}) },
  })
}
