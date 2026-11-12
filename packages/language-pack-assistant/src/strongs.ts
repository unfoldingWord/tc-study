/**
 * The Strong keys of a concept, for "how was <concept> translated": the reader's `renderings` takes a Strong key, not a concept.
 * The keys are the xmap's `strongs` list for the concept, without the catch-all keys (R10b) and ranked by use and specificity (R10d).
 */
import type { PackReader } from '@bt-synergy/language-pack-client'
import type { MapSet } from '@bt-synergy/language-pack-v3'

type XmapCore = NonNullable<MapSet['xmap']>['core']

/**
 * A sync lookup over one xmap core. A key listed by more than 2 % of the tW concepts (`G35880`, `H0853`) says nothing of one concept
 * and is dropped; the rest are ranked by `log1p(occurrences) / conceptsListing` descending (occurrences: the sum of the `strong`
 * counts over the books; conceptsListing: how many tW concepts list the key), ties in code-point order. Empty when none is left or
 * there is no core. Callers take the first 3.
 */
export function strongsIndex(core: XmapCore | undefined): (conceptId: string) => string[] {
  const lists = Object.entries(core?.strongs ?? {}).filter(([id]) => id.startsWith('tw:'))
  const concepts = new Map<string, number>()
  for (const [, keys] of lists) for (const k of new Set(keys)) concepts.set(k, (concepts.get(k) ?? 0) + 1)
  const drop = new Set([...concepts].filter(([, n]) => n > lists.length * 0.02).map(([k]) => k))
  const total = (k: string): number => [...(core?.strong.rows.get(k)?.values() ?? [])].reduce((n, [c]) => n + c, 0)
  const score = (k: string): number => Math.log1p(total(k)) / Math.max(1, concepts.get(k) ?? 1)
  const cache = new Map<string, string[]>()
  return (conceptId) => {
    let out = cache.get(conceptId)
    if (out === undefined) {
      const keys = [...new Set(core?.strongs?.[conceptId] ?? [])].filter((k) => !drop.has(k))
      out = keys.sort((x, y) => score(y) - score(x) || (x < y ? -1 : x > y ? 1 : 0))
      cache.set(conceptId, out)
    }
    return [...out]
  }
}

const indexes = new WeakMap<PackReader, Promise<(conceptId: string) => string[]>>()

/** The index of a reader's xmap core, built once per reader (the xmap is read core only). */
export function strongsIndexOf(reader: PackReader): Promise<(conceptId: string) => string[]> {
  let found = indexes.get(reader)
  if (found === undefined) {
    found = reader.mapsOf(['xmap'], { coreOnly: true }).then((m) => strongsIndex(m.xmap?.core))
    indexes.set(reader, found)
  }
  return found
}

/** The ranked Strong keys of a concept in a reader's xmap; empty when none is left or the xmap is not installed. */
export async function strongsOf(reader: PackReader, conceptId: string): Promise<string[]> {
  return (await strongsIndexOf(reader))(conceptId)
}
