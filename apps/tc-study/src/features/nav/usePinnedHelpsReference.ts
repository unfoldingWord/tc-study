import { useMemo, useSyncExternalStore } from 'react'
import { useCurrentReference } from '../../contexts'
import type { BCVReference } from '../../contexts/types'
import {
  getChapterScrollActivity,
  pinReferenceWhileScrolling,
  subscribeChapterScrollActivity,
  type ChapterScrollActivity,
} from './chapterScrollActivity'

export function useChapterScrollActivity(): ChapterScrollActivity {
  return useSyncExternalStore(
    subscribeChapterScrollActivity,
    getChapterScrollActivity,
    getChapterScrollActivity
  )
}

/** Live BCV, pinned to the settled chapter while chapter-mode scroll is unsettled. */
export function usePinnedHelpsReference(): BCVReference {
  const currentRef = useCurrentReference()
  const scrollActivity = useChapterScrollActivity()
  return useMemo(
    () => pinReferenceWhileScrolling(currentRef, scrollActivity),
    [currentRef, scrollActivity]
  )
}
