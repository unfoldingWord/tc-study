/** The content words of a question: what search should look for, with the language's stop words, frame words and fixed phrases removed. */
import { baseLang } from '@bt-synergy/language-pack-client'
import { fold } from './fold'
import { FRAME, STOP } from './lexicon'
import { matchPhrases, phrasesFor } from './phrases'

/** The folded content words of `text`, in order and without repeats. A text that is all stop or frame words has no content words. */
export function contentWords(text: string, tag: string): string[] {
  const base = baseLang(tag)
  const stop = STOP[base] ?? new Set<string>()
  const frame = FRAME[base] ?? new Set<string>()
  const tokens = fold(text).split(' ').filter((t) => t !== '')
  const inPhrase = new Set<number>()
  for (const m of matchPhrases(tokens, phrasesFor(tag))) for (let i = m.start; i < m.end; i++) inPhrase.add(i)
  const out: string[] = []
  tokens.forEach((t, i) => {
    if (inPhrase.has(i) || stop.has(t) || frame.has(t) || (t.length < 2 && !/\d/.test(t)) || out.includes(t)) return
    out.push(t)
  })
  return out
}
