/**
 * `renderings`: how the installed texts of the language render the original words with one Strong, by their alignment. The key is
 * resolved by the lookup rule of the `strong` table (queries/README.md: `G5485` is `G54850` when the table has that one); `data.strong`
 * is the resolved key, and the original's words are matched against it. A book whose alignment counts positions in an original of
 * another stamp than the installed one is left out (ids.md "Positions in the original") and named in `notInstalled` with
 * `what: 'stale'`. No Node module here.
 */
import { answer, type BookModel, BOOKS, type Cell, strongKey } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'

export type RenderingsData = { strong: string; renderings: { text: string; count: number; refs: string[] }[] }

/** The positions of each Strong key in an original, built once per model (the reader keeps the model, so the index lives as long as it). */
const keyIndex = new WeakMap<object, Map<string, Int32Array>>()
function positionsByKey(orig: { words: readonly { strong: string }[] }): Map<string, Int32Array> {
  let m = keyIndex.get(orig)
  if (m === undefined) {
    const built = new Map<string, number[]>()
    orig.words.forEach((w, i) => {
      const k = strongKey(w.strong)
      const l = built.get(k)
      if (l === undefined) built.set(k, [i])
      else l.push(i)
    })
    m = new Map([...built].map(([k, l]) => [k, Int32Array.from(l)]))
    keyIndex.set(orig, m)
  }
  return m
}

type TextModel = BookModel['texts'][number]
/** CSR lists: the word ordinals aligned to original position p are `values[offsets[p]..offsets[p+1])`. */
type TextIndex = { offsets: Int32Array; values: Int32Array; pieceOf: Int32Array; at: (piece: number) => string }
const textIndexes = new WeakMap<object, TextIndex>()
/** Per text, built once: the word ordinals aligned to each original position, the piece of each ordinal, and the chapter:verse at a piece. */
function textIndex(text: TextModel): TextIndex {
  let ix = textIndexes.get(text)
  if (ix !== undefined) return ix
  const align = text.align ?? []
  let max = -1
  let n = 0
  for (const ps of align) for (const p of ps) {
    if (p > max) max = p
    n++
  }
  const offsets = new Int32Array(max + 2)
  for (const ps of align) for (const p of ps) offsets[p + 1]!++
  for (let i = 1; i < offsets.length; i++) offsets[i]! += offsets[i - 1]!
  const fill = offsets.slice(0, max + 1)
  const values = new Int32Array(n)
  align.forEach((ps, o) => {
    for (const p of ps) values[fill[p]!++] = o
  })
  const words: number[] = []
  text.pieces.forEach((piece, i) => {
    if (piece[1]) words.push(i)
  })
  // The events up to a piece, as the text is read: the last chapter and the last verse whose index is not after the piece.
  const chapters: [number, string][] = []
  const verses: [number, string][] = []
  for (const [at, kind, arg] of text.events) {
    if (kind === 'chapter') chapters.push([at, arg])
    else if (kind === 'verse') verses.push([at, arg])
  }
  const last = (list: [number, string][], piece: number): string => {
    let lo = 0
    let hi = list.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (list[mid]![0] <= piece) lo = mid + 1
      else hi = mid
    }
    return lo === 0 ? '' : list[lo - 1]![1]
  }
  ix = { offsets, values, pieceOf: Int32Array.from(words), at: (piece) => `${last(chapters, piece)}:${last(verses, piece)}` }
  textIndexes.set(text, ix)
  return ix
}

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
  // The Strong table is in the `xmap`.
  const maps = await reader.mapsOf(['xmap'])
  const found = new Map<string, { count: number; refs: string[] }>()
  const counted = new Set<string>()
  // Without the `xmap` the table cannot resolve the key: a four-digit Greek key also matches the words keyed with a 0 added.
  let alt: string | undefined
  if (maps.xmap !== undefined) {
    usedUnit(out, reader, 'xmap')
    const a = answer(maps, { kind: 'strong', key }) as { key: string; books: Record<string, Cell> }
    key = a.key
    for (const [book, c] of Object.entries(a.books)) if (c.state === 'count' || c.state === 'partial') counted.add(book)
  } else {
    missingUnit(out, { unit: 'xmap', bytes: reader.listed('xmap') ? reader.size('xmap') : 0 })
    if (/^G\d{4}$/.test(key)) alt = `${key}0`
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
    if (model.orig[1] !== orig.stamp) {
      // The positions count words of another original: they MUST NOT be used.
      missingUnit(out, { book, unit: origUnit, bytes: reader.size(origUnit), what: 'stale' })
      continue
    }
    usedUnit(out, reader, bookUnit)
    usedUnit(out, reader, origUnit)
    const byKey = positionsByKey(orig)
    const positions = new Set<number>(byKey.get(key))
    if (positions.size === 0 && alt !== undefined) for (const i of byKey.get(alt) ?? new Int32Array()) positions.add(i)
    if (positions.size === 0) continue
    for (const text of model.texts) {
      if (text.align === undefined) continue
      const ix = textIndex(text)
      // Only the words aligned to the key are visited, in the order of the text.
      const cand = new Set<number>()
      for (const p of positions) if (p + 1 < ix.offsets.length) for (let k = ix.offsets[p]!; k < ix.offsets[p + 1]!; k++) cand.add(ix.values[k]!)
      if (cand.size === 0) continue
      let used = false
      let run: { pos: number; words: string[]; ref: string; last: number } | undefined
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
      for (const ordinal of [...cand].sort((x, y) => x - y)) {
        // A malformed text can align more words than it has pieces: skip those entries.
        if (ordinal >= ix.pieceOf.length) continue
        const hit = (text.align[ordinal] ?? []).find((p) => positions.has(p))
        if (hit === undefined) continue
        const word = text.pieces[ix.pieceOf[ordinal]!]![0]
        // Words that translate the same original word, one after the other, are one rendering.
        if (run !== undefined && run.pos === hit && run.last === ordinal - 1) {
          run.words.push(word)
          run.last = ordinal
        } else {
          flush()
          run = { pos: hit, words: [word], ref: `${book} ${ix.at(ix.pieceOf[ordinal]!)}`, last: ordinal }
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
