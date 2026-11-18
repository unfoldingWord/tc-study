/**
 * `family` and `people`: the family of a person (parents, children, partners, siblings) and the names a person is found by, from the
 * common `xtopics` (TIPNR relations, ACAI `gender`), the verses of its parts, and the language's `map` and `topics` cores (the names,
 * `ids.md` "Names of people"). The verses of a relation are not in the pack: {@link kinVerses} derives them (`ids.md`, "Verses of a
 * family relation"), the one implementation Mini and tc-study share. No Node module here.
 */
import { personName, twOfPeople, type TopicsCore, type XtopicsCore, type XtopicsPart } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'

/** The resources the family data comes from, as `res` keys of the `xtopics` core. */
export const TIPNR_SOURCE = 'STEPBible/STEPBible-Data/TIPNR'
export const ACAI_SOURCE = 'BibleAquifer/ACAI'

/** The chapter of a verse id (`book * 1000 + chapter`). */
const chapterOf = (v: number): number => Math.floor(v / 1000)

/**
 * The verses that show a family relation between two people, from the verse ids each is mentioned in (`ids.md`, "Verses of a family
 * relation"): the first three shared verses as `[v, v]`; else the closest pair in one chapter at most three verses apart, as
 * `[first, last]` (ties: the smaller first, then the smaller last); else none. The lists need not be sorted or unique.
 */
export function kinVerses(a: Iterable<number>, b: Iterable<number>): [number, number][] {
  const A = [...new Set(a)].sort((x, y) => x - y)
  const B = new Set(b)
  const shared = A.filter((v) => B.has(v))
  if (shared.length > 0) return shared.slice(0, 3).map((v) => [v, v])
  const byChapter = new Map<number, number[]>()
  for (const v of B) {
    const list = byChapter.get(chapterOf(v))
    if (list === undefined) byChapter.set(chapterOf(v), [v])
    else list.push(v)
  }
  let best: [number, number] | undefined
  let bestGap = 4
  for (const x of A) {
    for (const y of byChapter.get(chapterOf(x)) ?? []) {
      const gap = Math.abs(x - y)
      if (gap > 3) continue
      const pair: [number, number] = x < y ? [x, y] : [y, x]
      if (best === undefined || gap < bestGap || (gap === bestGap && (pair[0] < best[0] || (pair[0] === best[0] && pair[1] < best[1])))) {
        best = pair
        bestGap = gap
      }
    }
  }
  return best === undefined ? [] : [best]
}

/** A person in an answer: the name in the language (`ids.md`), its note when it has one, its gender (1 man, 2 woman) when known. */
export type PersonRef = { id: string; name: string; note?: string; gender?: 1 | 2 }
/** A relative: the person, and the verses that show the relation (empty when none is found or a part is missing). */
export type Relative = PersonRef & { verses: [number, number][]; half?: boolean }
/**
 * The family of a person. `half` is set on a sibling only when the data proves it: both have exactly two parents in the data and share
 * exactly one. `tw`: the `tw:names/` articles joined to the person. `verses`: how many verses mention the person.
 */
export type FamilyData = PersonRef & {
  parents: Relative[]
  children: Relative[]
  partners: Relative[]
  siblings: Relative[]
  tw: string[]
  verses: number
  sources: string[]
}

/** One entry of {@link peopleQuery}: a person and every name a client may find it by, its own name first. */
export type PersonEntry = PersonRef & { names: string[]; verses: number }

type Ctx = {
  core: XtopicsCore
  tw: Map<string, string[]>
  parentsOf: Map<string, Set<string>>
  mapNames: Record<string, string[]>
  topics?: TopicsCore
  people?: TopicsCore['people']
}

/** What depends on the common core alone, built once per core (a reader keeps its core): the same-as index and the parents. */
const byCore = new WeakMap<XtopicsCore, { tw: Map<string, string[]>; parentsOf: Map<string, Set<string>> }>()

function contextOf(core: XtopicsCore, mapNames: Record<string, string[]> | undefined, topics: TopicsCore | undefined): Ctx {
  let c = byCore.get(core)
  if (c === undefined) {
    const parentsOf = new Map<string, Set<string>>()
    for (const r of core.relations ?? []) {
      if (r.type !== 'parent-of') continue
      let set = parentsOf.get(r.to)
      if (set === undefined) parentsOf.set(r.to, (set = new Set()))
      set.add(r.from)
    }
    c = { tw: twOfPeople(core), parentsOf }
    byCore.set(core, c)
  }
  return { core, ...c, mapNames: mapNames ?? {}, topics, people: topics?.people }
}

function ref(ctx: Ctx, id: string): PersonRef {
  const out: PersonRef = { id, name: personName(id, ctx.core, ctx.tw, ctx.mapNames, ctx.people) }
  const note = ctx.people?.notes[id]
  if (note !== undefined) out.note = note
  const g = ctx.core.gender?.[id]
  if (g !== undefined) out.gender = g
  return out
}

const countOf = (core: XtopicsCore, id: string): number => [...(core.occurrences.get(id)?.values() ?? [])].reduce((n, [, verses]) => n + verses, 0)

/**
 * In the order of their first verse; those with no verse last; ties by id (code point). The verses need the parts: with no part of a
 * book installed, the order of the people of that book falls back to their ids.
 */
function ordered(list: Relative[]): Relative[] {
  const first = (r: Relative): number => r.verses[0]?.[0] ?? Number.POSITIVE_INFINITY
  return list.sort((a, b) => first(a) - first(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

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
  return contextOf(x.core, lang.map?.core.names, lang.topics?.core)
}

/** The parts of `books`: only those (`xtopicsParts`), or, from a reader without it, the whole unit. */
async function partsOf(reader: PackReader, books: Set<string>): Promise<Map<string, XtopicsPart>> {
  if (books.size === 0) return new Map()
  const some = reader.xtopicsParts === undefined ? undefined : await reader.xtopicsParts([...books])
  if (some !== undefined) return some
  return (await reader.mapsOf(['xtopics'])).xtopics?.parts ?? new Map()
}

/**
 * The family of a person (`per:` id): `data: null` when `xtopics` is not installed or the id is not a person of it. Reads the `xtopics`
 * core and only the parts of the books the person shares with a relative (their verses give the verses of each relation). A part it
 * needed and could not read is listed in `notInstalled` (`{ unit: "xtopics", book, what: "part" }`): its verses are missing, not zero.
 */
export async function familyQuery(reader: PackReader, id: string): Promise<Answer<FamilyData | null>> {
  if (typeof id !== 'string' || !id.startsWith('per:')) throw new ClientError('E_ARG', `not a person id: ${JSON.stringify(id)}`)
  const out = newAnswer<FamilyData | null>(reader, 'family')
  const ctx = await cores(reader, out)
  if (ctx === undefined || ctx.core.topics.get(id)?.kind !== 'person') return out
  const rel = { parents: new Set<string>(), children: new Set<string>(), partners: new Set<string>(), siblings: new Set<string>() }
  for (const r of ctx.core.relations ?? []) {
    if ((r.from !== id && r.to !== id) || r.from === r.to) continue
    const other = r.from === id ? r.to : r.from
    if (r.type === 'parent-of') (r.from === id ? rel.children : rel.parents).add(other)
    else if (r.type === 'partner-of') rel.partners.add(other)
    else if (r.type === 'sibling-of') rel.siblings.add(other)
  }
  // A relation's verses are in the books both people are in: only those parts are read
  const booksOf = (p: string): string[] => [...(ctx.core.occurrences.get(p)?.keys() ?? [])]
  const own = new Set(booksOf(id))
  const books = new Set<string>()
  for (const other of [...rel.parents, ...rel.children, ...rel.partners, ...rel.siblings]) for (const b of booksOf(other)) if (own.has(b)) books.add(b)
  const parts = await partsOf(reader, books)
  for (const b of books) if (!parts.has(b)) missingUnit(out, { unit: 'xtopics', book: b, bytes: 0, what: 'part' })
  const versesOf = (p: string): number[] => booksOf(p).flatMap((b) => (books.has(b) ? (parts.get(b)?.occurrences.get(p) ?? []) : []))
  const mine = versesOf(id)
  const myParents = ctx.parentsOf.get(id) ?? new Set<string>()
  const relatives = (ids: Set<string>, sibling = false): Relative[] =>
    ordered(
      [...ids].map((other) => {
        const r: Relative = { ...ref(ctx, other), verses: kinVerses(mine, versesOf(other)) }
        if (sibling) {
          const theirs = ctx.parentsOf.get(other) ?? new Set<string>()
          if (myParents.size === 2 && theirs.size === 2 && [...myParents].filter((p) => theirs.has(p)).length === 1) r.half = true
        }
        return r
      }),
    )
  // TIPNR gives the relations; ACAI the gender, a tW link or the names in the language, when the packs have them
  const sources = [TIPNR_SOURCE]
  if (ctx.core.res.some(([key]) => key === ACAI_SOURCE) || ctx.people !== undefined) sources.push(ACAI_SOURCE)
  out.data = {
    ...ref(ctx, id),
    parents: relatives(rel.parents),
    children: relatives(rel.children),
    partners: relatives(rel.partners),
    siblings: relatives(rel.siblings, true),
    tw: ctx.tw.get(id) ?? [],
    verses: countOf(ctx.core, id),
    sources,
  }
  for (const key of sources) {
    const release = releaseOf(ctx.core.res, key) || releaseOf(ctx.topics?.res, key)
    if (release !== '') out.cites.push({ res: key, release })
  }
  return out
}

/**
 * Every person of `xtopics` with the names a client may find it by (`ids.md`, "Names of people"): its name in the language first, then its
 * aliases (`people.aliases`), the first `map` name of each `tw:names/` article joined to it, its English title, and its first name in the
 * language's `topics`; each once, as stored (the pack does not fold: the client folds). Reads the cores only. `data: null` when `xtopics` is
 * not installed. A client that searches by name builds its index from this once per reader.
 */
export async function peopleQuery(reader: PackReader): Promise<Answer<PersonEntry[] | null>> {
  const out = newAnswer<PersonEntry[] | null>(reader, 'people')
  const ctx = await cores(reader, out)
  if (ctx === undefined) return out
  const aliasesOf = new Map<string, string[]>()
  for (const [name, ids] of Object.entries(ctx.people?.aliases ?? {})) {
    for (const pid of ids) {
      const list = aliasesOf.get(pid)
      if (list === undefined) aliasesOf.set(pid, [name])
      else list.push(name)
    }
  }
  const list: PersonEntry[] = []
  for (const [pid, t] of ctx.core.topics) {
    if (t.kind !== 'person' || !pid.startsWith('per:')) continue
    const r = ref(ctx, pid)
    const names = [r.name, ...(aliasesOf.get(pid) ?? []), ...(ctx.tw.get(pid) ?? []).map((c) => ctx.mapNames[c]?.[0] ?? ''), t.title, ctx.topics?.names[pid]?.[0]?.[0] ?? '']
    list.push({ ...r, names: [...new Set(names.filter((n) => n !== ''))], verses: countOf(ctx.core, pid) })
  }
  out.data = list
  return out
}
