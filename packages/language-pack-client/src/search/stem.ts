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

/** Folds (NFD, no marks, lower case), then stems when a stemmer exists. */
export function stemWord(tag: string, word: string): string {
  const f = fold(word)
  const s = stemmerFor(tag)
  return s ? s(f) : f
}
