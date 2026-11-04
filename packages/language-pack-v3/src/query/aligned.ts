/**
 * Lookups in the index of aligned phrases (`spec/cddl/aligned.cddl`; the answer is in `spec/tests/queries/README.md`, kind `phrase`).
 * The part a phrase is in is the one the CATALOG says: the `aligned:` unit whose range holds the key, else `aligned:other`. The parts
 * are optional units, so a part that is not in the catalog or not installed is `installed: false`, never "not found". Imports the
 * reader of the segment and no Node module.
 */
import type { AlignedModel } from '../model'
import { inRange } from '../read/aligned'

/** The index of one language as the caller has it: the groups of its `aligned:` units, and the parts installed (read) by group. */
export type AlignedSet = {
  lang: string
  /** The groups of the `aligned:` units of the catalog of `lang` (`a-and ha`, `other`), installed or not. */
  groups: string[]
  /** The parts that are installed. */
  parts: Map<string, AlignedModel>
}

/** The key of a phrase as the builder writes it: NFC, then lowercase for the language. */
export const alignedKey = (lang: string, text: string): string => text.normalize('NFC').toLocaleLowerCase(lang)

/** The group of the catalog that holds `key`: the range that holds it, else `other`. */
export function groupOfKey(groups: readonly string[], key: string): string {
  for (const group of groups) if (group !== 'other' && inRange(group, key)) return group
  return 'other'
}

/**
 * `{kind, lang, text, installed, found, strongs}`. `strongs` maps each Strong key of the entry to `{books, verses, occurrences}`: the
 * number of books, the verses (distinct, per book) and the occurrences, summed over the books. `installed` is false (and nothing
 * else follows) when the language is not the set's, or the part of the key is not in the catalog or not installed.
 */
export function phrase(set: AlignedSet, lang: string, text: string): unknown {
  const key = alignedKey(lang, text)
  const group = groupOfKey(set.groups, key)
  const part = set.lang === lang && set.groups.includes(group) ? set.parts.get(group) : undefined
  if (part === undefined) return { kind: 'phrase', lang, text, installed: false }
  const entry = part.entries.get(key)
  const strongs: Record<string, { books: number; verses: number; occurrences: number }> = {}
  if (entry !== undefined) {
    for (const [strong, byBook] of entry) {
      let verses = 0
      let occurrences = 0
      for (const [v, o] of byBook.values()) {
        verses += v
        occurrences += o
      }
      strongs[strong] = { books: byBook.size, verses, occurrences }
    }
  }
  return { kind: 'phrase', lang, text, installed: true, found: entry !== undefined, strongs }
}
