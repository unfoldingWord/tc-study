/**
 * Book/chapter navigation guards for SCRIPTURE_TOKENS publish.
 *
 * After BCV book switches, React can still hold the previous book's prepared
 * full (same chapter number) or USJ viewModel for one or more frames. Broadcasting
 * those tokens under the new book label makes helps align fail → ol-fallback until
 * a full reload remounts scripture with a cold prepared state.
 */

import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import type { ScriptureFullChapter, ScriptureLightChapter } from './scripturePreparer'

export interface PreparedChapterTiers {
  light: ScriptureLightChapter | null
  full: ScriptureFullChapter | null
}

/**
 * Navigation SoT wins. Never prefer a lingering nav/viewModel bookCode over the
 * open reference while useContent is still clearing the previous book.
 */
export function resolveScriptureBroadcastBookCode(args: {
  currentBook?: string | null
  navBookId?: string | null
  viewModelBookCode?: string | null
}): string {
  const current = (args.currentBook || '').trim()
  if (current) return current
  return (args.navBookId || args.viewModelBookCode || '').trim()
}

/** Drop USJ from another book so extractUsjBroadcastTokens cannot run mid-nav. */
export function viewModelForScriptureBroadcast(
  viewModel: UsjScriptureViewModel | null | undefined,
  bookCode: string
): UsjScriptureViewModel | null {
  if (!viewModel || !bookCode) return null
  const vmBook = (viewModel.bookCode || '').trim()
  if (!vmBook) return null
  return vmBook.toLowerCase() === bookCode.toLowerCase() ? viewModel : null
}

/**
 * Prepared full has no bookId — only safe when the hook already resolved tiers
 * for the open book/chapter. Callers must clear React state on peek miss.
 */
export function fullChapterForScriptureBroadcast(
  fullChapter: ScriptureFullChapter | null | undefined,
  chapter: number
): ScriptureFullChapter | null {
  if (!fullChapter || chapter < 1) return null
  return fullChapter.unit === chapter ? fullChapter : null
}

/**
 * When peek misses the new book/chapter, return empty tiers so consumers never
 * keep the previous passage's prepared full across a book switch.
 */
export function preparedChapterStateAfterNavPeek(
  peeked: PreparedChapterTiers | null | undefined
): PreparedChapterTiers {
  if (peeked && (peeked.light || peeked.full)) {
    return { light: peeked.light, full: peeked.full }
  }
  return { light: null, full: null }
}

/** Fingerprint salt so wrong-book tokens with the same count still retrigger align. */
export function scriptureTokensContentStamp(
  tokens: ReadonlyArray<{ semanticId?: string; text?: string; content?: string }>
): string {
  if (!tokens.length) return '0'
  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  const firstId = first?.semanticId || first?.text || first?.content || ''
  const lastId = last?.semanticId || last?.text || last?.content || ''
  return `${tokens.length}:${firstId}:${lastId}`
}
