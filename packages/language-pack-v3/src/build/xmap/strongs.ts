import { compareCodePoints } from '../../codec/columns'
import { strongKey } from '../../ids'
import type { HelpTable, OrigModel } from '../../model'

/**
 * Adds to `into`, for each link row with a `tw:` concept, the Strong keys of the original words its quote points to.
 * Positions `-1` (a word the original lacks) and words without a Strong number are skipped.
 */
export function strongsOfLinks(links: HelpTable, orig: OrigModel, into: Map<string, Set<string>>): void {
  for (const row of links.rows) {
    const concept = row.concept
    if (concept === undefined || !concept.startsWith('tw:') || row.quote === undefined) continue
    for (const position of row.quote) {
      if (position < 0) continue
      const strong = orig.words[position]?.strong
      if (strong === undefined || strong === '') continue
      let set = into.get(concept)
      if (set === undefined) into.set(concept, (set = new Set()))
      set.add(strongKey(strong))
    }
  }
}

/** The `strongs` table of the xmap: keys and values sorted by code point, concepts with no key left out. */
export function strongsRecord(m: Map<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const concept of [...m.keys()].sort(compareCodePoints)) {
    const set = m.get(concept)
    if (set === undefined || set.size === 0) continue
    out[concept] = [...set].sort(compareCodePoints)
  }
  return out
}
