/**
 * Remember CombinedHelps kindFilter while a book-wide TA/TWL chip is active,
 * then restore it when that chip is cleared.
 */

import { useCallback, useRef } from 'react'
import type { HelpsKindFilter } from './types'

export type BookKindRestore = {
  remembered: HelpsKindFilter | null
}

export const EMPTY_BOOK_KIND_RESTORE: BookKindRestore = { remembered: null }

export function enterBookKindFilter(
  restore: BookKindRestore,
  currentKind: HelpsKindFilter,
  forced: 'notes' | 'twl'
): { restore: BookKindRestore; kindFilter: HelpsKindFilter } {
  return {
    restore: { remembered: restore.remembered ?? currentKind },
    kindFilter: forced,
  }
}

/** `kindFilter` is null when no book-scope chip was active — callers must not stomp kind. */
export function restoreBookKindFilter(
  restore: BookKindRestore
): { restore: BookKindRestore; kindFilter: HelpsKindFilter | null } {
  if (restore.remembered === null) {
    return { restore, kindFilter: null }
  }
  return {
    restore: EMPTY_BOOK_KIND_RESTORE,
    kindFilter: restore.remembered,
  }
}

export function useHelpsKindFilterRestore(
  kindFilter: HelpsKindFilter,
  setKindFilter: (kind: HelpsKindFilter) => void
) {
  const restoreRef = useRef<BookKindRestore>(EMPTY_BOOK_KIND_RESTORE)
  const kindRef = useRef(kindFilter)
  kindRef.current = kindFilter

  const enterBookKind = useCallback(
    (forced: 'notes' | 'twl') => {
      const next = enterBookKindFilter(restoreRef.current, kindRef.current, forced)
      restoreRef.current = next.restore
      setKindFilter(next.kindFilter)
    },
    [setKindFilter]
  )

  const restoreBookKind = useCallback(() => {
    const next = restoreBookKindFilter(restoreRef.current)
    restoreRef.current = next.restore
    if (next.kindFilter !== null) setKindFilter(next.kindFilter)
  }, [setKindFilter])

  return { enterBookKind, restoreBookKind }
}
