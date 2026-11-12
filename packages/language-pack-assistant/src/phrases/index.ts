/**
 * The fixed phrases of each base language: folded keyword phrases that say which query a question asks for, matched on word
 * boundaries of the folded question. They start from C0's `KW` and `SEARCH_KW` (`cadena.py`); `context` phrases ask for everything
 * about a passage. A language without a file gets no phrases: the chain then runs on entities, the classifier and search.
 */
import { baseLang } from '@bt-synergy/language-pack-client'
import { fold } from '../fold'
import en from './en.json'
import es from './es.json'
import pt from './pt.json'

export type PhraseKind = 'passage' | 'concept' | 'article' | 'renderings' | 'books' | 'topics' | 'context' | 'search'
export type Phrases = Record<PhraseKind, string[]>

const KINDS: PhraseKind[] = ['passage', 'concept', 'article', 'renderings', 'books', 'topics', 'context', 'search']

export const EMPTY_PHRASES: Phrases = Object.fromEntries(KINDS.map((k) => [k, []])) as unknown as Phrases

const BY_LANG: Record<string, Phrases> = { es, pt, en }

/** The phrases of a language tag's base (`es-419` gives `es`); empty lists for any other base. */
export function phrasesFor(tag: string): Phrases {
  return BY_LANG[baseLang(tag)] ?? EMPTY_PHRASES
}

export type PhraseMatch = { kind: PhraseKind; start: number; end: number }

/**
 * The fixed phrases a question holds, by token span. A phrase inside a longer phrase of another kind is not counted: the longer one
 * says what is asked ("where does it say" is a search, not "where does" of books).
 */
export function matchPhrases(tokens: string[], phrases: Phrases): PhraseMatch[] {
  const all: PhraseMatch[] = []
  for (const kind of KINDS) {
    for (const p of phrases[kind] ?? []) {
      const w = fold(p).split(' ').filter((x) => x !== '')
      if (w.length === 0) continue
      for (let i = 0; i + w.length <= tokens.length; i++) if (w.every((x, k) => tokens[i + k] === x)) all.push({ kind, start: i, end: i + w.length })
    }
  }
  return all.filter((m) => !all.some((o) => o.kind !== m.kind && o.end - o.start > m.end - m.start && o.start <= m.start && m.end <= o.end))
}

/** Whether the folded tokens hold one of the phrases, word for word. */
export function hasPhrase(tokens: string[], list: readonly string[]): boolean {
  const text = ` ${tokens.join(' ')} `
  return list.some((p) => {
    const f = fold(p)
    return f !== '' && text.includes(` ${f} `)
  })
}
