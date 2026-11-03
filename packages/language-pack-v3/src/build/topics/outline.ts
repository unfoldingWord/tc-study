/**
 * The outline of a tN book introduction (`front:intro`), as sections of the book. English tN writes each entry as a
 * list item ending in a range: `(1:1–4:31)`, `([1:1–16](../01/01.md))`, `(chapters 7–12)` or `(chapter 3)`.
 * English books and numbering are those of the UHB: no conversion. A whole chapter ends at the verse given by the
 * required `lastVerse(book, chapter)`; the repository has no verse-count table, so the xtopics builder must pass the
 * UHB chapter lengths. No Node module is used.
 */
import { unescapeTsv, verseId } from '../../ids'

type LastVerse = (book: string, chapter: number) => number | undefined

const DASH = '[-‐-―]'
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/
const TAIL = /\(\s*([^()]*?)\s*\)\s*[.:;]?\s*$/
const CH_RANGE = new RegExp(`^chapters?\\s+(\\d+)(?:\\s*${DASH}\\s*(\\d+))?$`, 'i')
const VERSES = new RegExp(`^(\\d+):(\\d+)(?:\\s*${DASH}\\s*(?:(\\d+):)?(\\d+))?$`)

/** `[text](url)` to `text`, emphasis marks removed. */
function plain(s: string): string {
  return s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]{1,3}/g, '')
}

function lastOf(book: string, chapter: number, lastVerse: LastVerse): number {
  const v = lastVerse(book, chapter)
  return v !== undefined && Number.isInteger(v) && v >= 1 && v <= 999 ? v : -1
}

/**
 * The entries of the "Outline" section (the first heading with the word Outline or Esquema, up to the next heading of the same
 * or a higher level) that end with a range. An entry whose range cannot be read, or that has none, is described in
 * `issues` and left out; a missing Outline section is reported too. TSV escapes (backslash-n and
 * `<br>`) in the text are line breaks, as in the stored notes.
 */
export function outlineOf(
  introMarkdown: string,
  book: string,
  issues: string[],
  lastVerse: LastVerse,
): { title: string; from: number; to: number }[] {
  const out: { title: string; from: number; to: number }[] = []
  let level = 0
  let found = false
  for (const line of unescapeTsv(introMarkdown).split(/\r?\n/)) {
    const h = HEADING.exec(line)
    if (!found) {
      if (h && /outline|esquema/i.test(h[2])) {
        found = true
        level = h[1].length
      }
      continue
    }
    if (h) {
      if (h[1].length <= level) break
      continue
    }
    const it = ITEM.exec(line)
    if (!it) {
      // A line that is not a list item but ends in a parenthesised range is an entry the builder cannot take
      const tail = TAIL.exec(line)
      if (tail && /\d+:\d+|chapters?\s+\d/i.test(tail[1])) issues.push(`outline ${book}: not a list item: ${JSON.stringify(line.trim())}`)
      continue
    }
    // A label after the range, "(3:1–24) - promise" in the English Genesis outline, is not part of the entry
    const text = plain(it[1]).trim().replace(/\)\s+[-–—]\s+\p{L}[\p{L} ]*$/u, ')')
    const t = TAIL.exec(text)
    if (!t) {
      issues.push(`outline ${book}: no range in ${JSON.stringify(text)}`)
      continue
    }
    const title = text
      .slice(0, t.index)
      .trim()
      .replace(/[\s.:;,]+$/, '')
    try {
      const r = rangeOf(book, t[1].replace(/\s+/g, ' ').replace(/(\d)[a-c](?![A-Za-z])/g, '$1'), lastVerse)
      if (r === null) issues.push(`outline ${book}: cannot read the range of ${JSON.stringify(text)}`)
      else if (r[1] < r[0]) issues.push(`outline ${book}: range runs backwards in ${JSON.stringify(text)}`)
      else out.push({ title, from: r[0], to: r[1] })
    } catch (e) {
      issues.push(`outline ${book}: ${(e as Error).message} in ${JSON.stringify(text)}`)
    }
  }
  if (!found) issues.push(`outline ${book}: no Outline section`)
  return out
}

function rangeOf(book: string, s: string, lastVerse: LastVerse): [number, number] | null {
  const c = CH_RANGE.exec(s)
  if (c) {
    const c1 = Number(c[1])
    const c2 = c[2] === undefined ? c1 : Number(c[2])
    const last = lastOf(book, c2, lastVerse)
    if (last < 0) throw new Error(`no last verse for ${book} ${c2}`)
    return [verseId(book, c1, 1), verseId(book, c2, last)]
  }
  const v = VERSES.exec(s)
  if (!v) return null
  const c1 = Number(v[1])
  const v1 = Number(v[2])
  if (v[4] === undefined) return [verseId(book, c1, v1), verseId(book, c1, v1)]
  const c2 = v[3] === undefined ? c1 : Number(v[3])
  return [verseId(book, c1, v1), verseId(book, c2, Number(v[4]))]
}

/**
 * The id of a section: `sec:{book}/{c}-{c}` when the range is whole chapters (it starts at verse 1 and ends at the
 * last verse of its chapter, given by the required `lastVerse`; one chapter is `7-7`), else
 * `sec:{book}/{c}.{v}-{c}.{v}`. Throws `RangeError` when an id is not in the book or the range runs backwards.
 */
export function sectionId(book: string, from: number, to: number, lastVerse: LastVerse): string {
  const base = verseId(book, 0, 0)
  const split = (id: number): [number, number] => {
    const rest = id - base
    if (rest < 0 || rest >= 1_000_000) throw new RangeError(`id ${id} is not in ${book}`)
    return [Math.floor(rest / 1000), rest % 1000]
  }
  const [c1, v1] = split(from)
  const [c2, v2] = split(to)
  if (from > to) throw new RangeError(`the range ${from}-${to} runs backwards`)
  if (v1 === 1 && v2 === lastVerse(book, c2)) return `sec:${book}/${c1}-${c2}`
  return `sec:${book}/${c1}.${v1}-${c2}.${v2}`
}
