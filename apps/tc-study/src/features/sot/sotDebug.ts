/**
 * Test / e2e hook: last lane-1 SoT resolve (IDB vs one DCS file).
 */

export type SoTDebugInfo = {
  source: 'idb' | 'dcs' | 'missing'
  typeId: string
  book: string
  chapter?: number
}

export function publishSoTDebug(info: SoTDebugInfo): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __sotDebug?: SoTDebugInfo }).__sotDebug = info
}

/**
 * True only for a loader viewModel (`chapters[].verses`).
 * Processed `scripture-usj` rows have `chapters[].content` / `usj` — not this.
 */
export function isUsjViewModel(
  payload: unknown
): payload is { chapters: Array<{ number: number; verses: unknown[] }> } {
  if (!payload || typeof payload !== 'object') return false
  const chapters = (payload as { chapters?: unknown }).chapters
  if (!Array.isArray(chapters) || chapters.length === 0) return false
  return chapters.every((ch) => {
    if (!ch || typeof ch !== 'object') return false
    const row = ch as { number?: unknown; verses?: unknown }
    return typeof row.number === 'number' && Array.isArray(row.verses)
  })
}

export function unwrapSoTPayload(payload: unknown): unknown {
  if (
    payload &&
    typeof payload === 'object' &&
    'content' in payload &&
    !('notes' in payload) &&
    !('links' in payload) &&
    !('chapters' in payload)
  ) {
    return (payload as { content: unknown }).content
  }
  return payload
}
