import { useEffect, useRef, useState } from 'react'
import { useCatalogManager, useNavigation } from '../../../../contexts'
import type { ParsedObsStory } from '../../../../lib/obs/parseObsMarkdown'

export function useObsStories(params: {
  resourceKey: string
  storyNum: number
  endStory: number
  book: string
}) {
  const { resourceKey, storyNum, endStory, book } = params
  const catalogManager = useCatalogManager()
  const navigation = useNavigation()

  const [storyMap, setStoryMap] = useState<Record<number, ParsedObsStory>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Stable ref — Immer recreates navigation each setObsStoryFrameCount; avoid effect loops.
  const navigationActionsRef = useRef(navigation)
  useEffect(() => {
    navigationActionsRef.current = navigation
  })

  useEffect(() => {
    if (book !== 'obs') {
      setStoryMap({})
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const storiesToLoad: number[] = []
    for (let s = storyNum; s <= endStory; s++) storiesToLoad.push(s)

    void Promise.all(
      storiesToLoad.map((num) =>
        catalogManager
          .loadContent(resourceKey, String(num))
          .then((content) => ({ num, story: content as ParsedObsStory }))
      )
    )
      .then((results) => {
        if (cancelled) return
        const map: Record<number, ParsedObsStory> = {}
        for (const { num, story } of results) {
          map[num] = story
          navigationActionsRef.current.setObsStoryFrameCount(num, story.frames.length)
        }
        setStoryMap(map)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setStoryMap({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
     
  }, [resourceKey, storyNum, endStory, book, catalogManager])

  return { storyMap, loading, error }
}
