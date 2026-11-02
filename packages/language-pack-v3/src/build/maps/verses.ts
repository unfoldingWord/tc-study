import { verseId } from '../../ids'
import type { OrigModel } from '../../model'

/** The first number of a chapter or verse as published (`"1"`, `"1-2"`), or `undefined` if there is none. */
function firstNumber(arg: string): number | undefined {
  const m = /^\d+/.exec(arg)
  return m === null ? undefined : Number(m[0])
}

/**
 * Every verse id of the original, in order: verse 0 of the book, and verse 0 of each chapter that has text before its
 * first verse, then the verses.
 */
export function versesOf(orig: OrigModel): number[] {
  const out: number[] = [verseId(orig.book, 0, 0)]
  let chapter = 0
  // Whether a piece has been seen since the last chapter event with no verse yet.
  let pendingChapter = -1
  let piecesSeen = 0
  const flushIntro = (upTo: number): void => {
    if (pendingChapter > 0 && upTo > piecesSeen) out.push(verseId(orig.book, pendingChapter, 0))
    pendingChapter = -1
  }
  for (const [position, kind, arg] of orig.events) {
    if (kind === 'chapter') {
      flushIntro(position)
      const n = firstNumber(arg)
      if (n === undefined) continue
      chapter = n
      pendingChapter = n
      piecesSeen = position
    } else if (kind === 'verse') {
      flushIntro(position)
      const n = firstNumber(arg)
      if (n !== undefined) out.push(verseId(orig.book, chapter, n))
    }
  }
  flushIntro(orig.pieces.length)
  return out
}

/** The ids of `verses` with `from <= v <= to`; for `from === to` with verse number 0, `[from]`. */
export function expandRange(verses: readonly number[], from: number, to: number): number[] {
  if (from === to && from % 1000 === 0) return [from]
  return verses.filter((v) => v >= from && v <= to)
}
