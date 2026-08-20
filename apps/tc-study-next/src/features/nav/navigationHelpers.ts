/**
 * Pure helpers for navigation store (passage-set flatten, ref normalization).
 */

import type { PassageLeaf, PassageSetNode, RefRange } from '@bt-synergy/passage-sets'
import type { BCVReference, BookInfo, NavigationMode } from '../../contexts/types'

/** Flatten passage set root to a list of BCV references for navigation */
export function flattenPassageSetToBCV(root: PassageSetNode[]): BCVReference[] {
  const out: BCVReference[] = []
  function walk(nodes: PassageSetNode[]) {
    for (const node of nodes) {
      if (node.type === 'passage') {
        const leaf = node as PassageLeaf
        for (const p of leaf.passages ?? []) {
          const ref = typeof p.ref === 'string' ? undefined : (p.ref as RefRange)
          out.push({
            book: p.bookCode,
            chapter: ref?.startChapter ?? 1,
            verse: ref?.startVerse ?? 1,
            endChapter: ref?.endChapter,
            endVerse: ref?.endVerse,
          })
        }
      }
      if (node.type === 'group' && 'children' in node) {
        walk((node as { children: PassageSetNode[] }).children)
      }
    }
  }
  walk(root)
  return out
}

/** True when two BCV references point at the same span */
export function isSameBCVReference(a: BCVReference, b: BCVReference): boolean {
  return (
    a.book === b.book &&
    a.chapter === b.chapter &&
    a.verse === b.verse &&
    a.endChapter === b.endChapter &&
    a.endVerse === b.endVerse
  )
}

/**
 * Normalize a navigation target for chapter mode / OBS before applying it.
 * Pure: does not touch store or history.
 */
export function normalizeReferenceForNavigate(
  ref: BCVReference,
  navigationMode: NavigationMode,
  getBookInfo: (bookCode: string) => BookInfo | null
): BCVReference {
  let refToUse = ref

  // In chapter mode, normalize to full chapter (verse 1 to last verse) — not for OBS
  if (navigationMode === 'chapter' && ref.book !== 'obs') {
    const bookInfo = getBookInfo(ref.book)
    if (bookInfo?.verses && ref.chapter) {
      const lastVerse = bookInfo.verses[ref.chapter - 1] ?? 1
      refToUse = {
        ...ref,
        verse: 1,
        endVerse: lastVerse,
      }
    }
  }

  if (refToUse.book === 'obs') {
    // Preserve range fields so cross-story selections survive navigation.
    // Fall back to 1 for chapter/verse to guard against undefined/NaN values
    // that would permanently disable the navigation arrows.
    refToUse = {
      book: 'obs',
      chapter: refToUse.chapter || 1,
      verse: refToUse.verse || 1,
      ...(refToUse.endChapter != null && refToUse.endChapter >= 1
        ? { endChapter: refToUse.endChapter }
        : {}),
      ...(refToUse.endVerse != null && refToUse.endVerse >= 1
        ? { endVerse: refToUse.endVerse }
        : {}),
    }
  }

  return refToUse
}

/**
 * When the book catalog shrinks (e.g. language switch to a partial GL Bible),
 * return the first available book if the current one is no longer present.
 * Returns null when no navigation change is needed.
 */
export function fallbackBookIfUnavailable(
  currentBook: string,
  books: Array<{ code: string }>
): string | null {
  if (!books.length) return null
  if (currentBook === 'obs') return null
  if (books.some((b) => b.code === currentBook)) return null
  return books[0]!.code
}

/** Normalize + snap off books missing from the scripture catalog. */
export function coerceReferenceToAvailableBooks(
  ref: BCVReference,
  books: Array<{ code: string }>,
  navigationScope: string,
  navigationMode: NavigationMode,
  getBookInfo: (bookCode: string) => BookInfo | null
): BCVReference {
  const refToUse = normalizeReferenceForNavigate(ref, navigationMode, getBookInfo)
  if (navigationScope !== 'scripture') return refToUse
  const snap = fallbackBookIfUnavailable(refToUse.book, books)
  if (!snap) return refToUse
  return normalizeReferenceForNavigate(
    { book: snap, chapter: 1, verse: 1 },
    navigationMode,
    getBookInfo
  )
}
