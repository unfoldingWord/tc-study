/**
 * USFM from the segments of format 3: a bridge text of a book segment (`bookUsfm`, with its alignment) and the original
 * (`origUsfm`), written back as the USFM a USFM parser reads into the same texts, events and alignment.
 *
 * The segment keeps the words of a text, what lies between them and the structure (`events`, `attrs`). It does not keep the
 * attributes of an alignment milestone, so `bookUsfm` takes them from the original: `x-strong`, `x-lemma` and `x-morph` of the
 * word at the position, `x-content` is its form, `x-occurrence` and `x-occurrences` are counted over the words of the verse
 * (the verses of the label, in a bridge), as `find` counts them when the book segment is built.
 *
 * What does not come back: a word that `alignMissing` lists is written as unaligned text (the original has no word to name);
 * the attributes of a word of a bridge text other than `x-occurrence` and `x-occurrences` (the segment does not keep them);
 * the attributes of a note other than its caller. It imports no Node module.
 */
import { verseId } from '../ids'
import type { BookModel, Event, OrigModel, Piece } from '../model'

const LEADING = /^[0-9]+/
const BRIDGE_END = /^[0-9]+-([0-9]+)/
const WHITESPACE = /^\s/

/** The chapter and verse that are open (`end` is the last verse of a bridge, as `3` in `2-3`). */
type Where = { chapter: number; verse: number; end: number }

/** The way a node is written: a block marker, a character style that closes, a note, a milestone, or something smaller. */
type Style = 'block' | 'char' | 'note' | 'ms' | 'cell' | 'break' | 'sidebar' | 'none'

function styleOf(type: string): Style {
  switch (type) {
    case 'char':
    case 'figure':
    case 'ref':
      return 'char'
    case 'note':
      return 'note'
    case 'ms':
      return 'ms'
    case 'optbreak':
      return 'break'
    case 'sidebar':
      return 'sidebar'
    case 'table':
      return 'none'
    case 'table:cell':
      return 'cell'
    default:
      return 'block'
  }
}

/** The attributes of a node as USFM writes them after the content: `|a="b" c="d"`, or nothing. */
function attributeText(attrs: Record<string, string> | undefined, skip: string[] = []): string {
  const entries = Object.entries(attrs ?? {}).filter(([name]) => !skip.includes(name))
  if (entries.length === 0) return ''
  return `|${entries.map(([name, value]) => `${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(' ')}`
}

/** The chapter or verse a label starts with (`"2-3"` is 2), 0 when it has no number. */
const leading = (label: string): number => (LEADING.test(label) ? Number(LEADING.exec(label)![0]) : 0)

/** Where each word piece of a text is, by the order of the word pieces. */
function wordPlaces(pieces: Piece[], events: Event[]): Where[] {
  const places: Where[] = []
  const at: Where = { chapter: 0, verse: 0, end: 0 }
  let event = 0
  pieces.forEach(([, isWord], position) => {
    for (; event < events.length && events[event][0] <= position; event++) advance(at, events[event])
    if (isWord) places.push({ ...at })
  })
  return places
}

/** The effect of a chapter or a verse event on where the text is (the same reading as the builders). */
function advance(at: Where, [, kind, arg]: Event): void {
  if (kind === 'chapter') {
    at.chapter = leading(arg)
    at.verse = 0
    at.end = 0
  } else if (kind === 'verse') {
    at.verse = leading(arg)
    const end = Number(BRIDGE_END.exec(arg)?.[1] ?? at.verse)
    // A second number a verse id cannot hold (1000 and up) is not a bridge.
    at.end = end > at.verse && end < 1000 ? end : at.verse
  }
}

/** What the writer asks of the kind of text: how a word is written and which milestones are open around it. */
type Words = {
  /** The positions in the original of the milestones open around the word `w`, outer first. */
  around?: (w: number) => number[]
  /** A `zaln-s` for the original word at `position`, opened where the text is. */
  milestone?: (position: number, at: Where) => string
  /** The word `w` with its marker, `\w x|a="b"\w*`; `nested` is true inside a character style (`\+w`). */
  word: (w: number, text: string, nested: boolean) => string
}

type Open = { style: Style; close: string }

/**
 * The USFM of pieces and events. A node opens with its marker and closes where the event says; a text piece is written as it
 * is; milestones close right after their last word, but after a piece that starts with a blank (a parser drops the blank that
 * follows a milestone's end).
 */
function render(pieces: Piece[], events: Event[], attrs: Record<number, Record<string, string>> | undefined, words: Words): string {
  const out: string[] = []
  const stack: Open[] = []
  const milestones: number[] = []
  let closing = 0
  let pending = false
  let word = 0
  const at: Where = { chapter: 0, verse: 0, end: 0 }

  const inline = (): boolean => {
    const top = stack[stack.length - 1]
    return top !== undefined && (top.style === 'char' || top.style === 'note' || top.style === 'cell')
  }
  /** The separator that a marker with content needs before what follows. */
  const separate = (text: boolean): void => {
    if (!pending) return
    out.push(text || inline() ? ' ' : '\n')
    pending = false
  }
  /** A block marker starts a line. */
  const newline = (): void => {
    const last = out[out.length - 1]
    if (last !== undefined && !last.endsWith('\n')) out.push('\n')
  }
  const flush = (): void => {
    for (; closing > 0; closing--) out.push('\\zaln-e\\*')
  }
  const nested = (): boolean => stack.some((node) => node.style === 'char')

  const event = (index: number): void => {
    const [, kind, arg] = events[index]
    const extra = attrs?.[index]
    if (kind === 'close') {
      const node = stack.pop()
      if (node === undefined) return
      flush()
      pending = false
      out.push(node.close)
      return
    }
    flush()
    separate(false)
    advance(at, events[index])
    if (kind === 'chapter') {
      newline()
      out.push(`\\c ${arg}\n`)
      if (extra?.altnumber !== undefined) out.push(`\\ca ${extra.altnumber}\\ca*\n`)
      if (extra?.pubnumber !== undefined) out.push(`\\cp ${extra.pubnumber}\n`)
      return
    }
    if (kind === 'verse') {
      out.push(`\\v ${arg} `)
      if (extra?.altnumber !== undefined) out.push(`\\va ${extra.altnumber}\\va* `)
      if (extra?.pubnumber !== undefined) out.push(`\\vp ${extra.pubnumber}\\vp* `)
      return
    }
    const [type, marker] = arg.includes(':') ? [arg.slice(0, arg.indexOf(':')), arg.slice(arg.indexOf(':') + 1)] : [arg, '']
    const style = styleOf(type)
    switch (style) {
      case 'block':
        newline()
        out.push(type === 'book' ? `\\${marker} ${extra?.code ?? ''}` : `\\${marker}`)
        pending = true
        stack.push({ style, close: '' })
        break
      case 'char': {
        const prefix = nested() ? '+' : ''
        out.push(`\\${prefix}${marker}`)
        pending = true
        stack.push({ style, close: `${attributeText(extra)}\\${prefix}${marker}*` })
        break
      }
      case 'note':
        out.push(`\\${marker} ${extra?.caller ?? '+'} `)
        stack.push({ style, close: `\\${marker}*` })
        break
      case 'ms':
        out.push(`\\${marker}${attributeText(extra) === '' ? '' : ' '}${attributeText(extra)}\\*`)
        stack.push({ style, close: '' })
        break
      case 'cell':
        out.push(` \\${marker}`)
        pending = true
        stack.push({ style, close: '' })
        break
      case 'break':
        out.push('//')
        stack.push({ style, close: '' })
        break
      case 'sidebar':
        newline()
        out.push(`\\${marker || 'esb'}\n`)
        stack.push({ style, close: '\n\\esbe\n' })
        break
      case 'none':
        stack.push({ style, close: '' })
        break
    }
  }

  const piece = ([text, isWord]: Piece): void => {
    if (!isWord) {
      if (text === '') return
      if (closing > 0 && WHITESPACE.test(text)) {
        separate(true)
        out.push(text)
        flush()
        return
      }
      flush()
      separate(true)
      out.push(text)
      return
    }
    flush()
    separate(false)
    const target = words.around?.(word) ?? []
    let common = 0
    while (common < milestones.length && common < target.length && milestones[common] === target[common]) common++
    // Milestones that the word does not share are closed before it (the look ahead below has closed them already).
    for (let extra = milestones.length; extra > common; extra--) out.push('\\zaln-e\\*')
    milestones.length = common
    for (let k = common; k < target.length; k++) {
      out.push(words.milestone!(target[k], at))
      milestones.push(target[k])
    }
    out.push(words.word(word, text, nested()))
    word++
    const next = words.around?.(word) ?? []
    let keep = 0
    while (keep < milestones.length && keep < next.length && milestones[keep] === next[keep]) keep++
    closing = milestones.length - keep
    milestones.length = keep
  }

  let index = 0
  for (let position = 0; position <= pieces.length; position++) {
    for (; index < events.length && events[index][0] <= position; index++) event(index)
    if (position < pieces.length) piece(pieces[position])
  }
  flush()
  while (stack.length > 0) out.push(stack.pop()!.close)
  return `${out.join('').replace(/^\n+/, '')}\n`
}

/** The positions of the words of an original by verse, and the verse of each. */
function indexOrig(orig: OrigModel): { ids: number[]; byVerse: Map<number, number[]> } {
  const ids = wordPlaces(orig.pieces, orig.events).map((where) => verseId(orig.book, where.chapter, where.verse))
  const byVerse = new Map<number, number[]>()
  ids.forEach((id, position) => {
    const list = byVerse.get(id)
    if (list === undefined) byVerse.set(id, [position])
    else list.push(position)
  })
  return { ids, byVerse }
}

/**
 * The USFM of the text `text` of a book segment: its structure, its words as `\w`, and the alignment as `\zaln-s` and
 * `\zaln-e` milestones around the words, with the attributes of the original word (`orig`, the original the book names). A
 * word in `alignMissing` is written without a milestone.
 *
 * Throws `RangeError` when the book has no such text, or a word names a position the original does not have.
 */
export function bookUsfm(book: BookModel, text: number, orig: OrigModel): string {
  const model = book.texts[text]
  if (model === undefined) throw new RangeError(`The book has ${book.texts.length} texts and the text ${text} is not one`)
  const { ids, byVerse } = indexOrig(orig)
  const places = wordPlaces(model.pieces, model.events)

  // x-occurrence and x-occurrences of the words of the text, over the verse each word is in.
  const seen = new Map<string, number>()
  const totals = new Map<string, number>()
  const key = (w: number, form: string): string => `${places[w].chapter}:${places[w].verse}:${form}`
  const forms = model.pieces.filter(([, isWord]) => isWord).map(([form]) => form)
  forms.forEach((form, w) => totals.set(key(w, form), (totals.get(key(w, form)) ?? 0) + 1))
  const ranks = forms.map((form, w) => {
    const next = (seen.get(key(w, form)) ?? 0) + 1
    seen.set(key(w, form), next)
    return next
  })

  const milestone = (position: number, where: Where): string => {
    const found = orig.words[position]
    if (found === undefined) throw new RangeError(`The alignment names the position ${position}, and the original has ${orig.words.length} words`)
    const first = verseId(orig.book, where.chapter, where.verse)
    const last = where.end > where.verse ? verseId(orig.book, where.chapter, where.end) : first
    let range: number[] = []
    for (let id = first; id <= last; id++) range.push(...(byVerse.get(id) ?? []))
    // A position outside the verses of the text (it cannot come from `find`) is counted in its own verse.
    if (!range.includes(position)) range = byVerse.get(ids[position]) ?? [position]
    const same = range.filter((other) => orig.words[other].form === found.form)
    const attributes: [string, string][] = []
    if (found.strong !== '') attributes.push(['x-strong', found.strong])
    if (found.lemma !== '') attributes.push(['x-lemma', found.lemma])
    if (found.morph !== '') attributes.push(['x-morph', found.morph])
    attributes.push(['x-occurrence', String(same.indexOf(position) + 1)], ['x-occurrences', String(same.length)], ['x-content', found.form])
    return `\\zaln-s ${attributeText(Object.fromEntries(attributes))}\\*`
  }

  return render(model.pieces, model.events, model.attrs, {
    around: (w) => model.align?.[w] ?? [],
    milestone,
    word: (w, form, nested) => {
      const marker = nested ? '+w' : 'w'
      return `\\${marker} ${form}${attributeText({ 'x-occurrence': String(ranks[w]), 'x-occurrences': String(totals.get(key(w, form))) })}\\${marker}*`
    },
  })
}

/**
 * The USFM of an original book: its structure and its words as `\w form|lemma="…" strong="…" x-morph="…"\w*`, with the other
 * attributes of a word (a ketiv or a qere mark among them) after them, as the segment keeps them.
 */
export function origUsfm(orig: OrigModel): string {
  return render(orig.pieces, orig.events, orig.attrs, {
    word: (w, form, nested) => {
      const found = orig.words[w]
      const marker = nested ? '+w' : 'w'
      const attributes: Record<string, string> = {}
      if (found.lemma !== '') attributes.lemma = found.lemma
      if (found.strong !== '') attributes.strong = found.strong
      if (found.morph !== '') attributes['x-morph'] = found.morph
      return `\\${marker} ${form}${attributeText({ ...attributes, ...found.other })}\\${marker}*`
    },
  })
}
