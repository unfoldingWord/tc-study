/**
 * The common topics (`spec/cddl/xtopics.cddl`): the people and places of TIPNR, the events of Theographic and of the
 * builder's list, the OBS stories and the sections of the English tN outlines, with their relations and the verses
 * that mention them. Every source numbers verses as English Bibles do, which is the numbering of the UHB: no
 * conversion. The map never depends on this module, and this module reads nothing of the map but the `tw:names/`
 * concepts it may join by `same-as`. No Node module is used.
 *
 * - **Relations.** TIPNR family (`parent-of`, `sibling-of`, `partner-of`, `tribe`, `founder-of`, `inhabitant-of`) and
 *   Theographic `part-of` and `follows` with confidence 100; Theographic participants (`participant`, from the event to
 *   the person) and places (`place`, from the event to the place) only when the name and at least one verse match
 *   exactly one TIPNR record of the kind (confidence 80); `occurs-in` from a story or section to each event with a verse
 *   in any of its ranges, that is, any overlap (confidence 60); `same-as` from a `tw:names/` concept to the one person
 *   or place whose dStrongs share a key with the link's Strong keys and whose verses overlap the link's (confidence 70).
 *   A match that is not
 *   exactly one goes to the review list of `report` (lines starting `review: `): nothing is guessed, and no two ids
 *   are merged.
 * - **Occurrences.** One add per TIPNR reference, per event verse and per verse of a story or section range, in the
 *   books of `origs` (the books built); a verse elsewhere is not counted. A builder event's range and a story or
 *   section range are the verses of the original between its ends.
 * - TIPNR's `@Brief`, `@Short`, `@Article` text and its translated names are never read (the reader drops them).
 */
import { compareCodePoints } from '../../codec/columns'
import type { CountRows } from '../../codec/counts'
import { bookNumber, BOOKS, verseId } from '../../ids'
import type { OrigModel, Relation, Topic, XtopicsCore, XtopicsPart } from '../../model'
import { type AcaiPerson, type AcaiPlace, joinAcai, joinAcaiPlaces } from '../../source/acai'
import type { ObPlace } from '../../source/openbible'
import type { TheoBirthDeath, TheoEvent } from '../../source/theographic'
import type { TipnrRecord, TipnrRelationType } from '../../source/tipnr'
import { Tally } from '../maps/tally'
import { versesOf } from '../maps/verses'
import { BUILDER_EVENTS } from './events'
import { buildGeo, haversineKm } from './geo'
import { sectionId } from './outline'

/** The key and release of each source of the common topics. `outlines` is the English tN the sections come from. */
export type XtopicsSources = {
  tipnr: [string, string]
  theographic: [string, string]
  obs: [string, string]
  outlines?: [string, string]
  acai?: [string, string]
  openbible?: [string, string]
}

/** The key of the builder's list of events (`ids.md`, "Ids of events") and its release. */
export const BUILDER_SOURCE: [string, string] = ['builder', '1']

/** A `tw:names/` concept of the common map: the Strong keys of its links and the verses of its links. */
export type TwName = { strongs: string[]; verses: number[] }

type Range = [number, number]

const RELATION_OF: Record<TipnrRelationType, string> = {
  parent: 'parent-of',
  child: 'parent-of',
  sibling: 'sibling-of',
  partner: 'partner-of',
  tribe: 'tribe',
  founder: 'founder-of',
  inhabitant: 'inhabitant-of',
}
const SYMMETRIC = new Set(['sibling-of', 'partner-of'])

/**
 * A title as the `same-as` of ACAI compares it (`ids.md`, "People of ACAI"): lowercase, no diacritics, only letters and digits
 * (`Abi-Albon` and `abialbon` are the same).
 */
export const foldTitle = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

/** The book code of a verse id. */
const bookOf = (verse: number): string => BOOKS[Math.floor(verse / 1_000_000) - 1]

/**
 * A TIPNR dStrong written as a Strong key (`ids.md`, "Strong keys"): Hebrew `H` and four digits (`H2148P` is `H2148`;
 * STEPBible's capital disambiguation letter is not the UHB's suffix), Greek `G` and the five digits of the UGNT
 * (`G2197H` is `G21970`). `null` for a text of another form.
 */
export function strongKeyOfDStrong(dStrong: string): string | null {
  const m = /^([HG])(\d{1,4})([a-z]?)[A-Z]*$/.exec(dStrong.trim())
  if (m === null) return null
  const digits = m[2].padStart(4, '0')
  return m[1] === 'H' ? `H${digits}${m[3]}` : `G${digits}0`
}

/** The part of a Strong key two sources can share: the letter and the four digits of the number (`G54850` is `G5485`). */
export const strongBase = (key: string): string | null => {
  const m = /^([HG])(\d+)/.exec(key.slice(key.lastIndexOf(':') + 1))
  if (m === null) return null
  // Greek: the first four digits, leading zeros kept (`G00110` is `G0011`); Hebrew: the number, padded to four digits
  return m[1] === 'G' ? `G${m[2].padStart(4, '0').slice(0, 4)}` : `H${m[2].replace(/^0+(?=\d{4})/, '').padStart(4, '0')}`
}

/** The last verse of each chapter of the originals, by book and chapter (`lastVerse` of the outline and OBS readers). */
export function chapterLengths(origs: OrigModel[]): (book: string, chapter: number) => number | undefined {
  const lengths = new Map<string, Map<number, number>>()
  for (const orig of origs) {
    const byChapter = new Map<number, number>()
    for (const id of versesOf(orig)) {
      const c = Math.floor((id % 1_000_000) / 1000)
      const v = id % 1000
      if (c > 0 && v > (byChapter.get(c) ?? 0)) byChapter.set(c, v)
    }
    lengths.set(orig.book, byChapter)
  }
  return (book, chapter) => lengths.get(book)?.get(chapter)
}

/**
 * What the maps add to the common topics (`ids.md`, "Builder rules: geo", "routes", "births and deaths", "events and places"): the data of OpenBible.info and
 * the ACAI places for `geo`, the birth and death places of Theographic, and the builder's lists.
 */
export type MapsInput = {
  openbible: ObPlace[]
  acaiPlaces: AcaiPlace[]
  birthDeath: TheoBirthDeath[]
  /** The builder's routes (`routes.json`), in the order they are shown. */
  routes: { event: string; stops: string[] }[]
  /** Births and deaths Theographic has wrong (`born-died-exclude.json`): the names are Theographic's. */
  exclude: { kind: 'born' | 'died'; person: string; place: string }[]
  /** Theographic place name to `lug:` id, for the names TIPNR does not have (`place-names.json`). */
  placeNames: Record<string, string>
}

export function buildXtopics(o: {
  tipnr: TipnrRecord[]
  events: TheoEvent[]
  obs: Map<number, Range[]>
  outlines: Map<string, { title: string; from: number; to: number }[]>
  origs: OrigModel[]
  res: XtopicsSources
  twNames?: Map<string, TwName>
  /** The English titles of the `tw:names/` concepts (the tW of the map language), for the `same-as` of ACAI. */
  twTitles?: Map<string, string>
  /** The ACAI people ({@link parseAcai}): the `gender` table and the `same-as` of ACAI. Needs `res.acai`. */
  acai?: AcaiPerson[]
  /** The data of the maps: `geo`, `routes`, `born-in`, `died-in`, the ACAI places. Needs `res.openbible`. Without it the core has none of them. */
  maps?: MapsInput
}): { core: XtopicsCore; parts: XtopicsPart[]; report: string[] } {
  const report: string[] = []
  const review = (line: string): void => {
    report.push(`review: ${line}`)
  }
  const lastVerse = chapterLengths(o.origs)
  const books = [...new Set(o.origs.map((orig) => orig.book))].sort((a, b) => bookNumber(a) - bookNumber(b))
  const verseList = new Map(o.origs.map((orig) => [orig.book, versesOf(orig)]))
  const inScope = (verse: number): boolean => verseList.has(bookOf(verse))
  /** The verses of the originals from `from` to `to`; a book not built gives none, with a line in the report. */
  const versesIn = (what: string, [from, to]: Range): number[] => {
    const out: number[] = []
    for (let id = verseId(bookOf(from), 0, 0); id <= to; id += 1_000_000) {
      const list = verseList.get(bookOf(id))
      if (list === undefined) {
        report.push(`${what}: ${bookOf(id)} is not built: its verses are not counted`)
        continue
      }
      for (const v of list) if (v >= from && v <= to && v % 1000 !== 0) out.push(v)
    }
    return out
  }

  const topics = new Map<string, Topic>()
  const tally = new Tally('verses')
  const relations: Relation[] = []
  const seenRelation = new Set<string>()
  const relate = (from: string, type: string, to: string, source: string, confidence: number): void => {
    const [a, b] = SYMMETRIC.has(type) && compareCodePoints(to, from) < 0 ? [to, from] : [from, to]
    const key = `${a}\0${type}\0${b}`
    if (a === b || seenRelation.has(key)) return
    seenRelation.add(key)
    relations.push({ from: a, to: b, type, source, confidence })
  }
  const count = (id: string, verses: Iterable<number>): void => {
    for (const v of verses) if (inScope(v)) tally.add(id, bookOf(v), [v])
  }
  const used = new Map<string, Set<string>>()
  const touch = (source: string, verses: Iterable<number>): void => {
    let set = used.get(source)
    if (set === undefined) used.set(source, (set = new Set()))
    for (const v of verses) if (inScope(v)) set.add(bookOf(v))
  }

  // People and places
  const tipnrKey = o.res.tipnr[0]
  const byUnique = new Map<string, TipnrRecord[]>()
  const strongs: Record<string, string[]> = {}
  const versesOfRecord = new Map<string, Set<number>>()
  for (const r of o.tipnr) {
    if (topics.has(r.id)) {
      report.push(`tipnr: ${r.id} is twice: the second record (${r.unique}) is left out`)
      continue
    }
    topics.set(r.id, { kind: r.kind, source: tipnrKey, ref: r.unique, title: r.unique.split('@')[0].trim(), ustrong: r.uStrong })
    const list = byUnique.get(r.unique)
    if (list === undefined) byUnique.set(r.unique, [r])
    else list.push(r)
    const keys = new Set<string>()
    const verses = new Set<number>()
    for (const name of r.names) {
      const key = strongKeyOfDStrong(name.dStrong)
      if (key === null) report.push(`tipnr: ${r.id}: dStrong not understood: ${name.dStrong}`)
      else keys.add(key)
      for (const ref of name.refs) {
        verses.add(ref.verse)
        if (inScope(ref.verse)) tally.add(r.id, bookOf(ref.verse), [ref.verse])
      }
    }
    if (keys.size > 0) strongs[r.id] = [...keys].sort(compareCodePoints)
    versesOfRecord.set(r.id, verses)
    touch(tipnrKey, verses)
  }
  const resolve = (unique: string): TipnrRecord | undefined => {
    const list = byUnique.get(unique.split('=')[0].trim()) ?? []
    return list.length === 1 ? list[0] : list.find((r) => r.kind === 'person')
  }
  for (const r of o.tipnr) {
    for (const rel of r.relations) {
      const other = resolve(rel.unique)
      if (other === undefined) {
        report.push(`tipnr: ${r.id}: ${rel.type} ${rel.unique} is not a record: no relation`)
        continue
      }
      const type = RELATION_OF[rel.type]
      // The column lists the parents of the record, its founders, its inhabitants; the others are the record's own.
      if (rel.type === 'parent') relate(other.id, type, r.id, tipnrKey, 100)
      else if (rel.type === 'founder' || rel.type === 'inhabitant') relate(other.id, type, r.id, tipnrKey, 100)
      else relate(r.id, type, other.id, tipnrKey, 100)
    }
  }

  // The maps: the points of the places, from OpenBible.info and TIPNR, and the ACAI places joined to them
  let geo: XtopicsCore['geo']
  let acaiByLug = new Map<string, AcaiPlace>()
  let openbibleUsed = false
  if (o.maps !== undefined) {
    const lugOfRef = new Map<string, string>()
    const lugsOfName = new Map<string, string[]>()
    for (const [id, t] of [...topics].sort((a, b) => compareCodePoints(a[0], b[0]))) {
      if (t.kind !== 'place' || !id.startsWith('lug:')) continue
      if (lugOfRef.has(t.ref)) report.push(`review: acai: ${lugOfRef.get(t.ref)} and ${id} have the same TIPNR name ${t.ref}: ACAI joins ${id}`)
      lugOfRef.set(t.ref, id)
      const name = t.ref.split('@')[0].trim()
      const list = lugsOfName.get(name)
      if (list === undefined) lugsOfName.set(name, [id])
      else list.push(id)
    }
    acaiByLug = joinAcaiPlaces(o.maps.acaiPlaces, lugOfRef, lugsOfName, report).byLug
    const built = buildGeo({ topics, records: o.tipnr, openbible: o.maps.openbible, acaiByLug, report })
    geo = built.geo
    openbibleUsed = built.fromOpenBible > 0
  }
  const pointOfLug = (id: string): { lat: number; lon: number } | undefined => {
    const g = geo?.[id]
    return g === undefined || g.sure === 0 ? undefined : { lat: g.lat / 100, lon: g.lon / 100 }
  }
  /** Of the records that match a name, the one within 15 km of Theographic's own point of the place, when it is exactly one. */
  const nearest = (found: TipnrRecord[], point: { lat: number; lon: number } | undefined): TipnrRecord[] => {
    if (found.length < 2 || point === undefined) return found
    const near = found.filter((r) => {
      const at = pointOfLug(r.id)
      return at !== undefined && haversineKm(at, point) < 15
    })
    return near.length === 1 ? near : found
  }
  /**
   * The TIPNR places for the name of a Theographic place, after the name and a verse gave `found`: when they did not give exactly one, the places
   * of that name, the one within 15 km of Theographic's point if exactly one is; with no place of that name, the one the builder's list names.
   */
  const placeFor = (name: string, found: TipnrRecord[], point: { lat: number; lon: number } | undefined): TipnrRecord[] => {
    if (found.length === 1) return found
    const named = nameIndex.get(`place\0${name}`) ?? []
    if (named.length > 1) {
      const near = nearest(named, point)
      return near.length === 1 ? near : found
    }
    if (named.length === 0) {
      const eq = o.maps?.placeNames[name]
      if (eq !== undefined && topics.get(eq)?.kind === 'place') return o.tipnr.filter((r) => r.id === eq)
    }
    return found
  }

  // Events: Theographic, then the builder's list
  const theoKey = o.res.theographic[0]
  const eventRanges = new Map<string, Range[]>()
  const idOfEvent = new Map(o.events.map((e) => [e.eventID, e.id]))
  const names = (r: TipnrRecord): Set<string> => new Set([r.unique.split('@')[0], ...r.names.map((n) => n.name)].map((n) => n.replace(/_/g, ' ').trim()))
  const nameIndex = new Map<string, TipnrRecord[]>()
  for (const r of o.tipnr) {
    for (const name of names(r)) {
      const key = `${r.kind}\0${name}`
      const list = nameIndex.get(key)
      if (list === undefined) nameIndex.set(key, [r])
      else if (!list.includes(r)) list.push(r)
    }
  }
  for (const e of o.events) {
    if (topics.has(e.id)) {
      report.push(`theographic: ${e.id} is twice: event ${e.eventID} is left out`)
      continue
    }
    topics.set(e.id, { kind: 'event', source: theoKey, ref: String(e.eventID), title: e.title, ustrong: '' })
    eventRanges.set(e.id, e.verses.map((v) => [v, v]))
    count(e.id, e.verses)
    touch(theoKey, e.verses)
    for (const n of e.partOf) relate(e.id, 'part-of', idOfEvent.get(n)!, theoKey, 100)
    for (const n of e.predecessor) relate(e.id, 'follows', idOfEvent.get(n)!, theoKey, 100)
    const link = (list: { name: string; verses: number[]; point?: { lat: number; lon: number } }[], kind: 'person' | 'place', type: string): void => {
      for (const p of list) {
        let found = (nameIndex.get(`${kind}\0${p.name}`) ?? []).filter((r) => p.verses.some((v) => versesOfRecord.get(r.id)!.has(v)))
        if (kind === 'place' && o.maps !== undefined) found = placeFor(p.name, found, p.point)
        if (found.length === 1) relate(e.id, type, found[0].id, theoKey, 80)
        else review(`${e.id} ${type} ${JSON.stringify(p.name)}: ${found.length === 0 ? 'no TIPNR record' : `${found.length} TIPNR records (${found.map((r) => r.id).join(', ')})`} with the name and a verse of the event`)
      }
    }
    link(e.participants, 'person', 'participant')
    link(e.places, 'place', 'place')
  }
  let builderUsed = false
  for (const b of BUILDER_EVENTS) {
    if (topics.has(b.id)) {
      report.push(`builder: ${b.id} is already a topic: the builder's event is left out`)
      continue
    }
    builderUsed = true
    topics.set(b.id, { kind: 'event', source: BUILDER_SOURCE[0], ref: b.id, title: b.title, ustrong: '' })
    eventRanges.set(b.id, b.ranges.map(([a, z]) => [a, z]))
    const verses = b.ranges.flatMap((r) => versesIn(b.id, r))
    count(b.id, verses)
    touch(BUILDER_SOURCE[0], verses)
  }

  // Births and deaths: from the person to the place, only where the name and a verse match exactly one TIPNR record of each
  if (o.maps !== undefined) {
    const excluded = new Set(o.maps.exclude.map((x) => `${x.kind}\0${x.person}\0${x.place}`))
    let made = 0
    let left = 0
    for (const b of o.maps.birthDeath) {
      const label = `${b.kind}-in ${JSON.stringify(b.person.name)} ${JSON.stringify(b.place.name)}`
      if (excluded.has(`${b.kind}\0${b.person.name}\0${b.place.name}`)) {
        report.push(`maps: ${label}: on the list of exclusions`)
        left++
        continue
      }
      const people = (nameIndex.get(`person\0${b.person.name}`) ?? []).filter((r) => b.person.verses.some((v) => versesOfRecord.get(r.id)!.has(v)))
      const where = placeFor(b.place.name, (nameIndex.get(`place\0${b.place.name}`) ?? []).filter((r) => b.place.verses.some((v) => versesOfRecord.get(r.id)!.has(v))), b.place.point)
      if (people.length === 1 && where.length === 1) {
        relate(people[0].id, `${b.kind}-in`, where[0].id, theoKey, 80)
        made++
      } else {
        left++
        review(`${label}: ${people.length} TIPNR persons and ${where.length} TIPNR places with the name and a verse`)
      }
    }
    report.push(`maps: ${made} born-in and died-in relations made, ${left} left out`)
  }

  // Stories and sections, and the events that occur in them
  const ranges: Record<string, Range[]> = {}
  const spans = (id: string, source: string, list: Range[]): void => {
    ranges[id] = list.map(([a, z]) => [a, z])
    const verses = list.flatMap((r) => versesIn(id, r))
    count(id, verses)
    touch(source, verses)
    for (const [event, evRanges] of eventRanges) {
      if (evRanges.some(([a, z]) => list.some(([s, t]) => a <= t && s <= z))) relate(id, 'occurs-in', event, source, 60)
    }
  }
  const obsKey = o.res.obs[0]
  for (const [n, list] of [...o.obs].sort((a, b) => a[0] - b[0])) {
    const id = `obs:${n}`
    topics.set(id, { kind: 'story', source: obsKey, ref: String(n), title: '', ustrong: '' })
    spans(id, obsKey, list)
  }
  const outlineKey = o.res.outlines?.[0]
  if (o.outlines.size > 0 && outlineKey === undefined) report.push('outlines: no source key for the outlines: the sections are left out')
  for (const book of [...o.outlines.keys()].sort((a, b) => bookNumber(a) - bookNumber(b))) {
    if (outlineKey === undefined) break
    for (const entry of o.outlines.get(book)!) {
      let id: string
      try {
        id = sectionId(book, entry.from, entry.to, lastVerse)
      } catch (e) {
        report.push(`outline ${book}: ${(e as Error).message}: ${JSON.stringify(entry.title)} left out`)
        continue
      }
      if (topics.has(id)) {
        report.push(`outline ${book}: ${id} is twice: ${JSON.stringify(entry.title)} left out`)
        continue
      }
      topics.set(id, { kind: 'section', source: outlineKey, ref: id.slice('sec:'.length), title: entry.title, ustrong: '' })
      spans(id, outlineKey, [[entry.from, entry.to]])
    }
  }

  // same-as: a tW name and the one person or place it shares a Strong key and a verse with
  if (o.twNames !== undefined) {
    const byBase = new Map<string, Set<string>>()
    for (const [id, keys] of Object.entries(strongs)) {
      for (const key of keys) {
        const base = strongBase(key)!
        let set = byBase.get(base)
        if (set === undefined) byBase.set(base, (set = new Set()))
        set.add(id)
      }
    }
    for (const concept of [...o.twNames.keys()].sort(compareCodePoints)) {
      if (!concept.startsWith('tw:names/')) continue
      const tw = o.twNames.get(concept)!
      const candidates = new Set<string>()
      for (const key of tw.strongs) for (const id of byBase.get(strongBase(key) ?? '') ?? []) candidates.add(id)
      const found = [...candidates].filter((id) => tw.verses.some((v) => versesOfRecord.get(id)!.has(v))).sort(compareCodePoints)
      if (found.length === 1) relate(concept, 'same-as', found[0], tipnrKey, 70)
      else {
        const why =
          candidates.size === 0
            ? 'no TIPNR record has its Strong keys'
            : found.length === 0
              ? `no TIPNR record of its Strong keys (${[...candidates].sort(compareCodePoints).join(', ')}) shares a verse`
              : `${found.length} TIPNR records (${found.join(', ')})`
        review(`${concept} same-as: ${why}`)
      }
    }
  }

  // ACAI: the gender of each person it joins, and a same-as from a tW name no TIPNR record was joined to
  const gender: Record<string, 1 | 2> = {}
  let acaiUsed = false
  if (o.acai !== undefined) {
    if (o.res.acai === undefined) throw new Error('acai: the people of ACAI need res.acai (its key and release)')
    const acaiKey = o.res.acai[0]
    const perOfRef = new Map<string, string>()
    for (const [id, t] of [...topics].sort((a, b) => compareCodePoints(a[0], b[0]))) {
      if (t.kind !== 'person' || !id.startsWith('per:')) continue
      if (perOfRef.has(t.ref)) report.push(`review: acai: ${perOfRef.get(t.ref)} and ${id} have the same TIPNR name ${t.ref}: ACAI joins ${id}`)
      perOfRef.set(t.ref, id)
    }
    const joined = joinAcai(o.acai, perOfRef, report)
    for (const [per, p] of [...joined.byPer].sort((a, b) => compareCodePoints(a[0], b[0]))) if (p.gender !== 0) gender[per] = p.gender
    if (Object.keys(gender).length > 0) acaiUsed = true
    if (o.twTitles === undefined) report.push('acai: no tW titles (no map language): no same-as of ACAI')
    else {
      const linked = new Set(relations.filter((r) => r.type === 'same-as').map((r) => r.from))
      const byFolded = new Map<string, Set<string>>()
      const index = (text: string, concept: string): void => {
        const f = foldTitle(text)
        if (f === '') return
        let set = byFolded.get(f)
        if (set === undefined) byFolded.set(f, (set = new Set()))
        set.add(concept)
      }
      for (const [concept, title] of o.twTitles) {
        if (!concept.startsWith('tw:names/')) continue
        index(concept.slice('tw:names/'.length), concept)
        index(title, concept)
        for (const piece of title.split(',')) index(piece, concept)
      }
      let kept = 0
      let added = 0
      for (const [per, p] of [...joined.byPer].sort((a, b) => compareCodePoints(a[0], b[0]))) {
        for (const title of p.tw) {
          const found = [...(byFolded.get(foldTitle(title)) ?? [])].sort(compareCodePoints)
          if (found.length !== 1) {
            review(`acai ${p.id} (${per}) tW ${JSON.stringify(title)}: ${found.length === 0 ? 'no tw:names/ article has that title' : `${found.length} articles (${found.join(', ')})`}`)
            continue
          }
          if (linked.has(found[0])) {
            if (!relations.some((r) => r.type === 'same-as' && r.from === found[0] && r.to === per)) review(`acai ${p.id} (${per}) tW ${found[0]}: the article is joined by TIPNR to another person: kept`)
            kept++
            continue
          }
          relate(found[0], 'same-as', per, acaiKey, 75)
          added++
          acaiUsed = true
        }
      }
      report.push(`acai: ${added} same-as added from the tW titles of ACAI, ${kept} left to the TIPNR rule`)
    }
  }

  // ACAI places: a same-as from a tW name to a place. A tW article joined to a person may be joined to a place too ("Israel"); one TIPNR
  // already joined to a place keeps that place alone.
  if (o.maps !== undefined && acaiByLug.size > 0) {
    if (o.res.acai === undefined) throw new Error('acai: the places of ACAI need res.acai (its key and release)')
    if (o.twTitles === undefined) report.push('acai: no tW titles (no map language): no same-as of ACAI for places')
    else {
      const placeLinked = new Set(relations.filter((r) => r.type === 'same-as' && r.to.startsWith('lug:')).map((r) => r.from))
      const byFolded = new Map<string, Set<string>>()
      const index = (text: string, concept: string): void => {
        const f = foldTitle(text)
        if (f === '') return
        let set = byFolded.get(f)
        if (set === undefined) byFolded.set(f, (set = new Set()))
        set.add(concept)
      }
      for (const [concept, title] of o.twTitles) {
        if (!concept.startsWith('tw:names/')) continue
        index(concept.slice('tw:names/'.length), concept)
        index(title, concept)
        for (const piece of title.split(',')) index(piece, concept)
      }
      let kept = 0
      let added = 0
      for (const [lug, p] of [...acaiByLug].sort((a, b) => compareCodePoints(a[0], b[0]))) {
        for (const title of p.tw) {
          const found = [...(byFolded.get(foldTitle(title)) ?? [])].sort(compareCodePoints)
          if (found.length !== 1) {
            review(`acai ${p.id} (${lug}) tW ${JSON.stringify(title)}: ${found.length === 0 ? 'no tw:names/ article has that title' : `${found.length} articles (${found.join(', ')})`}`)
            continue
          }
          if (placeLinked.has(found[0])) {
            if (!relations.some((r) => r.type === 'same-as' && r.from === found[0] && r.to === lug)) review(`acai ${p.id} (${lug}) tW ${found[0]}: the article is joined by TIPNR to another place: kept`)
            kept++
            continue
          }
          relate(found[0], 'same-as', lug, o.res.acai[0], 75)
          added++
          acaiUsed = true
        }
      }
      report.push(`acai: ${added} same-as added from the tW titles of ACAI places, ${kept} left to the TIPNR rule`)
    }
  }
  if (acaiByLug.size > 0) acaiUsed = true

  // The core and the parts
  const sources: [string, string][] = [o.res.tipnr, o.res.theographic, o.res.obs]
  if (acaiUsed) sources.push(o.res.acai!)
  if (openbibleUsed) {
    if (o.res.openbible === undefined) throw new Error('geo: the points of OpenBible.info need res.openbible (its key and release)')
    sources.push(o.res.openbible)
  }
  if (builderUsed) sources.push(BUILDER_SOURCE)
  if (o.res.outlines !== undefined && [...topics.values()].some((t) => t.source === outlineKey)) sources.push(o.res.outlines)
  const res = sources.map(([k, r]) => [k, r] as [string, string]).sort((a, b) => compareCodePoints(a[0], b[0]))
  const order = (list: string[]): string[] => list.sort((a, b) => bookNumber(a) - bookNumber(b))
  const coverage: XtopicsCore['coverage'] = new Map(
    res.map(([key]) => [key, { whole: order([...(used.get(key) ?? [])]), partial: [] }] as [string, { whole: string[]; partial: string[] }]),
  )
  const occurrences: CountRows = new Map()
  for (const [key, byBook] of tally.table().rows) {
    occurrences.set(key, new Map([...byBook].map(([book, [, verses]]) => [book, [verses, verses] as [number, number]])))
  }
  relations.sort((a, b) => compareCodePoints(a.from, b.from) || compareCodePoints(a.type, b.type) || compareCodePoints(a.to, b.to))
  const core: XtopicsCore = {
    part: 'core',
    res,
    coverage,
    topics: new Map([...topics].sort((a, b) => compareCodePoints(a[0], b[0]))),
    occurrences,
  }
  if (relations.length > 0) core.relations = relations
  if (Object.keys(gender).length > 0) core.gender = gender
  if (geo !== undefined && Object.keys(geo).length > 0) core.geo = geo
  if (o.maps !== undefined && o.maps.routes.length > 0) {
    for (const r of o.maps.routes) {
      if (topics.get(r.event)?.kind !== 'event') throw new Error(`routes: ${JSON.stringify(r.event)} is not an event of the topics`)
      r.stops.forEach((id, i) => {
        if (topics.get(id)?.kind !== 'place') throw new Error(`routes: the stop ${JSON.stringify(id)} of ${JSON.stringify(r.event)} is not a place of the topics`)
        if (i > 0 && r.stops[i - 1] === id) throw new Error(`routes: ${JSON.stringify(r.event)} has the stop ${JSON.stringify(id)} twice in a row`)
      })
    }
    core.routes = o.maps.routes.map((r) => ({ event: r.event, stops: [...r.stops] }))
  }
  if (Object.keys(strongs).length > 0) core.strongs = strongs
  if (Object.keys(ranges).length > 0) core.ranges = ranges
  const parts: XtopicsPart[] = []
  for (const book of books) {
    const lists = tally.verseLists(book)
    if (lists.size > 0) parts.push({ part: book, occurrences: lists })
  }
  return { core, parts, report }
}
