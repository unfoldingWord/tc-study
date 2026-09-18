import type { ReferenceState } from '../../../../contexts/types-only'

export function chaptersForRef(currentRef: Pick<ReferenceState, 'chapter' | 'endChapter'>): number[] {
  const start = currentRef.chapter
  const end = currentRef.endChapter || start
  const list: number[] = []
  for (let chapter = start; chapter <= end; chapter++) list.push(chapter)
  return list
}

export function includeVerseForRef(
  currentRef: Pick<ReferenceState, 'chapter' | 'endChapter' | 'verse' | 'endVerse'>
): (chapter: number, verse: number) => boolean {
  const startChapter = currentRef.chapter
  const endChapter = currentRef.endChapter || startChapter
  const startVerse = currentRef.verse
  const endVerse =
    currentRef.endVerse || (startChapter === endChapter ? startVerse : undefined)

  return (chapter: number, verse: number) => {
    let chapterStart = 1
    let chapterEnd = 999
    if (chapter === startChapter) chapterStart = startVerse
    if (chapter === endChapter && endVerse !== undefined) chapterEnd = endVerse
    return verse >= chapterStart && verse <= chapterEnd
  }
}
