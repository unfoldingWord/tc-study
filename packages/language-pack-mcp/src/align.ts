/**
 * The words of each aligned text of a book that translate given positions of the original: a note's or a word link's
 * `quote` (positions in `orig:<book>`) read in the language's own Bible. Words next to each other join with a space; a gap
 * becomes " … ". The same rule as the renderings query of the client library, kept here as a small index per book.
 */

export type AlignedText = { res: string; words: string[]; byPos: Map<number, number[]> }

type BookModelLike = {
  texts: { res: string; pieces: [string, boolean, ...unknown[]][]; align?: number[][] }[]
}

/** One index per aligned text of the book: original position → the ordinals of the words that translate it. */
export function alignIndex(model: BookModelLike | undefined): AlignedText[] {
  const out: AlignedText[] = []
  for (const t of model?.texts ?? []) {
    if (t.align === undefined) continue
    const words: string[] = []
    const byPos = new Map<number, number[]>()
    for (const piece of t.pieces) {
      if (!piece[1]) continue
      const ordinal = words.length
      words.push(piece[0])
      for (const pos of t.align[ordinal] ?? []) {
        const list = byPos.get(pos)
        if (list === undefined) byPos.set(pos, [ordinal])
        else list.push(ordinal)
      }
    }
    out.push({ res: t.res, words, byPos })
  }
  return out
}

/** The quote in each aligned text, in text order. Texts that translate none of the positions are left out. */
export function quoteIn(texts: AlignedText[], positions: number[] | undefined): { res: string; text: string }[] {
  if (positions === undefined || positions.length === 0) return []
  const out: { res: string; text: string }[] = []
  for (const t of texts) {
    const ordinals = [...new Set(positions.flatMap((p) => t.byPos.get(p) ?? []))].sort((a, b) => a - b)
    if (ordinals.length === 0) continue
    let text = ''
    ordinals.forEach((o, i) => {
      text += (i === 0 ? '' : o === ordinals[i - 1] + 1 ? ' ' : ' … ') + t.words[o]
    })
    out.push({ res: t.res, text })
  }
  return out
}
