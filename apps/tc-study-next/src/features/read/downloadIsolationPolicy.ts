/**
 * Dual-pane download isolation (epic W11 / issue #24).
 *
 * Today's worker is a single queue: starting a new run while busy is a no-op,
 * and stopDownload cancels *everything*. Cancel only when the switched pane
 * has in-flight keys and the other pane does not.
 */

export type DownloadPane = 'text' | 'helps'

export function shouldCancelDownloadsOnPaneSwitch(options: {
  queue: readonly string[]
  switchedPane: DownloadPane
  textKeys: readonly string[]
  helpsKeys: readonly string[]
}): boolean {
  if (options.queue.length === 0) return false
  // First dual-load: we don't yet know which keys belong where — don't cancel.
  if (options.textKeys.length === 0 && options.helpsKeys.length === 0) return false

  const textSet = new Set(options.textKeys)
  const helpsSet = new Set(options.helpsKeys)
  const switchedSet = options.switchedPane === 'text' ? textSet : helpsSet
  const otherSet = options.switchedPane === 'text' ? helpsSet : textSet

  const hasOther = options.queue.some((key) => otherSet.has(key))
  if (hasOther) return false

  return options.queue.some((key) => switchedSet.has(key))
}

/** Composite scope so either pane change can re-enqueue without sharing one language token. */
export function downloadResetToken(
  textLanguageCode: string | null | undefined,
  helpsLanguageCode: string | null | undefined
): string {
  return `${textLanguageCode || ''}|${helpsLanguageCode || ''}`
}
