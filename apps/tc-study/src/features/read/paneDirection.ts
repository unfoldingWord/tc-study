/**
 * Per-pane text direction (issue #24). Nav chrome follows the text language;
 * each pane sets its own `dir` so RTL text + LTR helps (and inverse) can coexist.
 */

import { getLanguageDirection } from '../../utils/languageDirection'
import type { RtlLanguageListEntry } from '../nav/resolveNavigationBarRtl'

export function resolvePaneDirection(options: {
  languageCode: string | null | undefined
  availableLanguages: readonly RtlLanguageListEntry[]
  /** Catalog/resource metadata dir, if known (wins over list + known codes). */
  catalogDirection?: 'ltr' | 'rtl' | null
}): 'ltr' | 'rtl' {
  const code = options.languageCode?.trim() || ''
  const catalog =
    options.catalogDirection === 'rtl' || options.catalogDirection === 'ltr'
      ? options.catalogDirection
      : null
  if (!code) return catalog ?? 'ltr'
  const listDir = options.availableLanguages.find((l) => l.code === code)?.direction
  const normalized = listDir === 'rtl' || listDir === 'ltr' ? listDir : null
  return getLanguageDirection(catalog, normalized, code)
}

/**
 * Helps/notes list `dir` follows the helps resource, never target scripture.
 * Arabic text + English helps → ltr helps UI (issue #24).
 */
export function resolveHelpsViewerDirection(options: {
  resourceDirection: 'ltr' | 'rtl'
  /** Ignored for UI dir — quote/token matching may still use scripture metadata. */
  targetScriptureDirection?: 'ltr' | 'rtl' | null
}): 'ltr' | 'rtl' {
  return options.resourceDirection
}
