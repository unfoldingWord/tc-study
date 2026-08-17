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

/** Mode flip must never wipe an in-flight zip/catalog queue. */
export function shouldResetDownloadQueueOnModeSwitch(): false {
  return false
}

/** Door43 keys are `owner/lang/id` (or `owner/lang/id#n`). CombinedHelps has no lang segment. */
export function catalogKeysIncludeLanguage(
  keys: readonly string[],
  languageCode: string | null | undefined
): boolean {
  const lang = languageCode?.trim().toLowerCase()
  if (!lang) return false
  return keys.some((key) => {
    const parts = key.split('/')
    return parts.length >= 3 && parts[1]?.toLowerCase() === lang
  })
}

/**
 * First time this pane mode is needed for `languageCode` — load/enqueue that
 * catalog. If keys for that lang+mode already exist, skip (membership only).
 */
export function shouldLoadCatalogOnModeSwitch(options: {
  mode: 'scripture' | 'helps'
  languageCode: string | null | undefined
  textKeys: readonly string[]
  helpsKeys: readonly string[]
}): boolean {
  const lang = options.languageCode?.trim()
  if (!lang) return false
  const existing = options.mode === 'scripture' ? options.textKeys : options.helpsKeys
  return !catalogKeysIncludeLanguage(existing, lang)
}
