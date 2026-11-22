/**
 * Theographic reader: the events of the Theographic Bible Metadata (viz.bible), CC BY-SA 4.0. It reads the title, the
 * `eventID`, the verses, the `partOf` and `predecessor` links, and the participants and places with the verses they have
 * in the event. It never reads a date or a duration (`startDate`, `duration`, `lag*`, `verseSort`, `sortKey`,
 * `birthYear`, `deathYear`, `yearNum`), nor any Easton text (`dictText`, `dictionaryText`, `eastons`): the format keeps
 * neither. Theographic numbers verses as English Bibles do, which is the numbering of the UHB: no conversion. No Node
 * module is used.
 */
import { verseId } from '../ids'
import { slug } from './tipnr'

export type TheoEvent = {
  eventID: number
  id: string
  title: string
  verses: number[]
  partOf: number[]
  predecessor: number[]
  participants: { name: string; verses: number[] }[]
  /** `point`: Theographic's own point of the place (OpenBible's, else Recogito's), degrees, when it has one (`ids.md`, "Builder rules: events and places"). */
  places: { name: string; verses: number[]; point?: { lat: number; lon: number } }[]
}

/** A person's birth or death place (`born-in`, `died-in`): the names and all the verses of the person and of the place, and the place's point. */
export type TheoBirthDeath = {
  kind: 'born' | 'died'
  person: { name: string; verses: number[] }
  place: { name: string; verses: number[]; point?: { lat: number; lon: number } }
}

/** The OSIS book codes of Theographic with the book codes of `ids.ts`. */
const OSIS_TO_BOOK: ReadonlyMap<string, string> = new Map(
  (
    'Gen:gen Exod:exo Lev:lev Num:num Deut:deu Josh:jos Judg:jdg Ruth:rut 1Sam:1sa 2Sam:2sa 1Kgs:1ki 2Kgs:2ki 1Chr:1ch ' +
    '2Chr:2ch Ezra:ezr Neh:neh Esth:est Job:job Ps:psa Prov:pro Eccl:ecc Song:sng Isa:isa Jer:jer Lam:lam Ezek:ezk ' +
    'Dan:dan Hos:hos Joel:jol Amos:amo Obad:oba Jonah:jon Mic:mic Nah:nam Hab:hab Zeph:zep Hag:hag Zech:zec Mal:mal ' +
    'Matt:mat Mark:mrk Luke:luk John:jhn Acts:act Rom:rom 1Cor:1co 2Cor:2co Gal:gal Eph:eph Phil:php Col:col ' +
    '1Thess:1th 2Thess:2th 1Tim:1ti 2Tim:2ti Titus:tit Phlm:phm Heb:heb Jas:jas 1Pet:1pe 2Pet:2pe 1John:1jn 2John:2jn ' +
    '3John:3jn Jude:jud Rev:rev'
  )
    .split(' ')
    .map((pair) => pair.split(':') as [string, string]),
)

type Rec = { id: string; fields: Record<string, unknown> }
type Named = Map<string, { name: string; verses: Set<number>; point?: { lat: number; lon: number } }>

function records(text: string, what: string, issues: string[]): Rec[] {
  try {
    const data: unknown = JSON.parse(text)
    if (Array.isArray(data)) return data as Rec[]
  } catch {
    // reported below
  }
  issues.push(`${what}: not a JSON array of records`)
  return []
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

type TheoFiles = { events: string; verses: string; people: string; places: string }

/** The verse of each verse record, and the people and the places with the verses they have. */
type Loaded = { people: Named; places: Named; rawPeople: Rec[]; verseOf: Map<string, number> }
function load(files: TheoFiles, issues: string[]): Loaded {
  // Verse record id -> verse id (OSIS reference, no versification conversion).
  const verseOf = new Map<string, number>()
  for (const r of records(files.verses, 'verses', issues)) {
    const osis = r.fields?.osisRef
    const m = typeof osis === 'string' ? /^(\w+)\.(\d+)\.(\d+)$/.exec(osis) : null
    const book = m === null ? undefined : OSIS_TO_BOOK.get(m[1])
    if (m === null || book === undefined) {
      issues.push(`verse ${r.id}: reference not understood: ${String(osis)}`)
      continue
    }
    try {
      verseOf.set(r.id, verseId(book, Number(m[2]), Number(m[3])))
    } catch {
      issues.push(`verse ${r.id}: reference outside the books and numbers of the format: ${String(osis)}`)
    }
  }

  const named = (list: Rec[], idKey: string): Named => {
    const map: Named = new Map()
    for (const r of list) {
      const name = r.fields?.displayTitle
      if (typeof name !== 'string' || name === '') {
        issues.push(`${idKey} ${String(r.fields?.[idKey])}: no displayTitle`)
        continue
      }
      const verses = new Set<number>()
      for (const v of strings(r.fields.verses)) {
        const id = verseOf.get(v)
        if (id !== undefined) verses.add(id)
      }
      const number = (v: unknown): number => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : Number.NaN)
      const lat = number(r.fields.openBibleLat ?? r.fields.latitude)
      const lon = number(r.fields.openBibleLong ?? r.fields.longitude)
      const has = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      map.set(r.id, has ? { name, verses, point: { lat, lon } } : { name, verses })
    }
    return map
  }
  const rawPeople = records(files.people, 'people', issues)
  return { people: named(rawPeople, 'personID'), places: named(records(files.places, 'places', issues), 'placeID'), rawPeople, verseOf }
}

/**
 * The birth and death places of Theographic's people (`birthPlace`, `deathPlace`), for `born-in` and `died-in`. Anything that cannot be used goes to `issues`.
 * Reads the files again: {@link parseTheographicAll} reads them once for both.
 */
export function parseTheoBirthDeath(files: TheoFiles, issues: string[]): TheoBirthDeath[] {
  return birthDeathFrom(load(files, issues), issues)
}

function birthDeathFrom({ people, places, rawPeople }: Loaded, issues: string[]): TheoBirthDeath[] {
  const out: TheoBirthDeath[] = []
  for (const r of rawPeople) {
    const person = people.get(r.id)
    if (person === undefined) continue
    for (const [key, kind] of [['birthPlace', 'born'], ['deathPlace', 'died']] as const) {
      for (const ref of strings(r.fields?.[key])) {
        const place = places.get(ref)
        if (place === undefined) {
          issues.push(`person ${r.id}: ${key} unknown: ${ref}`)
          continue
        }
        out.push({
          kind,
          person: { name: person.name, verses: [...person.verses].sort((a, b) => a - b) },
          place: { name: place.name, verses: [...place.verses].sort((a, b) => a - b), ...(place.point === undefined ? {} : { point: place.point }) },
        })
      }
    }
  }
  return out
}

/** Parses the events of Theographic. Anything that cannot be used is described in `issues`. */
export function parseTheographic(files: TheoFiles, issues: string[]): TheoEvent[] {
  return eventsFrom(files, issues, load(files, issues))
}

/** The events and the births and deaths of Theographic, reading the four files once; what cannot be used goes to `issues` once. */
export function parseTheographicAll(files: TheoFiles, issues: string[]): { events: TheoEvent[]; birthDeath: TheoBirthDeath[] } {
  const loaded = load(files, issues)
  return { events: eventsFrom(files, issues, loaded), birthDeath: birthDeathFrom(loaded, issues) }
}

function eventsFrom(files: TheoFiles, issues: string[], loaded: Loaded): TheoEvent[] {
  const { people, places, verseOf } = loaded

  const raw = records(files.events, 'events', issues)
    .filter((r) => {
      const f = r.fields
      const ok = typeof f?.eventID === 'number' && typeof f.title === 'string' && f.title !== ''
      if (!ok) issues.push(`event ${r.id}: no eventID or title`)
      return ok
    })
    .sort((a, b) => (a.fields.eventID as number) - (b.fields.eventID as number))
  const numberOf = new Map(raw.map((r) => [r.id, r.fields.eventID as number]))

  const used = new Map<string, number>()
  return raw.map((r) => {
    const f = r.fields
    const eventID = f.eventID as number
    const title = f.title as string
    let base = slug(title)
    if (base === '') {
      issues.push(`event ${eventID}: title gives an empty slug`)
      base = `event-${eventID}`
    }
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    const id = n === 1 ? `ev:${base}` : `ev:${base}-${n}`

    const verseSet = new Set<number>()
    for (const v of strings(f.verses)) {
      const vid = verseOf.get(v)
      if (vid === undefined) issues.push(`event ${eventID}: verse not usable: ${v}`)
      else verseSet.add(vid)
    }
    const links = (key: string): number[] => {
      const out: number[] = []
      for (const ref of strings(f[key])) {
        const num = numberOf.get(ref)
        if (num === undefined) issues.push(`event ${eventID}: ${key} names an unknown event: ${ref}`)
        else out.push(num)
      }
      return out
    }
    const share = (keys: string[], map: Named, what: string) => {
      const out: { name: string; verses: number[] }[] = []
      for (const ref of keys) {
        const item = map.get(ref)
        if (item === undefined) {
          issues.push(`event ${eventID}: ${what} unknown: ${ref}`)
          continue
        }
        out.push({ name: item.name, verses: [...item.verses].filter((v) => verseSet.has(v)).sort((a, b) => a - b), ...(item.point === undefined ? {} : { point: item.point }) })
      }
      return out
    }
    return {
      eventID,
      id,
      title,
      verses: [...verseSet].sort((a, b) => a - b),
      partOf: links('partOf'),
      predecessor: links('predecessor'),
      participants: share(strings(f.participants), people, 'participant'),
      places: share(strings(f.locations), places, 'place'),
    }
  })
}
