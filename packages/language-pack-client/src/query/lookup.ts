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

/**
 * Every name the maps know for each id, the language's first: the names of the language map (titles of the articles in this
 * language), the language's names of topics, the common title of a topic, and the last part of an article id as words
 * (`tw:kt/grace` is "grace", `ta:translate/figs-metaphor` is "figs metaphor").
 */
function namesById(m: MapSet): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const add = (id: string, name: string | undefined): void => {
    if (name === undefined || name.trim() === '') return
    const list = out.get(id) ?? []
    if (!list.includes(name)) list.push(name)
    out.set(id, list)
  }
  const core = m.map?.core as { names?: Record<string, string[]> } | undefined
  for (const [id, names] of Object.entries(core?.names ?? {})) for (const n of names) add(id, n)
  const topics = m.topics?.core as { names?: Record<string, unknown[][]> } | undefined
  for (const [id, names] of Object.entries(topics?.names ?? {})) for (const n of names) add(id, typeof n[0] === 'string' ? n[0] : undefined)
  const xtopics = m.xtopics?.core as { topics?: Map<string, { title?: string }> } | undefined
  for (const [id, t] of xtopics?.topics ?? []) add(id, t.title)
  const xmap = m.xmap?.core as { concepts?: Map<string, unknown> } | undefined
  for (const id of xmap?.concepts?.keys() ?? []) if (id.startsWith('tw:') || id.startsWith('ta:')) add(id, id.slice(id.lastIndexOf('/') + 1).replace(/-/g, ' '))
  return out
}

/**
 * The ids whose names contain `name`, at most `limit`: first those with a name equal to it, then those with a name that starts
 * with it or has it as a whole word, then the rest; ids in code-point order within each. Accents and capitals do not count.
 */
export function lookupMatches(m: MapSet, name: string, limit = 15): LookupMatch[] {
  const q = fold(name)
  if (q === '') return []
  const scored: { id: string; names: string[]; score: number }[] = []
  for (const [id, names] of namesById(m)) {
    let score = 3
    for (const n of names) {
      const f = fold(n)
      if (f === q) score = 0
      else if (f.startsWith(q) || f.split(/\s+/).includes(q)) score = Math.min(score, 1)
      else if (f.includes(q)) score = Math.min(score, 2)
    }
    if (score < 3) scored.push({ id, names, score })
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
