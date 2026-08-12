/**
 * Authoritative linked-panels identity helpers.
 *
 * Contract (frozen for Viewer / CombinedHelps / QuoteMatcher):
 *   semanticId = `${verseRef}:${content}:${occurrence}`
 *
 * - content = inflected Unicode surface from USJ `\w` (`char` marker `w`), NOT lemma
 * - occurrence = verse-wide, 1-based, counted case-insensitively on content
 * - Matching consumers MUST compare case-insensitively (`.toLowerCase()`)
 * - uniqueId / DOM data attrs are NOT the highlight match key
 */

/** Canonical semantic ID for a word token or alignment source. */
export function semanticIdFor(
  verseRef: string,
  content: string,
  occurrence: number
): string {
  return `${verseRef}:${content}:${occurrence}`
}

/**
 * Remap USJ verse refs (typically uppercase book from `sid`) to the caller bookCode
 * so verse.reference and alignment.verseRef match across Door43 lowercase ingredients.
 */
export function remapVerseRefBookCode(verseRef: string, bookCode: string): string {
  const m = verseRef.match(/^(\S+)\s+(\d+:\d+)$/)
  if (!m) return verseRef
  if (m[1].toLowerCase() !== bookCode.toLowerCase()) return verseRef
  return `${bookCode} ${m[2]}`
}

export interface SurfaceOccurrence {
  content: string
  occurrence: number
  totalOccurrences: number
}

/**
 * Assign verse-wide 1-based occurrences (case-insensitive) to a list of surfaces.
 * Order is preserved — this is how USJ `\w` walk order becomes WordToken order.
 */
export function assignSurfaceOccurrences(surfaces: string[]): SurfaceOccurrence[] {
  const totals = new Map<string, number>()
  for (const s of surfaces) {
    const key = s.toLowerCase()
    totals.set(key, (totals.get(key) || 0) + 1)
  }

  const seen = new Map<string, number>()
  return surfaces.map((content) => {
    const key = content.toLowerCase()
    const occurrence = (seen.get(key) || 0) + 1
    seen.set(key, occurrence)
    return {
      content,
      occurrence,
      totalOccurrences: totals.get(key) || 1,
    }
  })
}

/** Case-insensitive semantic ID for set membership / matching. */
export function semanticIdKey(semanticId: string): string {
  return semanticId.toLowerCase()
}
