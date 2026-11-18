/**
 * ACAI, the people of BibleAquifer/ACAI (`spec/fuentes.md`), as the builder reads it: the gender, the names in the six languages of
 * BT Servant Mini, the alias records and the titles of the uW Translation Words articles ACAI names. Nothing else of ACAI is read
 * (`ids.md`, "People of ACAI"): not its word lists, its references (ORG versification), its roles, tribes or places, and not its
 * relations (TIPNR gives them).
 *
 * Two steps. {@link trimAcai} turns the files of `people/json/` at the pinned commit into one small JSON text (the fetcher writes it as
 * `acai/people.json`); {@link parseAcai} reads that text back for the builder. No Node module is used.
 */
import { compareCodePoints } from '../codec/columns'

/** The ACAI language code of each pack language that ACAI names (the six of Mini). Any other pack language has no ACAI names. */
export const ACAI_LANGS: Readonly<Record<string, string>> = { en: 'eng', 'es-419': 'spa', fr: 'fra', id: 'ind', hi: 'hin', ar: 'arb' }

/** The ACAI key and its pinned release (`spec/fuentes.md`). */
export const ACAI_SOURCE = { key: 'BibleAquifer/ACAI', release: '5375d0d3', commit: '5375d0d334bb6d635ef1813e4d3df58eb30efcca' } as const

/**
 * One person record of ACAI, trimmed. `id` and `primary` are ACAI's own ids (`person:Isaac`); a record whose `primary` is another id is
 * an alias record (another name of that person). `tipnr`: the TIPNR unique names ACAI gives (`Isaac@Gen.17.19-Jas`). `tw`: the titles of
 * the uW Translation Words articles ACAI names (`26734|Isaac|UWTranslationWords` gives `Isaac`). `gender`: 1 man, 2 woman, 0 none.
 * `labels`: the preferred label per ACAI language code, in NFC, as ACAI writes it (`Jacob (padre de José)`).
 */
export type AcaiPerson = { id: string; primary: string; tipnr: string[]; tw: string[]; gender: 0 | 1 | 2; labels: Record<string, string> }

const GENDER: Record<string, 1 | 2> = { male: 1, female: 2 }
const KEEP_LANGS = new Set(Object.values(ACAI_LANGS))

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const nfc = (s: string): string => s.normalize('NFC').trim()

/** One ACAI file's record (an object, or a list whose first item is the record), trimmed; `undefined` when it is not a person record. */
function trimOne(json: unknown): AcaiPerson | undefined {
  const d = Array.isArray(json) ? json[0] : json
  if (!isRecord(d) || typeof d.id !== 'string' || !d.id.startsWith('person:')) return undefined
  const alt = isRecord(d.alternate_sources) ? d.alternate_sources : {}
  const tw = strings(alt.aquifer)
    .map((a) => a.split('|'))
    .filter((p) => p.length === 3 && p[2] === 'UWTranslationWords' && p[1].trim() !== '')
    .map((p) => nfc(p[1]))
  const labels: Record<string, string> = {}
  const loc = isRecord(d.localizations) ? d.localizations : {}
  for (const code of [...KEEP_LANGS].sort(compareCodePoints)) {
    const l = loc[code]
    if (isRecord(l) && typeof l.preferred_label === 'string' && nfc(l.preferred_label) !== '') labels[code] = nfc(l.preferred_label)
  }
  return {
    id: d.id,
    primary: typeof d.primary_id === 'string' && d.primary_id !== '' ? d.primary_id : d.id,
    tipnr: [...new Set(strings(alt.tipnr).map((t) => t.trim()))].sort(compareCodePoints),
    tw: [...new Set(tw)].sort(compareCodePoints),
    gender: typeof d.gender === 'string' ? (GENDER[d.gender] ?? 0) : 0,
    labels,
  }
}

/**
 * The trimmed text of the ACAI people: the files of `people/json/` (path to text), each read as JSON. A file that is not JSON or not a
 * person record goes to `issues` and is left out. Records sorted by id; the same files give the same text.
 */
export function trimAcai(files: Map<string, string>, commit: string, issues: string[]): string {
  const people: AcaiPerson[] = []
  const seen = new Set<string>()
  for (const path of [...files.keys()].sort(compareCodePoints)) {
    let json: unknown
    try {
      json = JSON.parse(files.get(path)!)
    } catch {
      issues.push(`acai: ${path} is not JSON: left out`)
      continue
    }
    const p = trimOne(json)
    if (p === undefined) issues.push(`acai: ${path} is not a person record: left out`)
    else if (seen.has(p.id)) issues.push(`acai: ${path}: ${p.id} is twice: the second is left out`)
    else {
      seen.add(p.id)
      people.push(p)
    }
  }
  people.sort((a, b) => compareCodePoints(a.id, b.id))
  return `${JSON.stringify({ source: ACAI_SOURCE.key, commit, people })}\n`
}

/** The people of a trimmed ACAI text ({@link trimAcai}). Throws `Error` when the text is not one. */
export function parseAcai(text: string): { commit: string; people: AcaiPerson[] } {
  const d: unknown = JSON.parse(text)
  if (!isRecord(d) || d.source !== ACAI_SOURCE.key || typeof d.commit !== 'string' || !Array.isArray(d.people)) {
    throw new Error('not a trimmed ACAI file (acai/people.json): run fetch-topic-sources again')
  }
  const people = d.people.map((p, i) => {
    if (!isRecord(p) || typeof p.id !== 'string' || typeof p.primary !== 'string' || !isRecord(p.labels) || ![0, 1, 2].includes(p.gender as number)) {
      throw new Error(`acai/people.json: record ${i} is not a trimmed person`)
    }
    const labels: Record<string, string> = {}
    for (const [k, v] of Object.entries(p.labels)) if (typeof v === 'string') labels[k] = v
    return { id: p.id, primary: p.primary, tipnr: strings(p.tipnr), tw: strings(p.tw), gender: p.gender as 0 | 1 | 2, labels }
  })
  return { commit: d.commit, people }
}

/**
 * A label split into the name and its note: `Jacob (padre de José)` is `["Jacob", "padre de José"]`; a label with no closing note in
 * parentheses is the name with note `""`. Only a final `( … )` is a note.
 */
export function splitLabel(label: string): [name: string, note: string] {
  const m = /^(.*\S)\s*\(([^()]*)\)\s*$/u.exec(label)
  return m === null ? [label.trim(), ''] : [m[1].trim(), m[2].trim()]
}

/**
 * ACAI joined to the topics: each person record that names, among its TIPNR unique names, the `ref` of exactly one `per:` topic gets that
 * topic; an alias record (`primary` another id) gets the topic of its primary. A record whose names give no topic, or more than one, is
 * not joined (reported). ACAI never makes or changes an id.
 */
export function joinAcai(
  people: AcaiPerson[],
  perOfRef: Map<string, string>,
  report: string[],
): { byPer: Map<string, AcaiPerson>; aliases: { person: AcaiPerson; per: string }[] } {
  const own = new Map<string, string>()
  let none = 0
  for (const p of people) {
    if (p.primary !== p.id) continue
    const found = [...new Set(p.tipnr.map((t) => perOfRef.get(t)).filter((x): x is string => x !== undefined))]
    if (found.length === 1) own.set(p.id, found[0])
    else if (found.length === 0) none++
    else report.push(`review: acai ${p.id}: its TIPNR names give ${found.length} people (${found.sort(compareCodePoints).join(', ')}): not joined`)
  }
  const byPer = new Map<string, AcaiPerson>()
  for (const p of people) {
    const per = own.get(p.id)
    if (per === undefined) continue
    if (byPer.has(per)) {
      report.push(`review: acai ${p.id} and ${byPer.get(per)!.id} are both ${per}: only the first is used`)
      continue
    }
    byPer.set(per, p)
  }
  const aliases: { person: AcaiPerson; per: string }[] = []
  for (const p of people) {
    if (p.primary === p.id) continue
    const per = own.get(p.primary)
    if (per !== undefined && byPer.get(per)?.id === p.primary) aliases.push({ person: p, per })
  }
  report.push(`acai: ${byPer.size} person records joined to TIPNR, ${none} with no TIPNR person, ${aliases.length} alias records joined`)
  return { byPer, aliases }
}
