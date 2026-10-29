/**
 * The word index of one book of an original (UGNT, UHB): every `w` node of the book gets a number, from 0, in document
 * order, chapter 1 and up (chapter 0, the headings, is not numbered); each Strong code gets the sorted list of the
 * words that carry it. Pure: the caller reads the chapters and writes the rows.
 *
 * Rows (`@bt-synergy/language-pack` keys and word lists):
 *   index:verses:{original}:{book}         { v, stamp, words, verses: "1:1 1:2 …", starts: <list of first words> }
 *   index:strong:{original}:{code}:{book}  { v, stamp, lemma, words: <list> }
 */

import { encodeWords, indexStrongKey, indexVersesKey, strongCodesOf } from '@bt-synergy/language-pack'

/** Bump when the rows change: a reader ignores index rows of another version. */
export const HELPS_INDEX_VERSION = 1

export type BookIndexVerses = { v: number; stamp: string; words: number; verses: string; starts: string }
export type BookIndexStrong = { v: number; stamp: string; lemma: string; words: string }

type UsjNode = { type?: unknown; marker?: unknown; number?: unknown; strong?: unknown; lemma?: unknown; content?: unknown }

/** The nodes of a chapter: a whole USJ (`{ type: 'USJ', content }`) or its content array. */
function nodesOf(usj: unknown): unknown[] {
  if (Array.isArray(usj)) return usj
  const content = (usj as { content?: unknown } | null)?.content
  return Array.isArray(content) ? content : []
}

/** The verses row first, then one row per Strong code sorted by key. `stamp`: `bookContentStamp` of the book. */
export function buildBookIndex(
  originalKey: string,
  book: string,
  chapters: Iterable<{ chapter: number; usj: unknown }>,
  stamp: string
): Array<{ key: string; value: BookIndexVerses | BookIndexStrong }> {
  let next = 0
  const verses: string[] = []
  const starts: number[] = []
  const wordsOf = new Map<string, number[]>()
  // Insertion order is first seen: a tie keeps the earlier lemma.
  const lemmasOf = new Map<string, Map<string, number>>()
  // A verse is listed when its first word comes, so a verse with no words has no entry.
  let pending: string | null = null

  const walk = (nodes: unknown[], chapter: number) => {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      const n = node as UsjNode
      if (n.type === 'verse' || n.marker === 'v') {
        pending = `${chapter}:${String(n.number)}`
      } else if (n.marker === 'w') {
        const word = next++
        if (pending !== null) {
          verses.push(pending)
          starts.push(word)
          pending = null
        }
        const lemma = typeof n.lemma === 'string' ? n.lemma : ''
        for (const code of strongCodesOf(typeof n.strong === 'string' ? n.strong : undefined)) {
          const words = wordsOf.get(code)
          if (words) words.push(word)
          else wordsOf.set(code, [word])
          if (!lemma) continue
          const lemmas = lemmasOf.get(code) ?? new Map<string, number>()
          lemmas.set(lemma, (lemmas.get(lemma) ?? 0) + 1)
          lemmasOf.set(code, lemmas)
        }
      }
      if (Array.isArray(n.content)) walk(n.content, chapter)
    }
  }

  const ordered = [...chapters].filter((ch) => ch.chapter >= 1).sort((a, b) => a.chapter - b.chapter)
  for (const { chapter, usj } of ordered) {
    pending = `${chapter}:0`
    walk(nodesOf(usj), chapter)
  }

  const lemmaOf = (code: string): string => {
    let best = ''
    let most = 0
    for (const [lemma, count] of lemmasOf.get(code) ?? []) {
      if (count > most) {
        best = lemma
        most = count
      }
    }
    return best
  }

  const strongRows = [...wordsOf].map(([code, words]) => ({
    key: indexStrongKey(originalKey, code, book),
    value: { v: HELPS_INDEX_VERSION, stamp, lemma: lemmaOf(code), words: encodeWords(words) } satisfies BookIndexStrong,
  }))
  strongRows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  return [
    {
      key: indexVersesKey(originalKey, book),
      value: { v: HELPS_INDEX_VERSION, stamp, words: next, verses: verses.join(' '), starts: encodeWords(starts) } satisfies BookIndexVerses,
    },
    ...strongRows,
  ]
}
