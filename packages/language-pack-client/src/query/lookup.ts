/**
 * `lookup`: the ids of key terms, Academy articles, people, places and events whose name contains a word, so a reader can type
 * "gracia", "grace", "metaphor" or "Pablo" instead of `tw:kt/grace`. It reads the maps only, so it works with no book installed.
 * No Node module here.
 */
import type { MapSet } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, newAnswer, usedUnit } from './envelope'

export type LookupMatch = { id: string; names: string[]; exact: boolean }
export type LookupData = { name: string; matches: LookupMatch[] }

/** Lowercase, without accents: "Metáfora" and "metafora" are the same word. */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

const STOP = `a an the to of in on at for and or is are do does how what which who i we my our
can could should would be it this that with about from as by
es son lo su sus hay sobre entre este esta esto cual cuales quien
ce est qu ne pas sur dans par avec cette
e é sao ser sobre com este esta isso qual
itu ini adalah ada tentang pada
a de la el los las un una unos unas y o en que del al por para con se mi como qué cómo cuál
le la les un une des de du et ou en à au aux pour que qui comment
o os as um uma de do da dos das e ou em no na para que como
di ke dari dan yang untuk dengan bagaimana apa
في من إلى على و عن ما كيف
का की के में है और से को कैसे क्या`
const WORD = /[^\p{L}\p{N}]+/u
const wordsOf = (s: string): string[] => s.split(WORD).filter((w) => w !== '')
const stopwords = new Set(wordsOf(fold(STOP)))

/**
 * Every name the maps know for each id, the language's first: the names of the language map (titles of the articles in
 * this language), the subtitle of an Academy article (its question), the language's names of topics, the common title of
 * a topic, and the last part of an article id as words (`tw:kt/grace` is "grace", `ta:translate/figs-metaphor` is
 * "figs metaphor"). `subs` holds the names that are subtitles: they rank below the other names.
 */
function namesById(m: MapSet): Map<string, { names: string[]; subs: Set<string> }> {
  const out = new Map<string, { names: string[]; subs: Set<string> }>()
  const add = (id: string, name: string | undefined, sub = false): void => {
    if (name === undefined || name.trim() === '') return
    const e = out.get(id) ?? { names: [], subs: new Set<string>() }
    if (!e.names.includes(name)) {
      e.names.push(name)
      if (sub) e.subs.add(name)
    }
    out.set(id, e)
  }
  const core = m.map?.core as { names?: Record<string, string[]>; subtitles?: Record<string, unknown> } | undefined
  for (const [id, names] of Object.entries(core?.names ?? {})) for (const n of names) add(id, n)
  // A subtitle is only ever a later name: an id with no title in the map names gets none.
  for (const [id, sub] of Object.entries(core?.subtitles ?? {})) if (id.startsWith('ta:') && typeof sub === 'string' && out.has(id)) add(id, sub, true)
  const topics = m.topics?.core as { names?: Record<string, unknown[][]> } | undefined
  for (const [id, names] of Object.entries(topics?.names ?? {})) for (const n of names) add(id, typeof n[0] === 'string' ? n[0] : undefined)
  const xtopics = m.xtopics?.core as { topics?: Map<string, { title?: string }> } | undefined
  for (const [id, t] of xtopics?.topics ?? []) add(id, t.title)
  const xmap = m.xmap?.core as { concepts?: Map<string, unknown> } | undefined
  for (const id of xmap?.concepts?.keys() ?? []) if (id.startsWith('tw:') || id.startsWith('ta:')) add(id, id.slice(id.lastIndexOf('/') + 1).replace(/-/g, ' '))
  return out
}

/**
 * The ids whose names contain `name`, at most `limit`: first those with a name equal to it, then those with a name that
 * starts with it or has it as a whole word, then the rest; ids in code-point order within each. Accents and capitals do
 * not count. A query of two or more words also matches a name that has every word, in any order, as a word or the start
 * of one (score 2), ignoring function words ("how", "a", "de"; "fe y gracia" looks for "fe" and "gracia"). A match found
 * only in a subtitle scores 3 and is never exact.
 */
export function lookupMatches(m: MapSet, name: string, limit = 15): LookupMatch[] {
  const q = fold(name)
  if (q === '') return []
  const qw = wordsOf(q)
  const keep = qw.length >= 2 ? qw.filter((w) => !stopwords.has(w)) : []
  const hit = (f: string): number => {
    if (f === q) return 0
    if (f.startsWith(q) || f.split(/\s+/).includes(q)) return 1
    if (f.includes(q)) return 2
    if (keep.length > 0) {
      const parts = wordsOf(f)
      if (keep.every((w) => parts.some((p) => p.startsWith(w)))) return 2
    }
    return 4
  }
  const scored: { id: string; names: string[]; score: number }[] = []
  for (const [id, { names, subs }] of namesById(m)) {
    let score = 4
    for (const n of names) {
      const h = hit(fold(n))
      score = Math.min(score, subs.has(n) && h < 4 ? 3 : h)
    }
    if (score < 4) scored.push({ id, names, score })
  }
  scored.sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return scored.slice(0, limit).map(({ id, names, score }) => ({ id, names, exact: score === 0 }))
}

export async function lookupQuery(reader: PackReader, name: string, limit?: number): Promise<Answer<LookupData>> {
  if (typeof name !== 'string' || fold(name) === '') throw new ClientError('E_ARG', 'lookup needs a word')
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new ClientError('E_ARG', 'lookup limit must be a positive integer')
  const out = newAnswer<LookupData>(reader, 'lookup')
  const m = await reader.maps()
  for (const unit of ['xmap', 'map', 'xtopics', 'topics'] as const) if (m[unit] !== undefined) usedUnit(out, reader, unit)
  out.data = { name, matches: lookupMatches(m, name, limit) }
  return out
}
