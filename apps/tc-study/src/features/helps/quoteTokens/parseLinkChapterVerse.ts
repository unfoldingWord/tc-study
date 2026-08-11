/**
 * Parse chapter:verse from TN/TWL reference strings (e.g. "3:5", "3:1-2", "1:intro").
 */
export function parseLinkChapterVerse(reference: string): { chapter: number; verse: number } {
  const [chapterStr, versePart = '1'] = reference.split(':')
  const chapter = parseInt(chapterStr || '1', 10) || 1
  let v = versePart
  if (v.includes('-')) {
    v = v.split('-')[0] ?? '1'
  }
  if (v === 'intro') {
    v = '1'
  }
  const verse = parseInt(v, 10) || 1
  return { chapter, verse }
}
