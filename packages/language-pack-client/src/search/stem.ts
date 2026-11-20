import Spanish from './snowball/spanish-stemmer.js'
import Portuguese from './snowball/portuguese-stemmer.js'
import English from './snowball/english-stemmer.js'
import { fold } from '../query/lookup'

/** 'es-419' -> 'es', 'pt-BR' -> 'pt', 'EN' -> 'en'. */
export const baseLang = (tag: string): string => tag.split(/[-_]/)[0]!.toLowerCase()

const factories: Record<string, () => (word: string) => string> = {
  es: () => { const s = new Spanish(); return (w) => s.stemWord(w) },
  pt: () => { const s = new Portuguese(); return (w) => s.stemWord(w) },
  en: () => { const s = new English(); return (w) => s.stemWord(w) },
}
const cache = new Map<string, (word: string) => string>()

export function stemmerFor(tag: string): ((word: string) => string) | undefined {
  const b = baseLang(tag)
  if (!Object.prototype.hasOwnProperty.call(factories, b)) return undefined
  let s = cache.get(b)
  if (!s) { s = factories[b]!(); cache.set(b, s) }
  return s
}

/** Lower-cases and NFC-normalizes, stems as written, then folds the stem. Without a stemmer: the folded word. */
export function stemWord(tag: string, word: string): string {
  const s = stemmerFor(tag)
  if (!s) return fold(word)
  return fold(s(word.normalize('NFC').toLowerCase().trim()))
}

/** Stem as written plus stem of the folded word (for people who type without accents). Unique values. */
export function stemForms(tag: string, word: string): string[] {
  const a = stemWord(tag, word)
  const s = stemmerFor(tag)
  if (!s) return [a]
  const b = s(fold(word))
  return a === b ? [a] : [a, b]
}
