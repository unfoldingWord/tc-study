/**
 * Parse Door43 TN/TWL `Reference` + `&`-split `Quote` strings.
 *
 * References:
 *   5:1           single verse
 *   5:2-3         contiguous range (same chapter)
 *   5:1,3,8,12    discontinuous verses
 *   5:1-2,8       mixed range + list
 *   1:intro       book/chapter intro (not a verse)
 *
 * Quotes: `&` joins discontinuous original-language snippets. Matching is an
 * occurrence walk on the merged listed-verse stream (not 1:1 part→verse).
 */

export interface HelpsVerseRef {
  chapter: number
  verse: number
}

export interface ParsedHelpsReference {
  chapter: number
  verses: HelpsVerseRef[]
  isIntro: boolean
  /** Psalm superscription / pre-verse (`5:front`, `5:0`). Quotes search verse 1. */
  isFront: boolean
  isDiscontinuous: boolean
  isRange: boolean
}

const QUOTE_SPLIT_RE = /\s*&\s*/u

export function splitHelpsQuote(quote: string): string[] {
  return quote
    .split(QUOTE_SPLIT_RE)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function isFrontMatterVerse(part: string): boolean {
  const normalized = part.trim().toLowerCase()
  return normalized === 'front' || normalized === '0'
}

function expandVerseChunk(chapter: number, chunk: string): HelpsVerseRef[] {
  const trimmed = chunk.trim()
  if (!trimmed) return []
  if (trimmed.includes('-')) {
    const [startRaw, endRaw] = trimmed.split('-')
    const start = parsePositiveInt(startRaw, 0)
    const end = parsePositiveInt(endRaw, start)
    if (start < 1) return []
    const lo = Math.min(start, end)
    const hi = Math.max(start, end)
    const verses: HelpsVerseRef[] = []
    for (let verse = lo; verse <= hi; verse++) {
      verses.push({ chapter, verse })
    }
    return verses
  }
  const verse = parsePositiveInt(trimmed, 0)
  return verse > 0 ? [{ chapter, verse }] : []
}

export function parseHelpsReference(reference: string): ParsedHelpsReference {
  const trimmed = String(reference || '').trim()
  const colon = trimmed.indexOf(':')
  const chapter = parsePositiveInt(colon < 0 ? trimmed : trimmed.slice(0, colon), 1)
  const versePart = colon < 0 ? '' : trimmed.slice(colon + 1).trim()

  if (!versePart || versePart.toLowerCase() === 'intro' || isFrontMatterVerse(versePart)) {
    const isIntro = versePart.toLowerCase() === 'intro'
    const isFront = isFrontMatterVerse(versePart)
    return {
      chapter,
      verses: isIntro ? [] : [{ chapter, verse: 1 }],
      isIntro,
      isFront,
      isDiscontinuous: false,
      isRange: false,
    }
  }

  const chunks = versePart.split(',').map((c) => c.trim()).filter(Boolean)
  const verses = chunks.flatMap((chunk) => expandVerseChunk(chapter, chunk))
  const unique: HelpsVerseRef[] = []
  const seen = new Set<string>()
  for (const v of verses) {
    const key = `${v.chapter}:${v.verse}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(v)
  }

  const hasComma = chunks.length > 1
  const hasDash = chunks.some((c) => c.includes('-'))
  return {
    chapter,
    verses: unique.length > 0 ? unique : [{ chapter, verse: 1 }],
    isIntro: false,
    isFront: false,
    isDiscontinuous: hasComma,
    isRange: hasDash && !hasComma,
  }
}

/** First chapter:verse — sort, navigate, and legacy callers. */
export function firstHelpsVerse(reference: string): HelpsVerseRef {
  const parsed = parseHelpsReference(reference)
  return parsed.verses[0] ?? { chapter: parsed.chapter, verse: 1 }
}

/** Compact header: `5:1, 3, 8, 12` and `5:2–3`. */
export function formatHelpsChapterVerseLabel(reference: string): string {
  const trimmed = String(reference || '').trim()
  const colon = trimmed.indexOf(':')
  if (colon < 0) return trimmed
  const chapter = trimmed.slice(0, colon).trim()
  const versePart = trimmed.slice(colon + 1).trim()
  if (!versePart || versePart.toLowerCase() === 'intro') return trimmed
  const chunks = versePart.split(',').map((c) => c.trim()).filter(Boolean)
  const formatted = chunks.map((chunk) => {
    if (!chunk.includes('-')) return chunk
    const [start, end] = chunk.split('-')
    if (!start?.trim() || !end?.trim()) return chunk
    return `${start.trim()}–${end.trim()}`
  })
  return `${chapter}:${formatted.join(', ')}`
}

export function helpsReferenceCoversVerse(
  reference: string,
  chapter: number,
  verse: number
): boolean {
  const parsed = parseHelpsReference(reference)
  if (parsed.isIntro) return false
  return parsed.verses.some((v) => v.chapter === chapter && v.verse === verse)
}

export function helpsReferenceOverlapsRange(
  reference: string,
  range: { startChapter: number; startVerse: number; endChapter: number; endVerse: number }
): boolean {
  const parsed = parseHelpsReference(reference)
  if (parsed.isIntro) {
    return (
      parsed.chapter >= range.startChapter &&
      parsed.chapter <= range.endChapter &&
      (parsed.chapter !== range.startChapter || range.startVerse <= 1) &&
      (parsed.chapter !== range.endChapter || range.endVerse >= 1)
    )
  }
  return parsed.verses.some((v) => {
    if (v.chapter < range.startChapter || v.chapter > range.endChapter) return false
    if (v.chapter === range.startChapter && v.verse < range.startVerse) return false
    if (v.chapter === range.endChapter && v.verse > range.endVerse) return false
    return true
  })
}
