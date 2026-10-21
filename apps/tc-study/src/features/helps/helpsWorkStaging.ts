/**
 * Priority window for helps quote-build / align staging.
 *
 * Visible rows (from the current verse) run first; the rest defer to idle
 * so the main thread stays free and underlines complete a beat later.
 */

export const HELPS_PRIORITY_ROWS = 16

/** Below this, a worker round-trip costs more than the work — stay sync. */
export const HELPS_SYNC_MAX_LINKS = 8

function verseOfReference(reference: string): number {
  const parts = reference.split(':')
  const verse = parseInt(parts[1] || '1', 10)
  return Number.isFinite(verse) ? verse : 1
}

/**
 * Split links into a priority window (at/after startVerse, then wrap earlier)
 * and deferred remainder. Preserves original relative order within each bucket.
 */
export function partitionHelpsWork<T extends { reference: string }>(
  links: readonly T[],
  opts: { startVerse: number; priorityRows?: number }
): { priority: T[]; deferred: T[] } {
  const priorityRows = opts.priorityRows ?? HELPS_PRIORITY_ROWS
  if (links.length === 0 || priorityRows <= 0) {
    return { priority: [], deferred: [...links] }
  }
  if (links.length <= priorityRows) {
    return { priority: [...links], deferred: [] }
  }

  const startVerse = Number.isFinite(opts.startVerse) && opts.startVerse > 0 ? opts.startVerse : 1
  const atOrAfter: T[] = []
  const before: T[] = []
  for (const link of links) {
    if (verseOfReference(link.reference) >= startVerse) atOrAfter.push(link)
    else before.push(link)
  }

  const priority: T[] = []
  for (const link of atOrAfter) {
    if (priority.length >= priorityRows) break
    priority.push(link)
  }
  for (const link of before) {
    if (priority.length >= priorityRows) break
    priority.push(link)
  }

  const priorityIds = new Set(priority)
  const deferred = links.filter((link) => !priorityIds.has(link))
  return { priority, deferred }
}
