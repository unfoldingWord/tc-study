import { useEffect, useRef, useState } from 'react'
import type { BCVReference } from '../../contexts'
import { useAppStore, useBookTitleSource } from '../../contexts/AppContext'
import type { ParsedObsStory } from '../../lib/obs/parseObsMarkdown'
import {
  buildBookInfosFromIngredients,
  getScriptureResources,
} from './bcvNavHelpers'
import type { NavigationStore } from './navigationTypes'

/**
 * Catalog / content refresh for BCV navigator (scripture books + OBS frames).
 */
export function useBcvNavigatorCatalog(options: {
  pickerScope: 'scripture' | 'obs'
  pickerObsMode: 'chapter' | 'verse'
  scripturePickerMode: string
  obsCatalogKey: string | null
  obsStoryIds: number[]
  selectedObsStory: number | null
  step: 1 | 2
  currentRef: BCVReference
  /** URL / Read language — forces book-list refresh across language switches. */
  preferLanguage?: string
  catalogManager: {
    getResourceMetadata: (key: string) => Promise<{
      contentMetadata?: { ingredients?: Array<{ identifier?: string; title?: string }> }
    } | null>
    loadContent: (key: string, id: string) => Promise<unknown>
  }
  navigation: NavigationStore
}) {
  const {
    pickerScope,
    pickerObsMode,
    scripturePickerMode,
    obsCatalogKey,
    obsStoryIds,
    selectedObsStory,
    step,
    currentRef,
    preferLanguage,
    catalogManager,
    navigation,
  } = options

  const loadedResources = useAppStore((s) => s.loadedResources)
  const bookTitleSource = useBookTitleSource()
  const [obsLoadingStories, setObsLoadingStories] = useState<Set<number>>(new Set())
  const [navigatorRefreshTick, setNavigatorRefreshTick] = useState(0)

  const navigationActionsRef = useRef(navigation)
  useEffect(() => {
    navigationActionsRef.current = navigation
  })

  const lastBookKeysSig = useRef<string>('')

  useEffect(() => {
    setNavigatorRefreshTick((t) => t + 1)
  }, [pickerScope, pickerObsMode, scripturePickerMode])

  useEffect(() => {
    if (pickerScope !== 'scripture') return
    const scriptureResources = getScriptureResources(loadedResources, preferLanguage)
    if (!scriptureResources.length) return

    const preferredKey = bookTitleSource?.key ?? bookTitleSource?.id
    const ordered = preferredKey
      ? [
          ...scriptureResources.filter((r) => (r.key ?? r.id) === preferredKey),
          ...scriptureResources.filter((r) => (r.key ?? r.id) !== preferredKey),
        ]
      : scriptureResources

    let cancelled = false
    void (async () => {
      try {
        const lists = await Promise.all(
          ordered.map(async (r) => {
            if (r.verifiedIngredients && r.verifiedIngredients.length > 0) {
              return r.verifiedIngredients
            }
            const k = r.key ?? r.id
            try {
              const metadata = await catalogManager.getResourceMetadata(k)
              return metadata?.contentMetadata?.ingredients ?? []
            } catch (e) {
              console.warn('[BCVNavigator] metadata fetch failed for', k, e)
              return []
            }
          })
        )
        if (cancelled) return
        const allIngredients = lists.flat()
        if (!allIngredients.length) return
        const books = buildBookInfosFromIngredients(allIngredients)
        if (!books.length) return
        // Include language + titles so en→es-419 refreshes even when book codes match
        const lang = (preferLanguage || '').toLowerCase()
        const sig = `${lang}|${books.map((b) => `${b.code}:${b.name}`).join(',')}`
        if (sig === lastBookKeysSig.current) return
        lastBookKeysSig.current = sig
        navigationActionsRef.current.setAvailableBooks(books)
      } catch (e) {
        console.warn('[BCVNavigator] Scripture catalog refresh failed:', e)
      }
    })()
    return () => {
      cancelled = true
    }
     
  }, [
    pickerScope,
    scripturePickerMode,
    navigatorRefreshTick,
    bookTitleSource,
    loadedResources,
    catalogManager,
    preferLanguage,
  ])

  useEffect(() => {
    if (pickerScope !== 'obs' || !obsCatalogKey) return
    let cancelled = false
    void (async () => {
      try {
        const metadata = await catalogManager.getResourceMetadata(obsCatalogKey)
        if (cancelled || !metadata?.contentMetadata?.ingredients?.length) return
        const ing = metadata.contentMetadata.ingredients
        useAppStore.setState((state) => {
          for (const id of Object.keys(state.loadedResources)) {
            const r = state.loadedResources[id]
            if (!r) continue
            const k = r.key ?? id
            if (k !== obsCatalogKey) continue
            r.ingredients = ing as typeof r.ingredients
            break
          }
        })
      } catch (e) {
        console.warn('[BCVNavigator] OBS catalog refresh failed:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pickerScope, pickerObsMode, navigatorRefreshTick, obsCatalogKey, catalogManager])

  useEffect(() => {
    if (step !== 2 || pickerScope !== 'obs' || !selectedObsStory || !obsCatalogKey) {
      return
    }
    let cancelled = false
    void catalogManager
      .loadContent(obsCatalogKey, String(selectedObsStory))
      .then((content) => {
        if (cancelled) return
        const parsed = content as ParsedObsStory
        navigationActionsRef.current.setObsStoryFrameCount(selectedObsStory, parsed.frames.length)
      })
      .catch(() => {
        // Frame count falls back to cached navigation.obsFrameCountByStory when load fails.
      })
    return () => {
      cancelled = true
    }
     
  }, [step, pickerScope, selectedObsStory, obsCatalogKey, catalogManager, navigatorRefreshTick])

  useEffect(() => {
    if (pickerScope !== 'obs' || pickerObsMode !== 'verse' || !obsCatalogKey) return

    const currentStory = currentRef.book === 'obs' ? currentRef.chapter : 1
    const neighbors = obsStoryIds.filter((s) => Math.abs(s - currentStory) <= 5)
    neighbors.forEach((storyNum) => {
      setObsLoadingStories((prev) => new Set([...prev, storyNum]))
      void catalogManager
        .loadContent(obsCatalogKey, String(storyNum))
        .then((content) => {
          const parsed = content as ParsedObsStory
          navigationActionsRef.current.setObsStoryFrameCount(storyNum, parsed.frames.length)
        })
        .catch(() => {})
        .finally(() => {
          setObsLoadingStories((prev) => {
            const next = new Set(prev)
            next.delete(storyNum)
            return next
          })
        })
    })
     
  }, [
    pickerScope,
    pickerObsMode,
    obsCatalogKey,
    obsStoryIds,
    currentRef.book,
    currentRef.chapter,
    navigatorRefreshTick,
    catalogManager,
  ])

  return {
    obsLoadingStories,
    setObsLoadingStories,
    navigatorRefreshTick,
  }
}
