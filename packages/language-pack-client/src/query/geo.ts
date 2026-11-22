/**
 * The maps queries: `distance` and `travelDays` (pure), and `place`, `placesOf`, `route` and `passagePlaces` over the common `xtopics` (`geo`, `routes`,
 * the relations `born-in`, `died-in` and `place`) and the language's `map` and `topics` cores (the names, `ids.md` "Builder rules: places names"). The
 * verse of a route stop is not stored: {@link route} derives it (`ids.md`, "Builder rules: routes"). No Node module here.
 */
import { OPENBIBLE_SOURCE as OPENBIBLE, personName, twOfPlaces, type GeoPoint, type TopicsCore, type XtopicsCore, type XtopicsPart } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'

/** The resources the maps data comes from, as `res` keys of the `xtopics` core. */
export const OPENBIBLE_SOURCE = OPENBIBLE.key
export const THEOGRAPHIC_SOURCE = 'robertrouse/theographic-bible-metadata'

const EARTH_RADIUS_KM = 6371

/** A point in degrees. */
export type LatLon = { lat: number; lon: number }

/** The eight directions of {@link distance}, clockwise from north. */
export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export type Direction = (typeof DIRECTIONS)[number]

/**
 * The great-circle distance between two points (haversine, radius 6371 km), **not rounded** (round only what is shown), and the initial bearing from
 * `a` to `b`, in degrees from north (0 to 360) and as one of eight directions.
 */
export function distance(a: LatLon, b: LatLon): { km: number; bearing: number; direction: Direction } {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
  const y = Math.sin(dLon) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(dLon)
  const bearing = ((Math.atan2(y, x) / rad) % 360 + 360) % 360
  return { km, bearing, direction: DIRECTIONS[Math.round(bearing / 45) % 8] }
}

/**
 * Speeds in km per day, from W. Scheidel, E. Meeks and J. Weiland, "ORBIS: The Stanford Geospatial Network Model of the Roman World", version of 2 May
 * 2012, p. 20 (https://orbis.stanford.edu/). They are averages over several days in the Roman world; using them for the Old Testament is an assumption
 * (an order of magnitude), which is why every phrase says "approx.". No data of ORBIS is taken, only these numbers.
 * - `foot`: 30 km/day for travellers on foot, pack animals with a moderate load, mule carts and camel caravans (named in the same sentence): the same
 *   figure serves "on foot, by donkey or by camel".
 * - `horse`: 56 km/day, the usual ride on horseback.
 * - `ship`: ORBIS gives no constant (it depends on wind and month); 110 to 140 km/day is a reading of its July examples (114 and 138 km/day on the routes
 *   that use the sea most).
 */
export const SPEEDS = { foot: 30, horse: 56, shipLow: 110, shipHigh: 140 } as const

/**
 * The factor that turns a straight line into a road, a low and a high one: 1.15 to 1.4 by land, 1.1 to 1.5 by sea (coasting and waiting for wind).
 * **An assumption of this design**, not a datum of a source.
 */
export const PATH_FACTORS = { land: [1.15, 1.4], sea: [1.1, 1.5] } as const

export type TravelMode = 'foot' | 'horse' | 'ship'

/**
 * Whole days to cover `km` (the unrounded haversine distance) in `mode`: `low = max(1, floor(km x factor / speed))` and `high = ceil(km x factor / speed)`;
 * `{ low: 0, high: 1 }` ("less than a day") when the high figure is below 1. A `low` of 60 or more is shown as "more than two months".
 */
export function travelDays(km: number, mode: TravelMode): { low: number; high: number } {
  const [fl, fh] = mode === 'ship' ? PATH_FACTORS.sea : PATH_FACTORS.land
  const speedLow = mode === 'ship' ? SPEEDS.shipHigh : mode === 'foot' ? SPEEDS.foot : SPEEDS.horse
  const speedHigh = mode === 'ship' ? SPEEDS.shipLow : speedLow
  const low = (km * fl) / speedLow
  const high = (km * fh) / speedHigh
  if (high < 1) return { low: 0, high: 1 }
  return { low: Math.max(1, Math.floor(low)), high: Math.ceil(high) }
}

/** A point of the Mediterranean (`ids.md`): longitude up to 37 east, latitude 30 to 46 north, not the Black Sea (latitude above 41 with longitude above 26). */
export function inMediterranean(p: LatLon): boolean {
  return p.lon <= 37 && p.lat >= 30 && p.lat <= 46 && !(p.lat > 41 && p.lon > 26)
}

/** What the client needs of a place for a trip: its point, its certainty and its form. */
export type GeoPlace = LatLon & { sure: 1 | 2 | 3; form: GeoPoint['form'] }

/**
 * The trip between two places (`diseno-mapas.md` 5.8): the distance and direction, the least sure of the two (`sure`), and the days. `days` is absent when
 * the answer gives none: a place without a point or of form 2 or 3 (nothing to measure), the two closer than 3 km (`near`: "next to"), or the least sure
 * one below 2. `ship` is there only when both are ports (form 5) and both in the Mediterranean.
 */
export type Trip = {
  km: number
  direction: Direction
  bearing: number
  sure: 1 | 2 | 3
  near: boolean
  days?: { foot: { low: number; high: number }; horse: { low: number; high: number }; ship?: { low: number; high: number } }
}

const MEASURABLE = new Set([1, 4, 5])

/**
 * The trip between two places as an answer gives them ({@link PlaceRef}): `undefined` when either has no point (`sure` 0, or no `lat` and `lon`), or a form
 * that has nothing to measure (an area or a water).
 */
export function trip(a: PlaceRef, b: PlaceRef): Trip | undefined {
  if (a.lat === undefined || a.lon === undefined || b.lat === undefined || b.lon === undefined || a.sure === 0 || b.sure === 0) return undefined
  if (!MEASURABLE.has(a.form) || !MEASURABLE.has(b.form)) return undefined
  const pa = { lat: a.lat, lon: a.lon }
  const pb = { lat: b.lat, lon: b.lon }
  const d = distance(pa, pb)
  const sure = Math.min(a.sure, b.sure) as 1 | 2 | 3
  const near = d.km < 3
  const out: Trip = { km: d.km, direction: d.direction, bearing: d.bearing, sure, near }
  if (!near && sure >= 2) {
    out.days = { foot: travelDays(d.km, 'foot'), horse: travelDays(d.km, 'horse') }
    if (a.form === 5 && b.form === 5 && inMediterranean(pa) && inMediterranean(pb)) out.days.ship = travelDays(d.km, 'ship')
  }
  return out
}

/** A place in an answer: its name in the language, its note when it has one, its point (degrees) when it has one, certainty (0 none) and form. */
export type PlaceRef = { id: string; name: string; note?: string; lat?: number; lon?: number; sure: 0 | 1 | 2 | 3; form: GeoPoint['form'] }

export type PlaceData = PlaceRef & {
  /** The `tw:names/` articles joined to the place. */
  tw: string[]
  /** How many verses name the place. */
  verses: number
  /** The people who were born, or died, here (`born-in`, `died-in`, from Theographic); their verses are derived with `kinVerses`. */
  born: { id: string; name: string }[]
  died: { id: string; name: string }[]
  /** The events that took place here (`place`). */
  events: { id: string; title: string }[]
  sources: string[]
}

type Ctx = { core: XtopicsCore; tw: Map<string, string[]>; mapNames: Record<string, string[]>; topics?: TopicsCore }

const byCore = new WeakMap<XtopicsCore, Map<string, string[]>>()

async function cores(reader: PackReader, out: Answer<unknown>): Promise<Ctx | undefined> {
  const x = (await reader.mapsOf(['xtopics'], { coreOnly: true })).xtopics
  if (x === undefined) {
    missingUnit(out, { unit: 'xtopics', bytes: reader.listed('xtopics') ? reader.size('xtopics') : 0 })
    return undefined
  }
  usedUnit(out, reader, 'xtopics')
  const lang = await reader.mapsOf(['map', 'topics'], { coreOnly: true })
  if (lang.map !== undefined) usedUnit(out, reader, 'map')
  if (lang.topics !== undefined) usedUnit(out, reader, 'topics')
  let tw = byCore.get(x.core)
  if (tw === undefined) byCore.set(x.core, (tw = twOfPlaces(x.core)))
  return { core: x.core, tw, mapNames: lang.map?.core.names ?? {}, topics: lang.topics?.core }
}

function ref(ctx: Ctx, id: string): PlaceRef {
  const g = ctx.core.geo?.[id]
  const out: PlaceRef = { id, name: personName(id, ctx.core, ctx.tw, ctx.mapNames, ctx.topics?.places), sure: g?.sure ?? 0, form: g?.form ?? 1 }
  if (g !== undefined && g.sure > 0) {
    out.lat = g.lat / 100
    out.lon = g.lon / 100
  }
  const note = ctx.topics?.places?.notes[id]
  if (note !== undefined) out.note = note
  return out
}

const countOf = (core: XtopicsCore, id: string): number => [...(core.occurrences.get(id)?.values() ?? [])].reduce((n, [, verses]) => n + verses, 0)

async function partsOf(reader: PackReader, books: Set<string>): Promise<Map<string, XtopicsPart>> {
  if (books.size === 0) return new Map()
  const some = reader.xtopicsParts === undefined ? undefined : await reader.xtopicsParts([...books])
  if (some !== undefined) return some
  return (await reader.mapsOf(['xtopics'])).xtopics?.parts ?? new Map()
}

const bookOf = (verse: number): string => BOOK_CODES[Math.floor(verse / 1_000_000) - 1]
// The 66 books in canon order, as `ids.ts` of language-pack-v3 (a verse id is book number x 1,000,000 + chapter x 1,000 + verse)
const BOOK_CODES = 'gen exo lev num deu jos jdg rut 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam ezk dan hos jol amo oba jon mic nam hab zep hag zec mal mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev'.split(' ')

/**
 * One place (`lug:` id): `data: null` when `xtopics` is not installed or the id is not a place of it. A place with no point (`sure` 0, no `lat`) is still
 * answered (the people, the events, the articles); a core without the `geo` table answers `sure` 0 and form 1.
 */
export async function placeQuery(reader: PackReader, id: string): Promise<Answer<PlaceData | null>> {
  if (typeof id !== 'string' || !id.startsWith('lug:')) throw new ClientError('E_ARG', `not a place id: ${JSON.stringify(id)}`)
  const out = newAnswer<PlaceData | null>(reader, 'place')
  const ctx = await cores(reader, out)
  if (ctx === undefined || ctx.core.topics.get(id)?.kind !== 'place') return out
  const born: PlaceData['born'] = []
  const died: PlaceData['died'] = []
  const events: PlaceData['events'] = []
  for (const r of ctx.core.relations ?? []) {
    if (r.to !== id) continue
    if (r.type === 'born-in') born.push({ id: r.from, name: personName(r.from, ctx.core, new Map(), ctx.mapNames, ctx.topics?.people) })
    else if (r.type === 'died-in') died.push({ id: r.from, name: personName(r.from, ctx.core, new Map(), ctx.mapNames, ctx.topics?.people) })
    else if (r.type === 'place') events.push({ id: r.from, title: ctx.core.topics.get(r.from)?.title ?? '' })
  }
  const sources = [] as string[]
  if (ctx.core.geo !== undefined) sources.push(...ctx.core.res.map(([k]) => k).filter((k) => k === OPENBIBLE_SOURCE))
  sources.push(...ctx.core.res.map(([k]) => k).filter((k) => !sources.includes(k) && k === THEOGRAPHIC_SOURCE && (born.length + died.length + events.length > 0)))
  out.data = { ...ref(ctx, id), tw: ctx.tw.get(id) ?? [], verses: countOf(ctx.core, id), born, died, events, sources }
  for (const key of ctx.core.res.map(([k]) => k).filter((k) => k === 'STEPBible/STEPBible-Data/TIPNR' || sources.includes(k))) {
    const release = releaseOf(ctx.core.res, key)
    if (release !== '') out.cites.push({ res: key, release })
  }
  return out
}

/** A place named in a verse or a passage: the place, and the first verse of the passage that names it. */
export type PlaceAt = PlaceRef & { verse: number }

/** The forms a map shows as a named place: points, ports, waters and heights; not the regions (`ids.md`). */
const NAMED_FORMS = new Set([1, 3, 4, 5])

async function placesIn(reader: PackReader, first: number, last: number, name: 'placesOf' | 'passagePlaces'): Promise<Answer<PlaceAt[] | null>> {
  const out = newAnswer<PlaceAt[] | null>(reader, name)
  const ctx = await cores(reader, out)
  if (ctx === undefined) return out
  const books = new Set<string>()
  for (let b = Math.floor(first / 1_000_000); b <= Math.floor(last / 1_000_000); b++) if (b >= 1 && b <= 66) books.add(BOOK_CODES[b - 1])
  const parts = await partsOf(reader, books)
  for (const b of books) if (!parts.has(b)) missingUnit(out, { unit: 'xtopics', book: b, bytes: 0, what: 'part' })
  const found: PlaceAt[] = []
  for (const part of parts.values()) {
    for (const [id, verses] of part.occurrences) {
      if (ctx.core.topics.get(id)?.kind !== 'place') continue
      const v = verses.find((x) => x >= first && x <= last)
      if (v !== undefined) found.push({ ...ref(ctx, id), verse: v })
    }
  }
  found.sort((a, b) => a.verse - b.verse || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  out.data = found
  return out
}

/** The places named in one verse (a verse id), every form, in id order. The part of the verse's book is read, no other. */
export function placesOf(reader: PackReader, verse: number): Promise<Answer<PlaceAt[] | null>> {
  return placesIn(reader, verse, verse, 'placesOf')
}

/**
 * "Places named in this passage, in order": the places of `first`..`last` (verse ids; the passage may cross books) whose form is 1, 5, 3 or 4 (cities and ports,
 * waters, heights; not the regions), by their first verse inside the passage. The title says "places named in", never "route".
 */
export async function passagePlaces(reader: PackReader, first: number, last: number = first): Promise<Answer<PlaceAt[] | null>> {
  if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) throw new ClientError('E_ARG', `not a verse range: ${first}..${last}`)
  const a = await placesIn(reader, first, last, 'passagePlaces')
  if (a.data !== null) a.data = a.data.filter((p) => NAMED_FORMS.has(p.form))
  return a
}

/** A stop of a route: the place and the verse where the event names it after the stop before (`undefined` when the event names it nowhere after that). */
export type RouteStop = { place: PlaceRef; verse?: number }
/** `index` of `count` routes the event has in the table (an event may have alternatives, in the order of the table). */
export type RouteData = { event: { id: string; title: string }; stops: RouteStop[]; index: number; count: number }

/**
 * The route of an event (`ev:` id) from the builder's list, in the order the list has: `data: null` when `xtopics` is not installed, the core has no
 * `routes` table, or the event has no route. The verse of a stop is the first verse of the place inside the event's verses at or after the verse of the stop
 * before; Jerusalem at the end of a journey does not take the verse of the start.
 */
export async function route(reader: PackReader, eventId: string, index = 0): Promise<Answer<RouteData | null>> {
  if (typeof eventId !== 'string' || !eventId.startsWith('ev:')) throw new ClientError('E_ARG', `not an event id: ${JSON.stringify(eventId)}`)
  const out = newAnswer<RouteData | null>(reader, 'route')
  const ctx = await cores(reader, out)
  const all = ctx?.core.routes?.filter((x) => x.event === eventId) ?? []
  const r = all[index]
  if (ctx === undefined || r === undefined) return out
  const books = new Set<string>([...(ctx.core.occurrences.get(eventId)?.keys() ?? [])])
  const parts = await partsOf(reader, books)
  for (const b of books) if (!parts.has(b)) missingUnit(out, { unit: 'xtopics', book: b, bytes: 0, what: 'part' })
  const eventVerses = new Set<number>()
  for (const b of books) for (const v of parts.get(b)?.occurrences.get(eventId) ?? []) eventVerses.add(v)
  const range = [...eventVerses].sort((x, y) => x - y)
  let cursor = range[0] ?? 0
  const stops: RouteStop[] = r.stops.map((id) => {
    const place = ref(ctx, id)
    const verses = [...(ctx.core.occurrences.get(id)?.keys() ?? [])].flatMap((b) => parts.get(b)?.occurrences.get(id) ?? [])
    const inEvent = verses.filter((v) => eventVerses.has(v) && v >= cursor).sort((x, y) => x - y)
    if (inEvent.length === 0) return { place }
    cursor = inEvent[0]
    return { place, verse: cursor }
  })
  out.data = { event: { id: eventId, title: ctx.core.topics.get(eventId)?.title ?? '' }, stops, index, count: all.length }
  return out
}

export { bookOf as bookOfVerse }
