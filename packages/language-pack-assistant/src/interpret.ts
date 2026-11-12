/**
 * The one-line interpretation the app shows for a decision (R4): the first words of the query's label (before the colon) and the
 * arguments, in the base language. A `choose` is a question with a frame per language. Unknown languages use English.
 */
import { baseLang, schemas } from '@bt-synergy/language-pack-client'
import type { Call, Decision } from './decision'

type Frames = {
  open: string
  close: string
  or: string
  quote: [string, string]
  book: string
  person: string
  /** `{list}` is the Strong keys. */
  words: string
  /** `{name}` is the concept's name, `{text}` the quoted search text. */
  conceptOrSearch: string
}

export const FRAMES: Record<string, Frames> = {
  es: { open: '¿', close: '?', or: 'o', quote: ['«', '»'], book: 'el libro', person: 'la persona', words: 'Cuál de estas palabras del original: {list}', conceptOrSearch: 'El artículo sobre {name}, o buscar {text}' },
  pt: { open: '', close: '?', or: 'ou', quote: ['«', '»'], book: 'o livro', person: 'a pessoa', words: 'Qual destas palavras do original: {list}', conceptOrSearch: 'O artigo sobre {name}, ou buscar {text}' },
  en: { open: '', close: '?', or: 'or', quote: ['“', '”'], book: 'the book', person: 'the person', words: 'Which of these words of the original: {list}', conceptOrSearch: 'The article about {name}, or search for {text}' },
}

type Names = (id: string) => string | undefined
type Labels = Record<string, { label: Record<string, string> }>

/** The label's first words: `Pasaje` out of `Pasaje: el texto …`. */
function head(query: string, lang: string): string {
  const entry = (schemas as unknown as Labels)[query]
  const label = entry?.label[lang] ?? entry?.label.en ?? query
  return label.split(':')[0]!.trim()
}

const isPerson = (id: string): boolean => id.startsWith('tw:names/') || id.startsWith('per:')
/** `G39720` is shown as `G3972`: the key's last digit is the sense and is 0 for the word itself. */
const strongShown = (k: string): string => (/^[GH]\d{4}0$/.test(k) ? k.slice(0, -1) : k)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** A concept id by its first name, or the id's last part when the map has no name. */
const nameOf = (id: string, names: Names): string => names(id) ?? id.split('/').pop() ?? id
/** A book code by its name, or the code itself when the map has no name (R20). */
const bookOf = (code: string, names: Names): string => names(code) ?? code

function refShown(ref: string, names: Names): string {
  const i = ref.indexOf(' ')
  return i < 0 ? bookOf(ref, names) : `${bookOf(ref.slice(0, i), names)}${ref.slice(i)}`
}

function argsShown(c: Call, names: Names): string {
  const a = c.args
  switch (c.query) {
    case 'passage':
    case 'context':
      return refShown(str(a.ref), names)
    case 'concept':
      return nameOf(str(a.id), names)
    case 'article':
      return `${nameOf(str(a.id), names)}${typeof a.section === 'string' ? ` (${a.section})` : ''}`
    case 'renderings':
      return typeof a.strong === 'string' ? strongShown(a.strong) : `${bookOf(str(a.book), names)} #${String(a.word)}`
    case 'search':
      return str(a.text)
    case 'books':
      return nameOf(str(a.article ?? a.concept), names)
    case 'topics':
      return [a.category, typeof a.book === 'string' ? bookOf(a.book, names) : undefined].filter((x) => typeof x === 'string' && x !== '').join(', ')
    default:
      return ''
  }
}

function line(c: Call, lang: string, names: Names): string {
  const shown = argsShown(c, names)
  return shown === '' ? head(c.query, lang) : `${head(c.query, lang)}: ${shown}`
}

function chooseLine(options: Call[], lang: string, names: Names): string {
  const f = FRAMES[lang] ?? FRAMES.en!
  const q = (text: string): string => `${f.quote[0]}${text}${f.quote[1]}`
  const ask = (s: string): string => `${f.open}${s}${f.close}`
  if (options.length > 0 && options.every((o) => o.query === 'renderings' && typeof o.args.strong === 'string')) {
    const list = options.map((o) => strongShown(o.args.strong as string)).join(', ')
    return ask(`${f.words.replace('{list}', list)}${options.length >= 3 ? '…' : ''}`)
  }
  const concept = options.find((o) => o.query === 'concept')
  const search = options.find((o) => o.query === 'search')
  if (options.length === 2 && concept !== undefined && search !== undefined) {
    return ask(f.conceptOrSearch.replace('{name}', nameOf(str(concept.args.id), names)).replace('{text}', q(str(search.args.text))))
  }
  const book = options.some((o) => o.query === 'passage')
  const parts = options.map((o) => {
    if (o.query === 'passage') return `${bookOf(str(o.args.ref).split(' ')[0]!, names)}, ${f.book}`
    if (o.query === 'concept' && book && isPerson(str(o.args.id))) return `${nameOf(str(o.args.id), names)}, ${f.person}`
    return line(o, lang, names)
  })
  const last = parts.pop()
  return ask(parts.length === 0 ? last! : `${parts.join(', ')}, ${f.or} ${last}`)
}

export function interpret(decision: Decision, tag: string, names: Names): string {
  const base = baseLang(tag)
  const lang = base in FRAMES ? base : 'en'
  return decision.kind === 'call' ? line(decision.call, lang, names) : chooseLine(decision.options, lang, names)
}
