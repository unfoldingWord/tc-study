/**
 * The lexicon: what a question names. It finds references, books, Strong numbers, concepts and categories, with the token span of
 * each, from the language's map core (book names, concept names, Academy subtitles) and the number words of the language.
 * No edit distance: a name matches by its stems, or does not. C0's prototype (`cadena.py`) is the reference; the differences are in the plan.
 */
import { baseLang, namesById, stemForms } from '@bt-synergy/language-pack-client'
import { BOOKS, type MapSet } from '@bt-synergy/language-pack-v3'
import { fold } from './fold'
import type { NumbersComplement } from './complements'

export type Entity =
  | { kind: 'ref'; book: string; chapter: number; verse?: number; verseEnd?: number; start: number; end: number }
  | { kind: 'book'; book: string; start: number; end: number }
  | { kind: 'strong'; value: string; start: number; end: number }
  | { kind: 'concept'; ids: string[]; cls: 'tw' | 'name' | 'ta' | 'topic'; start: number; end: number }
  | { kind: 'category'; value: 'person' | 'place' | 'event' | 'topic' | 'story'; start: number; end: number }

export type Lexicon = {
  /** The tokens of the folded question and the entities found in them (token indexes, `end` excluded), in order of position. */
  entities(question: string, o?: { phraseTokens?: ReadonlySet<number> }): { tokens: string[]; entities: Entity[] }
  /** A book code to the ids of the people whose name equals one of its full names (`jhn` to John). */
  ambiguousBooks: Map<string, string[]>
}

const words = (s: string): string[] => s.split(' ').filter((w) => w !== '')

/** Words that carry no meaning of their own, skipped between the words of a name. */
export const STOP: Record<string, Set<string>> = {
  es: new Set(words('a al de del el la las los lo un una unos unas y e o u en con por para que se su sus me mi le les es son como cuando cual quien donde')),
  pt: new Set(words('a o as os um uma uns umas de do da dos das no na nos nas em com por para que se seu sua me te e ou como quando qual quem onde')),
  en: new Set(words('a an the of in on to for with and or is are was were what who whom where when which how does do did it its his her their this that')),
}

/** Words of the question's frame ("which books", "the word"): never a concept by themselves. */
export const FRAME: Record<string, Set<string>> = {
  es: new Set(words('palabra palabras libro libros biblia texto textos veces traduccion traducciones traducir traduce traducen tradujo nombre nombres lugar lugares persona personas personaje personajes evento eventos tema temas articulo articulos nota notas pasaje pasajes versiculo versiculos parte partes dice decir significa significado ayuda ayudas pregunta preguntas lista importante importantes principales muestrame antiguo testamento aparece aparecen menciona usa usan sale hay tiene tienen')),
  pt: new Set(words('palavra palavras livro livros biblia texto textos vezes traducao traducoes traduzir traduz nome nomes local locais pessoa pessoas personagem personagens evento eventos tema temas artigo artigos nota notas passagem passagens versiculo versiculos diz dizer significa significado ajuda ajudas pergunta perguntas lista importante importantes principais mostre antigo testamento aparece aparecem menciona usa usam fala falar usado')),
  en: new Set(words('word words book books bible text texts times translation translations translate translates translated name names place places person people character characters event events topic topics article articles note notes passage passages verse verses says say mean means meaning help question questions list important main show appear appears mentioned uses used old testament')),
}

/** Category words by base language. */
export const CATS: Record<string, Record<'person' | 'place' | 'event' | 'topic' | 'story', string>> = {
  es: { person: 'personas personajes gente', place: 'lugares sitios', event: 'eventos acontecimientos sucesos', topic: 'temas', story: 'relatos' },
  pt: { person: 'pessoas personagens gente', place: 'locais lugares', event: 'eventos acontecimentos', topic: 'temas', story: 'relatos' },
  en: { person: 'people persons characters', place: 'places locations', event: 'events', topic: 'topics themes subjects', story: 'stories narratives' },
}

/** Words between a book and its numbers, and between the numbers ("capitulo 3 versiculo 16"). */
export const FILLERS: Record<string, Set<string>> = {
  es: new Set(words('capitulo capitulos cap caps versiculo versiculos vers v vv verso versos')),
  pt: new Set(words('capitulo capitulos cap caps versiculo versiculos vers v vv verso versos')),
  en: new Set(words('chapter chapters ch chap verse verses vs v vv ver')),
}
/** Joined to a chapter and a verse ("capitulo 3 y 16") only after the first number. */
const JOINERS = new Set(['y', 'e', 'and'])

/** The words of the first, second and third in front of a book name ("Primera de Juan"). */
const ORDINALS: Record<string, Record<string, string[]>> = {
  es: { '1': ['primera', 'primer', 'primero'], '2': ['segunda', 'segundo'], '3': ['tercera', 'tercer', 'tercero'] },
  pt: { '1': ['primeira', 'primeiro'], '2': ['segunda', 'segundo'], '3': ['terceira', 'terceiro'] },
  en: { '1': ['first', '1st'], '2': ['second', '2nd'], '3': ['third', '3rd'] },
}
const OF: Record<string, string | undefined> = { es: 'de', pt: 'de', en: undefined }

const PERSON = (id: string): boolean => id.startsWith('tw:names/') || id.startsWith('per:')
const RANK = (id: string): number => (id.startsWith('tw:names/') ? 0 : id.startsWith('tw:') ? 1 : id.startsWith('ta:') ? 2 : 3)
const byRank = (a: string, b: string): number => RANK(a) - RANK(b) || (a < b ? -1 : a > b ? 1 : 0)
function clsOf(id: string): 'tw' | 'name' | 'ta' | 'topic' {
  const r = RANK(id)
  return r === 0 ? 'name' : r === 1 ? 'tw' : r === 2 ? 'ta' : 'topic'
}

/** The books of one chapter: a reference with one number names a verse of chapter 1. */
export const ONE_CHAPTER = new Set(['oba', 'phm', '2jn', '3jn', 'jud'])

type BookAlias = { toks: string[]; code: string; standalone: boolean; cued: boolean; digitsOnly: boolean }

/** Book names that are also common nouns ("los numeros de la tabla"): alone they are no book. */
export const COMMON_NOUNS: Record<string, Set<string>> = {
  es: new Set(words('numeros hechos reyes jueces cronicas lamentaciones proverbios cantares')),
  pt: new Set(words('numeros atos reis juizes cronicas lamentacoes proverbios')),
  en: new Set(words('numbers acts kings judges chronicles lamentations proverbs')),
}
/** Words in front of a name that say it is a book: "libro de Numeros". */
export const CUES: Record<string, string[][]> = {
  es: [['libro', 'de'], ['carta', 'a'], ['carta', 'de']],
  pt: [['livro', 'de'], ['carta', 'a'], ['carta', 'de']],
  en: [['book', 'of'], ['letter', 'to'], ['letter', 'of']],
}
type Concept = { forms: string[][]; ids: Set<string> }

function variants(toks: string[], lang: string): string[][] {
  const out: string[][] = [toks]
  const first = toks[0]!
  if (/^[123]$/.test(first) && toks.length > 1) {
    out.push([first + toks[1]!, ...toks.slice(2)])
    const of = OF[lang]
    for (const o of ORDINALS[lang]?.[first] ?? []) {
      out.push([o, ...toks.slice(1)])
      if (of !== undefined) out.push([o, of, ...toks.slice(1)])
    }
  }
  const glued = /^([123])(\p{L}.*)$/u.exec(first)
  if (glued) out.push([glued[1]!, glued[2]!, ...toks.slice(1)])
  return out
}

export function buildLexicon(maps: MapSet, tag: string, numbers?: NumbersComplement): Lexicon {
  const lang = baseLang(tag)
  const stop = STOP[lang] ?? new Set<string>()
  const frame = FRAME[lang] ?? new Set<string>()
  const fillers = FILLERS[lang] ?? new Set<string>()
  const formsCache = new Map<string, string[]>()
  const formsOf = (tok: string): string[] => {
    let f = formsCache.get(tok)
    if (f === undefined) formsCache.set(tok, (f = stemForms(tag, tok)))
    return f
  }
  const frameForms = new Set([...frame].flatMap(formsOf))

  // Books: the 66 of the map core, by token sequence, longest first.
  const aliases: BookAlias[] = []
  const seen = new Set<string>()
  const common = COMMON_NOUNS[lang] ?? new Set<string>()
  const cues = CUES[lang] ?? []
  const addBook = (text: string | undefined, code: string, standalone: boolean, digitsOnly = false): void => {
    const toks = words(fold(text ?? ''))
    if (toks.length === 0) return
    // A name that is a stop, frame or common word alone needs a number after it or a cue before it.
    const weak = toks.length === 1 && (stop.has(toks[0]!) || frame.has(toks[0]!) || common.has(toks[0]!))
    for (const v of variants(toks, lang)) {
      const key = v.join(' ')
      if (seen.has(key)) continue
      seen.add(key)
      aliases.push({ toks: v, code, standalone: standalone && !weak, cued: standalone && weak, digitsOnly })
    }
  }
  const core = maps.map?.core
  const fullNames = new Map<string, string[]>()
  core?.books.forEach((b, i) => {
    const code = BOOKS[i]
    if (code === undefined) return
    const [full, short, abbr] = b
    fullNames.set(code, [full, short].filter((n): n is string => !!n))
    addBook(full, code, true)
    addBook(short, code, true)
    addBook(abbr, code, false)
  })
  // A numbered book written short: its number and the start of the word after it ("1 Cor", "2 Tim.", "1Co"), when no other book
  // with that number starts the same way. Two letters need numbers after them; three or more are the book alone too.
  const starts = new Map<string, Set<string>>()
  for (const [code, names] of fullNames) {
    for (const name of [...names, core?.books[BOOKS.indexOf(code)]?.[2]]) {
      const toks = words(fold(name ?? ''))
      const glued = toks.length === 1 ? /^([123])(\p{L}+)$/u.exec(toks[0]!) : null
      const [num, word] = glued ? [glued[1]!, glued[2]!] : toks.length === 2 && /^[123]$/.test(toks[0]!) ? [toks[0]!, toks[1]!] : []
      if (num === undefined || word === undefined || !/^\p{L}+$/u.test(word)) continue
      for (let n = 2; n < word.length; n++) {
        const key = `${num} ${word.slice(0, n)}`
        ;(starts.get(key) ?? starts.set(key, new Set()).get(key)!).add(code)
      }
    }
  }
  for (const [key, codes] of starts) if (codes.size === 1) addBook(key, [...codes][0]!, key.length >= 5)
  // A bare code ("deu") is no word of the language: it is a reference only when digits follow it ("deu 2", not pt "deu duas").
  BOOKS.forEach((code) => addBook(code, code, false, true))
  const booksByFirst = new Map<string, BookAlias[]>()
  for (const a of [...aliases].sort((x, y) => y.toks.length - x.toks.length)) {
    const list = booksByFirst.get(a.toks[0]!) ?? []
    list.push(a)
    booksByFirst.set(a.toks[0]!, list)
  }

  // Concepts: every name of the maps and every Academy subtitle, as stems.
  const all = new Map<string, string[]>()
  // Names the alignment found are kept only when nothing else contradicts them: no other id has the name from a better source,
  // it is not a book's name, and it does not start with a stop word.
  const alignment: [string, string][] = []
  const topicNames = maps.topics?.core.names ?? {}
  const trustedTopics: Record<string, unknown[][]> = {}
  for (const [id, list] of Object.entries(topicNames)) {
    const keep = (list as unknown[][]).filter((n) => n[1] !== 'alignment')
    for (const n of list as unknown[][]) if (n[1] === 'alignment' && typeof n[0] === 'string') alignment.push([id, n[0]])
    trustedTopics[id] = keep
  }
  const trustedMaps = maps.topics ? { ...maps, topics: { ...maps.topics, core: { ...maps.topics.core, names: trustedTopics } } } : maps
  for (const [id, names] of namesById(trustedMaps as MapSet)) all.set(id, [...names])
  const owners = new Map<string, Set<string>>()
  for (const [id, names] of all) for (const n of names) (owners.get(fold(n)) ?? owners.set(fold(n), new Set()).get(fold(n))!).add(id)
  const bookNames = new Set<string>()
  for (const b of core?.books ?? []) for (const n of b.slice(0, 3)) if (n) bookNames.add(fold(String(n)))
  for (const [id, name] of alignment) {
    const f = fold(name)
    const other = [...(owners.get(f) ?? [])].some((o) => o !== id)
    if (other || bookNames.has(f) || stop.has(words(f)[0] ?? '')) continue
    const list = all.get(id) ?? []
    if (!list.includes(name)) list.push(name)
    all.set(id, list)
  }
  for (const [id, sub] of Object.entries(core?.subtitles ?? {})) {
    const list = all.get(id) ?? []
    if (!list.includes(sub)) list.push(sub)
    all.set(id, list)
  }
  const concepts = new Map<string, Concept>()
  for (const [id, names] of all) {
    for (const name of names.flatMap((n) => n.split(','))) {
      const toks = words(fold(name.replace(/\(.*?\)/g, ' '))).filter((t) => !stop.has(t))
      if (toks.length === 0) continue
      const forms = toks.map(formsOf)
      // A short word counts only when it is the article's whole title ("fe").
      if (toks.length === 1 && forms[0]![0]!.length < 3 && names.length > 1 && !PERSON(id)) continue
      if (toks.length === 1 && forms[0]!.some((f) => frameForms.has(f))) continue
      const key = forms.map((f) => f[0]).join(' ')
      const c = concepts.get(key) ?? { forms, ids: new Set<string>() }
      c.ids.add(id)
      concepts.set(key, c)
    }
  }
  const conceptsByFirst = new Map<string, Concept[]>()
  for (const c of concepts.values()) {
    for (const f of c.forms[0]!) {
      const list = conceptsByFirst.get(f) ?? []
      list.push(c)
      conceptsByFirst.set(f, list)
    }
  }
  const sameForms = (a: string[], b: string[]): boolean => a.some((x) => b.includes(x))

  // A book whose full name is also a person's name.
  const ambiguousBooks = new Map<string, string[]>()
  for (const [code, names] of fullNames) {
    const ids = new Set<string>()
    for (const name of names) {
      const toks = words(fold(name)).filter((t) => !stop.has(t))
      if (toks.length === 0) continue
      const forms = toks.map(formsOf)
      for (const c of forms[0]!.flatMap((f) => conceptsByFirst.get(f) ?? [])) {
        if (c.forms.length === forms.length && c.forms.every((f, k) => sameForms(f, forms[k]!))) for (const id of c.ids) if (PERSON(id)) ids.add(id)
      }
    }
    if (ids.size > 0) ambiguousBooks.set(code, [...ids].sort(byRank))
  }

  const wordList = numbers?.words ?? {}
  const longest = Math.max(1, ...Object.keys(wordList).map((k) => words(k).length))
  const catOf = new Map<string, 'person' | 'place' | 'event' | 'topic' | 'story'>()
  for (const [value, ws] of Object.entries(CATS[lang] ?? {})) for (const w of words(ws)) catOf.set(w, value as 'person')

  function wordAt(toks: string[], i: number): { value: number; n: number } | undefined {
    for (let n = Math.min(longest, toks.length - i); n >= 1; n--) {
      const v = wordList[toks.slice(i, i + n).join(' ')]
      if (v !== undefined) return { value: v, n }
    }
    return undefined
  }

  /** Up to two numbers from `i`: digits, number words and a range; `end` is the token after the last one used. */
  function numbersAfter(toks: string[], i: number): { nums: number[]; verseEnd?: number; firstEnd?: number; end: number } {
    const nums: number[] = []
    let verseEnd: number | undefined
    let firstEnd: number | undefined
    let end = i
    while (end < toks.length && nums.length < 2) {
      const t = toks[end]!
      if (fillers.has(t) || (nums.length === 1 && JOINERS.has(t))) {
        // a filler goes in the span only when a number follows it
        let j = end + 1
        while (j < toks.length && (fillers.has(toks[j]!) || JOINERS.has(toks[j]!))) j++
        if (j >= toks.length || !(/^\d/.test(toks[j]!) || wordAt(toks, j) !== undefined)) break
        end = j
        continue
      }
      const m = /^(\d+)(?:-(\d+))?$/.exec(t)
      if (m) {
        nums.push(Number(m[1]))
        if (m[2] !== undefined && nums.length === 2) verseEnd = Number(m[2])
        if (m[2] !== undefined && nums.length === 1) firstEnd = Number(m[2])
        end++
        continue
      }
      const w = wordAt(toks, end)
      if (w === undefined) break
      nums.push(w.value)
      end += w.n
    }
    return { nums, ...(verseEnd === undefined ? {} : { verseEnd }), ...(firstEnd === undefined ? {} : { firstEnd }), end }
  }

  /** `phraseTokens`: the token indexes of the question's fixed phrases ("quien fue"); no concept name uses them. */
  function entities(question: string, o: { phraseTokens?: ReadonlySet<number> } = {}): { tokens: string[]; entities: Entity[] } {
    const toks = words(fold(question))
    const used = toks.map(() => false)
    const out: Entity[] = []
    const mark = (a: number, b: number): void => {
      for (let k = a; k < b; k++) used[k] = true
    }

    toks.forEach((t, i) => {
      const m = /^([gh])(\d{1,5})$/.exec(t)
      if (m) {
        out.push({ kind: 'strong', value: m[1]!.toUpperCase() + m[2]!, start: i, end: i + 1 })
        used[i] = true
      }
    })

    // Books and references
    for (let i = 0; i < toks.length; ) {
      const hit = used[i]
        ? undefined
        : booksByFirst.get(toks[i]!)?.find((a) => a.toks.every((w, k) => toks[i + k] === w) && !used.slice(i, i + a.toks.length).some(Boolean))
      if (hit === undefined) {
        i++
        continue
      }
      const after = i + hit.toks.length
      const { nums, verseEnd, firstEnd, end } = numbersAfter(toks, after)
      if (nums.length === 1 && ONE_CHAPTER.has(hit.code) && !(hit.digitsOnly && !/^\d/.test(toks[after]!))) {
        // A one-chapter book with one number names a verse of chapter 1 ("3 Jn 4", "Judas 3-5").
        const e = firstEnd !== undefined && firstEnd > nums[0]! ? { verseEnd: firstEnd } : {}
        out.push({ kind: 'ref', book: hit.code, chapter: 1, verse: nums[0]!, ...e, start: i, end })
        mark(i, end)
        i = end
        continue
      }
      if (nums.length > 0 && !(hit.digitsOnly && !/^\d/.test(toks[after]!))) {
        out.push({
          kind: 'ref',
          book: hit.code,
          chapter: nums[0]!,
          ...(nums[1] !== undefined ? { verse: nums[1] } : {}),
          ...(nums[1] !== undefined && verseEnd !== undefined && verseEnd > nums[1] ? { verseEnd } : {}),
          start: i,
          end,
        })
        mark(i, end)
        i = end
        continue
      }
      const cued = hit.cued && cues.some((c) => c.length <= i && c.every((w, k) => toks[i - c.length + k] === w))
      if (hit.standalone || cued) out.push({ kind: 'book', book: hit.code, start: i, end: after })
      i += 1
    }

    // Concepts: consecutive content words, longest first; each token once.
    const content: number[] = []
    toks.forEach((t, k) => {
      if (!stop.has(t)) content.push(k)
    })
    const found: { n: number; span: number[]; ids: string[] }[] = []
    for (let s = 0; s < content.length; s++) {
      const tried = new Set<Concept>()
      for (const f of formsOf(toks[content[s]!]!)) {
        for (const c of conceptsByFirst.get(f) ?? []) {
          if (tried.has(c)) continue
          tried.add(c)
          const n = c.forms.length
          if (s + n > content.length) continue
          const span = content.slice(s, s + n)
          if (c.forms.every((forms, x) => sameForms(forms, formsOf(toks[span[x]!]!)))) found.push({ n, span, ids: [...c.ids] })
        }
      }
    }
    found.sort((a, b) => b.n - a.n || a.span[0]! - b.span[0]!)
    // A name inside a fixed phrase is no name ("era" in "o que era"). A name that shares words with a phrase is taken only after the
    // others, when no other name claims its words: "quien fue Booz" is Booz, "como se traducen los nombres propios" keeps its tA name.
    const phraseWords = (a: number, b: number): number => {
      let n = 0
      for (let k = a; k < b; k++) if (o.phraseTokens?.has(k)) n++
      return n
    }
    for (const pass of [0, 1]) {
      for (const { span, ids } of found) {
        const a = span[0]!
        const b = span[span.length - 1]! + 1
        const shared = phraseWords(a, b)
        if (shared === b - a || (pass === 0) !== (shared === 0)) continue
        // A one-word name that is a frame word is the frame; a longer name may start with one ("pregunta retorica", "nombres propios").
        if ((span.length === 1 && frame.has(toks[a]!)) || used.slice(a, b).some(Boolean)) continue
        const sorted = ids.sort(byRank)
        out.push({ kind: 'concept', ids: sorted, cls: clsOf(sorted[0]!), start: a, end: b })
        mark(a, b)
      }
    }

    // A book name that is also a person's name is both.
    for (const e of [...out]) {
      if (e.kind !== 'book') continue
      const people = ambiguousBooks.get(e.book)
      if (people && !out.some((x) => x.kind === 'concept' && x.start === e.start)) {
        out.push({ kind: 'concept', ids: [...people], cls: clsOf(people[0]!), start: e.start, end: e.end })
      }
    }

    toks.forEach((t, i) => {
      const value = catOf.get(t)
      if (value !== undefined && !used[i]) out.push({ kind: 'category', value, start: i, end: i + 1 })
    })
    out.sort((a, b) => a.start - b.start || b.end - a.end)
    return { tokens: toks, entities: out }
  }

  return { entities, ambiguousBooks }
}
