/**
 * The names of people in a language (`ids.md`, "Names of people"): the rule a client follows to show a person's name, and the builder
 * of the `people` table of a language's topics core, which stores only what that rule cannot give without it. No Node module is used.
 */
import { compareCodePoints } from '../../codec/columns'
import type { TopicsPeople, XtopicsCore } from '../../model'
import { ACAI_LANGS, type AcaiPerson, joinAcai, splitLabel } from '../../source/acai'

/** Per `per:` id, the `tw:names/` concepts joined to it by a `same-as` of the core, sorted by code point. */
export function twOfPeople(core: Pick<XtopicsCore, 'relations'>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const r of core.relations ?? []) {
    if (r.type !== 'same-as' || !r.from.startsWith('tw:names/') || !r.to.startsWith('per:')) continue
    const list = out.get(r.to)
    if (list === undefined) out.set(r.to, [r.from])
    else if (!list.includes(r.from)) list.push(r.from)
  }
  for (const list of out.values()) list.sort(compareCodePoints)
  return out
}

/**
 * Steps 2 and 3 of the rule: the first name in the language map (`mapNames`, the `names` of the language's `map` core) of the first
 * `tw:names/` concept joined to the person that has one, else the English title of `xtopics`; `""` when there is neither.
 */
export function derivedPersonName(id: string, core: Pick<XtopicsCore, 'topics'>, tw: Map<string, string[]>, mapNames: Record<string, string[]>): string {
  for (const concept of tw.get(id) ?? []) {
    const name = mapNames[concept]?.[0]
    if (name !== undefined && name !== '') return name
  }
  return core.topics.get(id)?.title ?? ''
}

/** The whole rule: `people.names` first, then {@link derivedPersonName}. */
export function personName(
  id: string,
  core: Pick<XtopicsCore, 'topics'>,
  tw: Map<string, string[]>,
  mapNames: Record<string, string[]>,
  people?: Pick<TopicsPeople, 'names'>,
): string {
  const own = people?.names[id]
  return own !== undefined && own !== '' ? own : derivedPersonName(id, core, tw, mapNames)
}

/**
 * The `people` table of language `lang`, from the ACAI people, or `undefined` when ACAI has no name in that language (a language that is
 * not one of {@link ACAI_LANGS}) or nothing is left to store. `mapNames`: the `names` of the language's map core.
 */
export function buildPeople(o: {
  lang: string
  xtopics: Pick<XtopicsCore, 'topics' | 'relations'>
  mapNames: Record<string, string[]>
  acai: AcaiPerson[]
  report: string[]
}): TopicsPeople | undefined {
  const code = ACAI_LANGS[o.lang]
  if (code === undefined) {
    o.report.push(`people: ACAI has no names in ${o.lang}: no people table`)
    return undefined
  }
  const perOfRef = new Map<string, string>()
  for (const [id, t] of o.xtopics.topics) if (t.kind === 'person' && id.startsWith('per:')) perOfRef.set(t.ref, id)
  const joinReport: string[] = []
  const { byPer, aliases } = joinAcai(o.acai, perOfRef, joinReport)
  const tw = twOfPeople(o.xtopics)
  const nfc = (s: string): string => s.normalize('NFC')
  // The map names are NFC as map.cddl stores them; made NFC here too, so both sides are compared byte for byte after NFC
  const mapNames: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(o.mapNames)) mapNames[k] = v.map(nfc)
  o = { ...o, mapNames }

  // names: only where the rule without the table gives another text
  const names: Record<string, string> = {}
  const noteOf = new Map<string, string>()
  for (const [per, p] of byPer) {
    const label = p.labels[code]
    if (label === undefined) continue
    const [name, note] = splitLabel(nfc(label))
    if (name === '') continue
    if (note !== '') noteOf.set(per, note)
    if (name !== derivedPersonName(per, o.xtopics, tw, o.mapNames)) names[per] = name
  }
  const people: TopicsPeople = { names, notes: {}, aliases: {} }
  const nameOf = (per: string): string => personName(per, o.xtopics, tw, o.mapNames, people)

  // aliases: only names a client cannot find another way
  const aliasSets = new Map<string, Set<string>>()
  for (const { person, per } of aliases) {
    const label = person.labels[code]
    if (label === undefined) continue
    const [name] = splitLabel(nfc(label))
    if (name === '') continue
    const known = new Set([nameOf(per), o.xtopics.topics.get(per)?.title ?? '', ...(tw.get(per) ?? []).map((c) => o.mapNames[c]?.[0] ?? '')])
    if (known.has(name)) continue
    let set = aliasSets.get(name)
    if (set === undefined) aliasSets.set(name, (set = new Set()))
    set.add(per)
  }
  for (const name of [...aliasSets.keys()].sort(compareCodePoints)) people.aliases[name] = [...aliasSets.get(name)!].sort(compareCodePoints)

  // notes: only for a person whose name another person can also be found by (its name, an alias, the first map name of a tW
  // article joined to it, or its English title)
  const holders = new Map<string, Set<string>>()
  const hold = (name: string, per: string): void => {
    if (name === '') return
    let set = holders.get(name)
    if (set === undefined) holders.set(name, (set = new Set()))
    set.add(per)
  }
  for (const [id, t] of o.xtopics.topics) {
    if (t.kind !== 'person' || !id.startsWith('per:')) continue
    hold(nameOf(id), id)
    hold(t.title, id)
    for (const c of tw.get(id) ?? []) hold(o.mapNames[c]?.[0] ?? '', id)
  }
  for (const [name, ids] of Object.entries(people.aliases)) for (const id of ids) hold(name, id)
  for (const [per, note] of [...noteOf].sort((a, b) => compareCodePoints(a[0], b[0]))) {
    if ((holders.get(nameOf(per))?.size ?? 0) > 1) people.notes[per] = note
  }
  o.report.push(
    ...joinReport.map((line) => `people: ${line}`),
    `people: ${o.lang}: ${Object.keys(names).length} names, ${Object.keys(people.notes).length} notes, ${Object.keys(people.aliases).length} aliases stored (${byPer.size} people joined)`,
  )
  const empty = Object.keys(names).length + Object.keys(people.notes).length + Object.keys(people.aliases).length === 0
  return empty ? undefined : people
}
