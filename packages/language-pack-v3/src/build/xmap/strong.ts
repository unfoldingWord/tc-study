import { strongKey, verseId } from '../../ids'
import type { OrigModel } from '../../model'
import { Tally } from '../maps/tally'

/** Occurrences and verses of each Strong number in the original, one `add` per word that has one. */
export function strongTally(orig: OrigModel): Tally {
  const tally = new Tally('occurrences')
  const verseOfWord = wordVerses(orig)
  orig.words.forEach((word, i) => {
    if (word.strong === '') return
    tally.add(strongKey(word.strong), orig.book, [verseOfWord[i]])
  })
  return tally
}

/** The verse id each word is in; words before the first verse of a chapter are in verse 0 of it. */
function wordVerses(orig: OrigModel): number[] {
  const out: number[] = []
  let chapter = 0
  let verse = 0
  let e = 0
  const { events } = orig
  orig.pieces.forEach(([, isWord], p) => {
    while (e < events.length && events[e][0] <= p) {
      const [, kind, arg] = events[e++]
      const n = /^\d+/.exec(arg)
      if (n === null) continue
      if (kind === 'chapter') {
        chapter = Number(n[0])
        verse = 0
      } else if (kind === 'verse') verse = Number(n[0])
    }
    if (isWord) out.push(verseId(orig.book, chapter, verse))
  })
  return out
}
