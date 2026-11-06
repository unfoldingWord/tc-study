/** `renderings`: how the installed texts of the language render the original words with one Strong, by their alignment. No Node module here. */
import { answer, BOOKS, type Cell, strongKey } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'

export type RenderingsData = { strong: string; renderings: { text: string; count: number; refs: string[] }[] }

export async function renderingsQuery(reader: PackReader, q: { strong: string } | { book: string; word: number }): Promise<Answer<RenderingsData>> {
  const out = newAnswer<RenderingsData>(reader, 'renderings')
  const asked = q as { strong?: unknown; book?: unknown; word?: unknown } | null
  let key: string
  if (asked?.strong !== undefined) {
    if (typeof asked.strong !== 'string' || asked.strong === '') throw new ClientError('E_ARG', 'strong must be a Strong key')
    key = strongKey(asked.strong)
  } else {
    const { book, word } = asked ?? {}
    if (typeof book !== 'string' || !(BOOKS as readonly string[]).includes(book) || typeof word !== 'number' || !Number.isInteger(word) || word < 0) {
      throw new ClientError('E_ARG', 'renderings needs a strong, or a book and a word position')
    }
    const unit = `orig:${book}`
    const orig = reader.installed(unit) ? await reader.orig(book) : undefined
    if (orig === undefined) {
      if (reader.listed(unit) && !reader.installed(unit)) missingUnit(out, { book, unit, bytes: reader.size(unit) })
      return out
    }
    const w = orig.words[word]
    if (w === undefined) throw new ClientError('E_ARG', `${book} has no word ${word}`)
    usedUnit(out, reader, unit)
    key = strongKey(w.strong)
  }
  const maps = await reader.maps()
  const found = new Map<string, { count: number; refs: string[] }>()
  const counted = new Set<string>()
  if (maps.xmap !== undefined) {
    usedUnit(out, reader, 'xmap')
    const books = (answer(maps, { kind: 'strong', key }) as { books: Record<string, Cell> }).books
    for (const [book, c] of Object.entries(books)) if (c.state === 'count' || c.state === 'partial') counted.add(book)
  }
  for (const book of BOOKS) {
    const bookUnit = `book:${book}`
    const origUnit = `orig:${book}`
    if (!reader.installed(bookUnit) || !reader.installed(origUnit)) {
      if (counted.has(book)) {
        if (reader.listed(bookUnit) && !reader.installed(bookUnit)) missingUnit(out, { book, unit: bookUnit, bytes: reader.size(bookUnit), what: key })
        if (reader.listed(origUnit) && !reader.installed(origUnit)) missingUnit(out, { book, unit: origUnit, bytes: reader.size(origUnit), what: key })
      }
      continue
    }
    const model = await reader.book(book)
    const orig = await reader.orig(book)
    if (model === undefined || orig === undefined) continue
    usedUnit(out, reader, bookUnit)
    usedUnit(out, reader, origUnit)
    const positions = new Set<number>()
    orig.words.forEach((w, i) => {
      if (strongKey(w.strong) === key) positions.add(i)
    })
    if (positions.size === 0) continue
    for (const text of model.texts) {
      if (text.align === undefined) continue
      let used = false
      let chapter = ''
      let verse = ''
      let ev = 0
      let ordinal = -1
      let run: { pos: number; words: string[]; ref: string } | undefined
      const flush = (): void => {
        if (run === undefined) return
        const rendering = run.words.join(' ')
        const e = found.get(rendering) ?? { count: 0, refs: [] }
        e.count++
        if (!e.refs.includes(run.ref)) e.refs.push(run.ref)
        found.set(rendering, e)
        used = true
        run = undefined
      }
      for (const [i, piece] of text.pieces.entries()) {
        // The verse of each word piece: walk the events as the text is read.
        while (ev < text.events.length && text.events[ev]![0] <= i) {
          const [, kind, arg] = text.events[ev]!
          if (kind === 'chapter') chapter = arg
          else if (kind === 'verse') verse = arg
          ev++
        }
        if (!piece[1]) continue
        ordinal++
        const hit = (text.align[ordinal] ?? []).find((p) => positions.has(p))
        if (hit === undefined) {
          flush()
          continue
        }
        // Words that translate the same original word, one after the other, are one rendering.
        if (run !== undefined && run.pos === hit) run.words.push(piece[0])
        else {
          flush()
          run = { pos: hit, words: [piece[0]], ref: `${book} ${chapter}:${verse}` }
        }
      }
      flush()
      if (used) out.cites.push({ res: text.res, release: releaseOf(model.res, text.res), ref: key })
    }
  }
  const renderings = [...found].map(([text, v]) => ({ text, count: v.count, refs: v.refs }))
  renderings.sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
  out.data = { strong: key, renderings }
  return out
}
