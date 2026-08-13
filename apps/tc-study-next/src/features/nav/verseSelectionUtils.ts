export type VerseEntry = { chapter: number; verse: number; key: string }

export function buildVersesFromCounts(verseCounts: number[] | undefined): VerseEntry[] {
  const verses: VerseEntry[] = []
  if (!verseCounts) return verses
  verseCounts.forEach((verseCount, chapterIndex) => {
    const chapter = chapterIndex + 1
    for (let verse = 1; verse <= verseCount; verse++) {
      verses.push({
        chapter,
        verse,
        key: `${chapter}:${verse}`,
      })
    }
  })
  return verses
}

export function groupVersesByChapter(verses: VerseEntry[]): Record<number, VerseEntry[]> {
  return verses.reduce(
    (acc, v) => {
      if (!acc[v.chapter]) acc[v.chapter] = []
      acc[v.chapter].push(v)
      return acc
    },
    {} as Record<number, VerseEntry[]>
  )
}

export function isVerseSelected(
  verseKey: string,
  startVerse: string | null,
  endVerse: string | null
): boolean {
  if (!startVerse) return false
  if (!endVerse) return verseKey === startVerse

  const [startC, startV] = startVerse.split(':').map(Number)
  const [endC, endV] = endVerse.split(':').map(Number)
  const [currentC, currentV] = verseKey.split(':').map(Number)

  const actualStart =
    startC < endC || (startC === endC && startV <= endV) ? { c: startC, v: startV } : { c: endC, v: endV }
  const actualEnd =
    startC < endC || (startC === endC && startV <= endV) ? { c: endC, v: endV } : { c: startC, v: startV }

  if (currentC < actualStart.c || currentC > actualEnd.c) return false
  if (currentC === actualStart.c && currentV < actualStart.v) return false
  if (currentC === actualEnd.c && currentV > actualEnd.v) return false
  return true
}

export function getVerseSelectionCount(
  verses: VerseEntry[],
  startVerse: string | null,
  endVerse: string | null
): number {
  if (!startVerse) return 0
  if (!endVerse) return 1

  let count = 0
  verses.forEach((v) => {
    if (isVerseSelected(v.key, startVerse, endVerse)) count++
  })
  return count
}
