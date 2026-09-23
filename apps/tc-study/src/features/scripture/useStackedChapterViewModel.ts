/**
 * Expand the focused chapter viewModel with SoT slices for every painted
 * infinite-scroll chapter so layout toggle can re-render the whole stack.
 */

import {
  viewModelFromUsjCache,
  type UsjScriptureViewModel,
} from '@bt-synergy/scripture-loader'
import { USJProcessor } from '@bt-synergy/usj-processor'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCacheAdapter } from '../../contexts'
import { getLocalSoT } from '../sot/getSoT'
import { isUsjViewModel, unwrapSoTPayload } from '../sot/sotDebug'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  chaptersMissingFromViewModel,
  mergeUsjScriptureViewModels,
} from './mergeUsjScriptureViewModels'

const usjProcessor = new USJProcessor()

function viewModelFromSoTPayload(
  payload: unknown,
  bookId: string
): UsjScriptureViewModel | null {
  if (isUsjViewModel(payload)) return payload as UsjScriptureViewModel
  return viewModelFromUsjCache(unwrapSoTPayload(payload), bookId, usjProcessor)
}

export function useStackedChapterViewModel(args: {
  viewModel: UsjScriptureViewModel | null
  resourceKey: string
  bookId: string
  /** Painted / slotted chapter numbers that must be renderable. */
  chapters: readonly number[]
  enabled?: boolean
  /** Bumps when prepared/SoT neighbors land so we retry local reads. */
  reloadToken?: string | number
}): UsjScriptureViewModel | null {
  const {
    viewModel,
    resourceKey,
    bookId,
    chapters,
    enabled = true,
    reloadToken = 0,
  } = args
  const cache = useCacheAdapter()
  const [extras, setExtras] = useState<UsjScriptureViewModel[]>([])
  const extrasBookRef = useRef(`${resourceKey}|${bookId.toLowerCase()}`)

  const missingKey = useMemo(() => {
    if (!viewModel || !enabled || !resourceKey || !bookId) return ''
    const missing = chaptersMissingFromViewModel(viewModel, chapters)
    return missing.length > 0 ? missing.join(',') : ''
  }, [viewModel, enabled, resourceKey, bookId, chapters])

  useEffect(() => {
    const bookKey = `${resourceKey}|${bookId.toLowerCase()}`
    if (extrasBookRef.current !== bookKey) {
      extrasBookRef.current = bookKey
      setExtras([])
    }
  }, [resourceKey, bookId])

  useEffect(() => {
    if (!viewModel || !enabled || !resourceKey || !bookId || !missingKey) {
      return
    }
    const missing = missingKey.split(',').map(Number).filter((n) => n >= 1)
    if (missing.length === 0) return

    let cancelled = false
    void (async () => {
      const loaded: UsjScriptureViewModel[] = []
      for (const chapter of missing) {
        if (cancelled) return
        try {
          const sot = await getLocalSoT({
            resourceKey,
            book: bookId,
            chapter,
            typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
            cache,
          })
          if (sot.status !== 'hit') continue
          const vm = viewModelFromSoTPayload(sot.payload, bookId)
          if (vm?.chapters?.length) loaded.push(vm)
        } catch {
          // Keep painting light fallbacks until SoT catches up.
        }
      }
      if (cancelled || loaded.length === 0) return
      setExtras((prev) => {
        const have = new Set(
          prev.flatMap((vm) => vm.chapters.map((chapter) => chapter.number))
        )
        const next = [...prev]
        let changed = false
        for (const vm of loaded) {
          const nums = vm.chapters.map((chapter) => chapter.number)
          if (nums.every((n) => have.has(n))) continue
          for (const n of nums) have.add(n)
          next.push(vm)
          changed = true
        }
        return changed ? next : prev
      })
    })()

    return () => {
      cancelled = true
    }
  }, [viewModel, enabled, resourceKey, bookId, missingKey, cache, reloadToken])

  return useMemo(() => {
    if (!viewModel) return null
    if (extras.length === 0) return viewModel
    // Drop extras that are already in the base (e.g. after a book remount
    // that loaded a wider slice).
    const stillMissing = chaptersMissingFromViewModel(
      viewModel,
      extras.flatMap((vm) => vm.chapters.map((chapter) => chapter.number))
    )
    if (stillMissing.length === 0) return viewModel
    const useful = extras.filter((vm) =>
      vm.chapters.some((chapter) => stillMissing.includes(chapter.number))
    )
    if (useful.length === 0) return viewModel
    return mergeUsjScriptureViewModels(viewModel, useful)
  }, [viewModel, extras])
}
