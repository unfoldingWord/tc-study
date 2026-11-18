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
  type CatalogResource,
  FormatError,
  KNOWN,
  mapView,
  type MapSet,
  type ObsModel,
  obsView,
  obsimgView,
  type OrigModel,
  type Role,
  origView,
  readSegment,
  type Segment,
  topicsView,
  xmapView,
  xtopicsView,
  type XtopicsPart,
} from '@bt-synergy/language-pack-v3'
import { type ArticleData, articleQuery, type ContextData, contextQuery } from './query/article'
import type { Answer } from './query/envelope'
import { type AcademyData, academyQuery } from './query/academy'
import { type LookupData, lookupQuery } from './query/lookup'
import { type BooksData, booksQuery, conceptQuery, topicsQuery } from './query/maps'
import { type PassageData, passageQuery } from './query/passage'
import { type StoryData, type StoryRef, storiesQuery, storyQuery } from './query/stories'
import { type SectionsData, sectionsQuery } from './query/sections'
import { type FramesAtData, framesAtQuery, type FrameVersesData, frameVersesQuery } from './query/obsFrames'
import { obsPartOf, obsSessionOf, type TfPartData, type TfSessionData } from './query/obsTf'
import { searchQuery } from './query/search'
import { type FamilyData, familyQuery, type PersonEntry, peopleQuery } from './query/family'
import { memoryIndex } from './search/memory'
import type { Hit, SearchFilters, SearchIndex } from './search/types'
import { type RenderingsData, renderingsQuery } from './query/renderings'
import type { InstalledState } from './state'
import { hex } from './state'
import type { VerifiedCatalog } from './verify'

export type ReaderProblem = { id: string; code: string }

export type MapUnit = 'xmap' | 'map' | 'xtopics' | 'topics' | 'aligned'

/** How many segment reads (`get` and decoding) one reader runs at once. */
const READS_AT_ONCE = 8

/**
 * Runs at most `n` works at once; the others wait their turn in the order they asked. A work that ends hands its place straight to
 * the next waiter (the count does not drop in between), so a work that asks at that moment cannot slip in and make it `n + 1`.
 * Internal to the reader (not exported by the package).
 */
export function limiter(n: number): <T>(work: () => Promise<T>) => Promise<T> {
  let running = 0
  const queue: (() => void)[] = []
  return async (work) => {
    if (running >= n) await new Promise<void>((resolve) => queue.push(resolve))
    else running++
    try {
      return await work()
    } finally {
      const next = queue.shift()
      if (next !== undefined) next()
      else running--
    }
  }
}

/**
 * A snapshot of one `open()`: what it found missing or bad stays so (reopen after an install). A read that fails (the store or the
 * network rejects) is not remembered and is tried again by the next call. In `openFromSegments`, `installed()` is optimistic: every
 * unit the catalogs list counts as installed until a read finds its bytes missing or bad.
 *
 * `mapsOf` was added after the first release of this interface: a hand-made `PackReader` (a test double, a wrapper) can spread a
 * real reader (`{ ...reader, orig: … }`, as `query/final.test.ts` does) to get it.
 */
export interface PackReader {
  lang: string
  /** Segments that were stored but do not read as the segment their id says. */
  problems: ReaderProblem[]
  revisions(): { lang?: number; common?: number }
  /** Whether the unit is active and none of its segments is known to be missing or bad. */
  installed(unit: string): boolean
  book(book: string): Promise<BookModel | undefined>
  orig(book: string): Promise<OrigModel | undefined>
  /** The Open Bible Stories of the language, or `undefined` when the `obs` unit is not installed. */
  obs(): Promise<ObsModel | undefined>
  articles(group: string): Promise<ArticleModel[] | undefined>
  /** Every map unit: `xmap`, `map`, `xtopics`, `topics` and the `aligned` parts, read in parallel. */
  maps(): Promise<MapSet>
  /**
   * Only the map units named, as `maps()` gives them (a unit that is missing or bad is left out the same way): a query reads what it
   * needs (`passage` the `map`, `context` the `map` and `xmap`). Each unit is read once per reader, whichever call asks first.
   * `coreOnly`: for a query that reads only the cores (the usage of an article): each of `xmap`, `map`, `xtopics`, `topics` comes
   * with its core and no parts (the whole unit when it was read already), and only the core segment is read.
   * With valid segments the answers do not depend on which query came first. With a corrupt map part they can, within one reader:
   * a `coreOnly` read does not see the part, so it answers from the core, while a reader that read the whole unit first has no unit.
   */
  mapsOf(units: readonly MapUnit[], o?: { coreOnly?: boolean }): Promise<MapSet>
  /** The bytes of the unit's segments as the catalog lists them (0 for a unit no catalog lists). */
  size(unit: string): number
  unitOf(cls: 'book' | 'art' | 'orig', key: string): string | undefined
  /** Whether the catalogs list the unit, installed or not. */
  listed(unit: string): boolean
  /** The resource entries of the language catalog (`source`, `review`, `license`, `rights`, `attribution`, `release`). Added with patch catalogs: a hand-made reader may lack it. */
  resources?(): CatalogResource[]
  /** The checked segments of an installed unit, or `undefined` when it is not installed. For the queries of later tasks. */
  segments(unit: string): Promise<Segment[] | undefined>
  /** The revision of the catalog the unit was installed from (the catalog's own in `openFromSegments`), or `undefined` when it is not active. */
  unitRevision(unit: string): number | undefined
  passage(ref: string): Promise<Answer<PassageData>>
  article(id: string, section?: string | 'all' | { roles: Role[] }): Promise<Answer<ArticleData>>
  context(ref: string): Promise<Answer<ContextData>>
  concept(id: string): Promise<Answer<unknown>>
  topics(q?: { category?: string; book?: string }): Promise<Answer<unknown>>
  books(q: { article: string } | { concept: string }): Promise<Answer<BooksData>>
  /** The ids whose names contain a word ("gracia", "grace", "metaphor", "Pablo"), from the maps alone: exact names first. */
  lookup(name: string, limit?: number): Promise<Answer<LookupData>>
  renderings(q: { strong: string } | { book: string; word: number }): Promise<Answer<RenderingsData>>
  /** Full-text search over the installed books: the client's index when it has one, else an index in memory filled with the books this reader opens. */
  search(text: string, filters?: SearchFilters): Promise<Answer<Hit[]>>
  /** The tA articles the notes of a book cite, most cited first (`data: null` when the `map` is not installed). */
  academy(book: string): Promise<Answer<AcademyData | null>>
  /** The stories whose ranges meet a passage ("gen 1" or any form `passage` takes), or all the stories without one. Needs the `xtopics`. */
  stories(ref?: string): Promise<Answer<{ ref?: string; stories: StoryRef[] }>>
  /** One story (1 to 50): title and ranges from the maps; frames and helps when the `obs` unit is installed. */
  story(n: number): Promise<Answer<StoryData>>
  /** The sections of a book in the English ULT, from the `chunks` of the `xtopics` core, in order (`data: null` when `xtopics` is not installed; `sections: []` and coverage `none` when it has no entry for the book). */
  sections(book: string): Promise<Answer<SectionsData | null>>
  /**
   * The verses an Open Bible Stories frame tells, from the `obs-frames` table of the `xtopics` core (`data: null` when `xtopics` is not
   * installed; `ranges: []` and coverage `none` when the core has no such table, an older common catalog; `ranges: []` and `count` for a frame
   * that tells no verse).
   */
  frameVerses(story: number, frame: number): Promise<Answer<FrameVersesData | null>>
  /**
   * The family of a person (`per:` id): parents, children, partners and siblings with their names in the language, gender and the
   * verses that show each relation (derived, `ids.md`). `data: null` when `xtopics` is not installed or the id is not a person of it.
   */
  family(id: string): Promise<Answer<FamilyData | null>>
  /** Every person with the names a client may find it by (`ids.md`, "Names of people"); `data: null` without `xtopics`. */
  people(): Promise<Answer<PersonEntry[] | null>>
  /**
   * Only the `xtopics` parts of the books named (a part missing or bad is left out), without decoding the others; `undefined` when the
   * unit is not active. Added with `family`: a hand-made reader may lack it, and `family` then reads the whole unit.
   */
  xtopicsParts?(books: readonly string[]): Promise<Map<string, XtopicsPart> | undefined>
  /** The frames that tell any verse of `first`..`last` (verse ids of one book), most specific first (fewest verses, then story order). */
  framesAt(first: number, last?: number): Promise<Answer<FramesAtData | null>>
  /**
   * One picture of an Open Bible Stories frame, from the `obsimg` unit of the catalog `zxx-obsimg` (open that catalog). Reads only the one
   * segment of the story. `null` when the unit is not installed, or the story or the frame is not there. `media` is passed through as written.
   */
  obsImage(story: number, frame: number): Promise<{ bytes: Uint8Array; media: string; w: number; h: number } | null>
  /** The credit the pictures carry (license, credit, changes, source), from the first segment of the unit; `null` when `obsimg` is not installed. */
  obsImageCredit(): Promise<{ license: string; credit: string; changes: string; source: string } | null>
  /**
   * The Five Movements session of story `n` (1 to 50) from the `tf-*` tables of the `obs` unit: the parts in order with their lists, the
   * story's frames, and the release of the manual its ids belong to. `null` when the `obs` unit has no such tables or the story is outside
   * the language's coverage (`coverage` of the session lists the stories that have one).
   */
  obsSession(n: number): Promise<TfSessionData | null>
  /** One part of that session by its fixed code (`intro`, `frames`, `community`, `m1`, `m2`, `drafting`, `m3`, `checking`, `m4`, `m5`, `conclusion`); `null` when absent. */
  obsPart(n: number, code: string): Promise<TfPartData | null>
}

export type ReaderInput = {
  lang: string
  catalogs: VerifiedCatalog[]
  get: (id: string) => Promise<Uint8Array | undefined>
  /** Units that are active, as `<catalog>/<unit>` -> segment ids. Absent: every unit the catalogs list counts as installed until its bytes are missing. */
  active?: Record<string, string[]>
  revisions?: { lang?: number; common?: number }
  /** The revision each active unit was installed from, as `<catalog>/<unit>` -> revision. Absent: the revision of the catalog that lists it. */
  unitRevisions?: Record<string, number>
  /** The index `search` uses. Absent: a `memoryIndex` filled on the first search. */
  index?: SearchIndex
}

export function makeReader(o: ReaderInput): PackReader {
  const listedUnits = new Set<string>()
  const sizes = new Map<string, number>()
  const activeIds = new Map<string, string[]>()
  const unitRevs = new Map<string, number>()
  for (const cat of o.catalogs) {
    for (const u of cat.catalog.units) {
      // The first catalog that lists an id answers for it, unless the state has not installed it under that catalog and has under
      // this one (a bridged `es-419/orig:tit` next to a common catalog whose `orig:tit` is not installed): the installed unit wins.
      if (listedUnits.has(u.id) && (o.active === undefined || activeIds.has(u.id) || o.active[`${cat.name}/${u.id}`] === undefined)) continue
      listedUnits.add(u.id)
      sizes.set(u.id, u.segments.reduce((n, i) => n + (cat.catalog.segments[i]?.size ?? 0), 0))
      const key = `${cat.name}/${u.id}`
      if (o.active === undefined) activeIds.set(u.id, u.segments.map((i) => hex(cat.catalog.segments[i]!.id)))
      else {
        const mine = o.active[key]
        if (mine !== undefined) activeIds.set(u.id, mine)
      }
      unitRevs.set(u.id, o.unitRevisions?.[key] ?? cat.revision)
    }
  }
  const langCat = o.catalogs.find((c) => c.catalog.lang !== undefined) ?? o.catalogs[0]
  const commonCat = o.catalogs.find((c) => c !== langCat)

  const problems: ReaderProblem[] = []
  const missing = new Set<string>()
  const segCache = new Map<string, Promise<Segment | undefined>>()
  const viewCache = new Map<string, unknown>()

  const slot = limiter(READS_AT_ONCE)

  function readOne(id: string, cls: string): Promise<Segment | undefined> {
    const key = `${cls}:${id}`
    let p = segCache.get(key)
    if (p === undefined) {
      p = slot(async () => {
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
      })
      segCache.set(key, p)
      // A rejected read (the store or the network failed) is not remembered: the next call tries again.
      p.catch(() => {
        if (segCache.get(key) === p) segCache.delete(key)
      })
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
      // The segments of a unit are read together (bounded by `slot`); the unit is there only when every one is.
      p = Promise.all(ids.map((id) => readOne(id, cls))).then((segs) => (segs.some((s) => s === undefined) ? undefined : (segs as Segment[])))
      unitSegments.set(unit, p)
      const mine = p
      p.catch(() => {
        if (unitSegments.get(unit) === mine) unitSegments.delete(unit)
      })
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
    const v = seg === undefined ? undefined : viewOf(unit, 0, seg, view)
    // A book or an original is cached as its view only: the segment's bytes are not held twice. A later `segments(unit)` reads again.
    if (v !== undefined && (unit.startsWith('book:') || unit.startsWith('orig:'))) {
      unitSegments.delete(unit)
      segCache.delete(`${unit.split(':')[0]}:${activeIds.get(unit)![0]}`)
    }
    return v
  }

  // The story of each `obsimg` segment (its `group`, "01" to "50"), from the catalog entries of the unit, so one story reads one segment.
  let obsimgIndex: Map<number, number> | undefined
  function obsimgAt(story: number): number | undefined {
    if (obsimgIndex === undefined) {
      obsimgIndex = new Map()
      const ids = activeIds.get('obsimg')
      const unit = o.catalogs.flatMap((c) => c.catalog.units.filter((u) => u.id === 'obsimg').map((u) => ({ c, u }))).find(({ c, u }) => u.segments.some((i) => ids?.includes(hex(c.catalog.segments[i]!.id))))
      if (ids !== undefined && unit !== undefined) {
        for (const i of unit.u.segments) {
          const e = unit.c.catalog.segments[i]!
          const at = ids.indexOf(hex(e.id))
          if (at >= 0 && e.group !== undefined && /^\d+$/.test(e.group)) obsimgIndex.set(Number(e.group), at)
        }
      }
    }
    return obsimgIndex.get(story)
  }
  async function obsimgStory(story: number): Promise<ReturnType<typeof obsimgView> | undefined> {
    const index = Number.isInteger(story) ? obsimgAt(story) : undefined
    if (index === undefined) return undefined
    const seg = await readOne(activeIds.get('obsimg')![index]!, 'obsimg')
    return seg === undefined ? undefined : viewOf('obsimg', index, seg, obsimgView)
  }
  async function obsImage(story: number, frame: number): Promise<{ bytes: Uint8Array; media: string; w: number; h: number } | null> {
    const f = (await obsimgStory(story))?.frames.find((x) => x.n === frame)
    return f === undefined ? null : { bytes: f.data, media: f.media, w: f.w, h: f.h }
  }
  async function obsImageCredit(): Promise<{ license: string; credit: string; changes: string; source: string } | null> {
    obsimgAt(0)
    const first = obsimgIndex === undefined ? undefined : Math.min(...obsimgIndex.keys())
    return first === undefined || !Number.isFinite(first) ? null : ((await obsimgStory(first))?.meta ?? null)
  }

  const VIEWS = { xmap: xmapView, map: mapView, xtopics: xtopicsView, topics: topicsView } as const
  type Part = { part: string }
  /** One map unit: its core and parts, or `undefined` when a segment is missing or bad, or no segment is the core. */
  async function readMap(unit: keyof typeof VIEWS): Promise<{ core: Part; parts: Map<string, Part> } | undefined> {
    const segs = await segments(unit)
    if (segs === undefined) return undefined
    let core: Part | undefined
    const parts = new Map<string, Part>()
    for (const [i, seg] of segs.entries()) {
      const v = viewOf(unit, i, seg, VIEWS[unit] as (s: Segment) => Part)
      if (v === undefined) return undefined
      if (v.part === 'core') core = v
      else parts.set(v.part, v)
    }
    return core === undefined ? undefined : { core, parts }
  }
  async function readAligned(): Promise<MapSet['aligned']> {
    const groups = [...listedUnits].filter((u) => u.startsWith('aligned:')).map((u) => u.slice('aligned:'.length))
    if (groups.length === 0) return undefined
    const models = await Promise.all(groups.map((g) => single(`aligned:${g}`, (s) => alignedView(s, groups))))
    const parts = new Map<string, AlignedModel>()
    groups.forEach((g, i) => {
      if (models[i] !== undefined) parts.set(g, models[i]!)
    })
    return { lang: o.lang, groups, parts }
  }
  // The part of each segment, from the catalogs: which segment of a map unit is its core.
  const partOf = new Map<string, string>()
  for (const cat of o.catalogs) for (const e of cat.catalog.segments) if (e.part !== undefined) partOf.set(hex(e.id), e.part)
  /** The core of one map unit alone (`parts` empty), or `undefined` as `readMap` would say for a missing or bad core. */
  async function readCore(unit: keyof typeof VIEWS): Promise<{ core: Part; parts: Map<string, Part> } | undefined> {
    const ids = activeIds.get(unit)
    const at = ids?.findIndex((id) => partOf.get(id) === 'core') ?? -1
    // A catalog that does not say which segment is the core: the whole unit, as `maps()` reads it.
    if (ids === undefined || at < 0) return (await mapUnit(unit)) as { core: Part; parts: Map<string, Part> } | undefined
    const seg = await readOne(ids[at]!, unit)
    const v = seg === undefined ? undefined : viewOf(unit, at, seg, VIEWS[unit] as (s: Segment) => Part)
    return v === undefined || v.part !== 'core' ? undefined : { core: v, parts: new Map() }
  }
  /**
   * Only the parts of the books named of one map unit (by `part`, from the catalogs), each read once and cached like any segment: a query
   * that needs a few books does not decode the 66. A part that is missing or bad is left out. When the unit was read whole already, or a
   * catalog does not say which segment is which part, the parts come from the whole unit.
   */
  async function mapParts(unit: keyof typeof VIEWS, books: readonly string[]): Promise<Map<string, Part> | undefined> {
    const ids = activeIds.get(unit)
    if (ids === undefined) return undefined
    const wanted = new Set(books)
    const pick = (parts: Map<string, Part>): Map<string, Part> => new Map([...parts].filter(([book]) => wanted.has(book)))
    if (mapUnits.has(unit) || ids.some((id) => partOf.get(id) === undefined)) {
      const whole = (await mapUnit(unit)) as { parts: Map<string, Part> } | undefined
      return whole === undefined ? undefined : pick(whole.parts)
    }
    const out = new Map<string, Part>()
    await Promise.all(
      ids.map(async (id, i) => {
        const part = partOf.get(id)!
        if (!wanted.has(part)) return
        const seg = await readOne(id, unit)
        const v = seg === undefined ? undefined : viewOf(unit, i, seg, VIEWS[unit] as (s: Segment) => Part)
        if (v !== undefined && v.part === part) out.set(part, v)
      }),
    )
    return out
  }
  const cores = new Map<string, Promise<unknown>>()
  function mapCore(unit: MapUnit): Promise<unknown> {
    if (unit === 'aligned' || mapUnits.has(unit)) return mapUnit(unit)
    let p = cores.get(unit)
    if (p === undefined) {
      p = readCore(unit)
      cores.set(unit, p)
      const mine = p
      p.catch(() => {
        if (cores.get(unit) === mine) cores.delete(unit)
      })
    }
    return p
  }
  // Each map unit is read once per reader (a read that rejects is tried again by the next call).
  const mapUnits = new Map<MapUnit, Promise<unknown>>()
  function mapUnit(unit: MapUnit): Promise<unknown> {
    let p = mapUnits.get(unit)
    if (p === undefined) {
      p = unit === 'aligned' ? readAligned() : readMap(unit)
      mapUnits.set(unit, p)
      const mine = p
      p.catch(() => {
        if (mapUnits.get(unit) === mine) mapUnits.delete(unit)
      })
    }
    return p
  }
  async function mapsOf(units: readonly MapUnit[], how: { coreOnly?: boolean } = {}): Promise<MapSet> {
    // The revision of the map that answers: the active `map` unit's, else the language's.
    const set: MapSet = { revision: (activeIds.has('map') ? unitRevs.get('map') : undefined) ?? o.revisions?.lang ?? langCat?.revision ?? 0 }
    const got = await Promise.all(units.map((u) => (how.coreOnly === true ? mapCore(u) : mapUnit(u))))
    units.forEach((u, i) => {
      if (got[i] !== undefined) (set as Record<string, unknown>)[u] = got[i]
    })
    return set
  }
  const ALL_MAPS: readonly MapUnit[] = ['xmap', 'map', 'xtopics', 'topics', 'aligned']

  let memory: Promise<SearchIndex> | undefined
  /** The books that are active, read once into a `memoryIndex` (keyed by segment id, so a rebuilt book replaces itself). */
  async function fillMemory(): Promise<SearchIndex> {
    const index = memoryIndex()
    for (const unit of activeIds.keys()) {
      if (!unit.startsWith('book:') || !reader.installed(unit)) continue
      const model = await reader.book(unit.slice('book:'.length))
      const id = activeIds.get(unit)![0]
      if (model !== undefined && id !== undefined) await index.addBook(o.lang, model, id)
    }
    if (reader.installed('obs')) {
      const model = await reader.obs()
      const id = activeIds.get('obs')?.[0]
      if (model !== undefined && id !== undefined) await index.addObs(o.lang, model, id)
    }
    return index
  }
  const lang = o.revisions?.lang ?? langCat?.revision
  const common = o.revisions?.common ?? commonCat?.revision
  const reader: PackReader = {
    lang: o.lang,
    problems,
    revisions: () => ({ ...(lang !== undefined ? { lang } : {}), ...(common !== undefined ? { common } : {}) }),
    installed(unit) {
      const ids = activeIds.get(unit)
      return ids !== undefined && !ids.some((id) => missing.has(id))
    },
    listed: (unit) => listedUnits.has(unit),
    resources: () => langCat?.catalog.resources ?? [],
    book: (book) => single(`book:${book}`, bookView),
    orig: (book) => single(`orig:${book}`, origView),
    obs: () => single('obs', obsView),
    obsImage,
    obsImageCredit,
    obsSession: async (n) => obsSessionOf(await reader.obs(), n),
    obsPart: async (n, code) => obsPartOf(await reader.obs(), n, code),
    async articles(group) {
      return (await single(`art:${group}`, artView))?.articles
    },
    maps: () => mapsOf(ALL_MAPS),
    mapsOf,
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
    unitRevision: (unit) => (activeIds.has(unit) ? unitRevs.get(unit) : undefined),
    passage: (ref) => passageQuery(reader, ref),
    article: (id, section) => articleQuery(reader, id, section),
    context: (ref) => contextQuery(reader, ref),
    concept: (id) => conceptQuery(reader, id),
    topics: (q) => topicsQuery(reader, q),
    books: (q) => booksQuery(reader, q),
    lookup: (name, limit) => lookupQuery(reader, name, limit),
    renderings: (q) => renderingsQuery(reader, q),
    async search(text, filters) {
      let index = o.index
      if (index === undefined) {
        const run = (memory ??= fillMemory())
        run.catch(() => {
          if (memory === run) memory = undefined
        })
        index = await run
      }
      return searchQuery(reader, index, [...listedUnits].filter((u) => u.startsWith('book:') || u === 'obs'), text, filters)
    },
    academy: (book) => academyQuery(reader, book),
    stories: (ref) => storiesQuery(reader, ref),
    story: (n) => storyQuery(reader, n),
    sections: (book) => sectionsQuery(reader, book),
    frameVerses: (story, frame) => frameVersesQuery(reader, story, frame),
    framesAt: (first, last) => framesAtQuery(reader, first, last),
    xtopicsParts: (books) => mapParts('xtopics', books) as Promise<Map<string, XtopicsPart> | undefined>,
    family: (id) => familyQuery(reader, id),
    people: () => peopleQuery(reader),
  }
  return reader
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
  index?: SearchIndex
}): PackReader {
  const active: Record<string, string[]> = {}
  const unitRevisions: Record<string, number> = {}
  for (const [k, u] of Object.entries(o.state.units)) {
    active[k] = u.segments
    unitRevisions[k] = u.revision
  }
  const common = o.catalogs.find((c) => c.catalog.lang === undefined)
  const lang = o.state.active[o.name]?.revision
  const comm = common === undefined ? undefined : o.state.active[common.name]?.revision
  return makeReader({
    lang: o.lang,
    catalogs: o.catalogs,
    get: o.get,
    active,
    unitRevisions,
    ...(o.index !== undefined ? { index: o.index } : {}),
    revisions: { ...(lang !== undefined ? { lang } : {}), ...(comm !== undefined ? { common: comm } : {}) },
  })
}
