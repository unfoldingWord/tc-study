/**
 * `lookup`: the ids of key terms, Academy articles, people, places and events whose name contains a word, so a reader can type
 * "gracia", "grace", "metaphor" or "Pablo" instead of `tw:kt/grace`. It reads the maps only, so it works with no book installed.
 * No Node module here.
 */
import type { MapSet } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, newAnswer, usedUnit } from './envelope'

/** `subtitle` is the question of an Academy article: it matches, but it is not a name. */
export type LookupMatch = { id: string; names: string[]; subtitle?: string; exact: boolean }
export type LookupData = { name: string; matches: LookupMatch[] }

/** Lowercase, without accents: "Metáfora" and "metafora" are the same word. */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC').toLowerCase().trim()

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
const WORD = /[^\p{L}\p{N}\p{M}]+/u
const wordsOf = (s: string): string[] => s.split(WORD).filter((w) => w !== '')
const stopwords = new Set(wordsOf(fold(STOP)))

type Entry = { id: string; names: string[]; subtitle?: string; forms: { f: string; words: string[]; sub: boolean }[] }
type Cores = [unknown, unknown, unknown, unknown]
const cache = new WeakMap<object, { cores: Cores; list: Entry[] }>()
const NONE = {}
/** @internal How many times the entries were built (for tests: a second lookup on the same maps must not build again). */
export const lookupStats = { builds: 0 }

/**
 * Every name the maps know for each id, the language's first: the names of the language map (titles of the articles in
 * this language), the language's names of topics, the common title of a topic, and the last part of an article id as words
 * (`tw:kt/grace` is "grace", `ta:translate/figs-metaphor` is "figs metaphor"). The subtitle of an Academy article (its
 * question) is kept apart: it matches, but is not a name. The result is cached per map object, with the folded names.
 */
function namesById(m: MapSet): Entry[] {
  // `reader.maps()` makes a new MapSet each call; only the cores inside are stable, so they are the key.
  const cores: Cores = [m.map?.core, m.topics?.core, m.xtopics?.core, m.xmap?.core]
  const key = (cores.find((c) => c !== undefined) ?? NONE) as object
  const hit = cache.get(key)
  if (hit !== undefined && hit.cores.every((c, i) => c === cores[i])) return hit.list
  lookupStats.builds++
  const out = new Map<string, { names: string[]; subtitle?: string }>()
  const add = (id: string, name: string | undefined): void => {
    if (name === undefined || name.trim() === '') return
    const e = out.get(id) ?? { names: [] }
    if (!e.names.includes(name)) e.names.push(name)
    out.set(id, e)
  }
  const core = m.map?.core as { names?: Record<string, string[]>; subtitles?: Record<string, unknown> } | undefined
  for (const [id, names] of Object.entries(core?.names ?? {})) for (const n of names) add(id, n)
  // A subtitle only goes with an id that has a title in the map names.
  for (const [id, sub] of Object.entries(core?.subtitles ?? {})) {
    const e = out.get(id)
    if (id.startsWith('ta:') && typeof sub === 'string' && sub.trim() !== '' && e !== undefined) e.subtitle = sub
  }
  const topics = m.topics?.core as { names?: Record<string, unknown[][]> } | undefined
  for (const [id, names] of Object.entries(topics?.names ?? {})) for (const n of names) add(id, typeof n[0] === 'string' ? n[0] : undefined)
  const xtopics = m.xtopics?.core as { topics?: Map<string, { title?: string }> } | undefined
  for (const [id, t] of xtopics?.topics ?? []) add(id, t.title)
  const xmap = m.xmap?.core as { concepts?: Map<string, unknown> } | undefined
  for (const id of xmap?.concepts?.keys() ?? []) if (id.startsWith('tw:') || id.startsWith('ta:')) add(id, id.slice(id.lastIndexOf('/') + 1).replace(/-/g, ' '))
  const list: Entry[] = []
  for (const [id, { names, subtitle }] of out) {
    const form = (n: string, sub: boolean) => {
      const words = wordsOf(fold(n))
      return { f: words.join(' '), words, sub }
    }
    const forms = names.map((n) => form(n, false))
    if (subtitle !== undefined) forms.push(form(subtitle, true))
    list.push({ id, names, ...(subtitle !== undefined ? { subtitle } : {}), forms })
  }
  cache.set(key, { cores, list })
  return list
}

/**
 * The ids whose names contain `name`, at most `limit`: first those with a name equal to it, then those with a name that
 * starts with it or has it as a whole word, then the rest; ids in code-point order within each. Accents, capitals and
 * punctuation do not count (the query and the names are compared as their words). A query with function words ("how",
 * "a", "de") or leftover single letters ("what's" gives "what" and "s") also matches a name that has every other word, in
 * any order, as a word or the start of one (score 2). A match found only in a subtitle scores 3 and is never exact; the
 * subtitle is returned in `subtitle`, not in `names`.
 */
export function lookupMatches(m: MapSet, name: string, limit = 15): LookupMatch[] {
  const qw = wordsOf(fold(name))
  const q = qw.join(' ')
  if (q === '') return []
  const keep = qw.length >= 2 ? qw.filter((w) => !stopwords.has(w) && [...w].length > 1) : []
  const hit = (f: string, words: string[]): number => {
    if (f === q) return 0
    if (f.startsWith(q) || words.includes(q)) return 1
    if (f.includes(q)) return 2
    if (keep.length > 0 && keep.every((w) => words.some((p) => p.startsWith(w)))) return 2
    return 4
  }
  const scored: { e: Entry; score: number }[] = []
  for (const e of namesById(m)) {
    let score = 4
    for (const { f, words, sub } of e.forms) {
      const h = hit(f, words)
      score = Math.min(score, sub && h < 4 ? 3 : h)
    }
    if (score < 4) scored.push({ e, score })
  }
  scored.sort((a, b) => a.score - b.score || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0))
  return scored.slice(0, limit).map(({ e, score }) => ({ id: e.id, names: [...e.names], ...(e.subtitle !== undefined ? { subtitle: e.subtitle } : {}), exact: score === 0 }))
}

export async function lookupQuery(reader: PackReader, name: string, limit?: number): Promise<Answer<LookupData>> {
  if (typeof name !== 'string' || wordsOf(fold(name)).length === 0) throw new ClientError('E_ARG', 'lookup needs a word')
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new ClientError('E_ARG', 'lookup limit must be a positive integer')
  const out = newAnswer<LookupData>(reader, 'lookup')
  const m = await reader.maps()
  for (const unit of ['xmap', 'map', 'xtopics', 'topics'] as const) if (m[unit] !== undefined) usedUnit(out, reader, unit)
  out.data = { name, matches: lookupMatches(m, name, limit) }
  return out
}
