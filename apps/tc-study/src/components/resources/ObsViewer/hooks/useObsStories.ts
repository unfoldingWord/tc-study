import { useEffect, useRef, useState } from 'react'
import { useCatalogManager, useNavigation } from '../../../../contexts'
import { useAppStore } from '../../../../contexts/AppContext'
import type { ParsedObsStory } from '../../../../lib/obs/parseObsMarkdown'
import {
  applyObsContentLoadFailure,
  obsContentLoadKey,
  obsMetadataRevision,
} from './obsContentLoad'

const METADATA_POLL_MS = 250
const HARD_MISS_POLLS = 12

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
  const [catalogReadyKey, setCatalogReadyKey] = useState<string | null>(null)
  const [hardMissKey, setHardMissKey] = useState<string | null>(null)

  const storeRevision = useAppStore((s) => obsMetadataRevision(s.loadedResources, resourceKey))
  const catalogReady = catalogReadyKey === resourceKey || !!storeRevision
  const allowHardMiss = hardMissKey === resourceKey
  const metadataRevision = storeRevision || (catalogReady ? 'catalog' : '')
  const loadKey = obsContentLoadKey(resourceKey, storyNum, endStory, book, metadataRevision)

  // Stable ref — Immer recreates navigation each setObsStoryFrameCount; avoid effect loops.
  const navigationActionsRef = useRef(navigation)
  useEffect(() => {
    navigationActionsRef.current = navigation
  })

  useEffect(() => {
    if (book !== 'obs') return
    if (storeRevision) {
      setCatalogReadyKey(resourceKey)
      return
    }
    let cancelled = false
    let attempts = 0
    const poll = async () => {
      try {
        const metadata = await catalogManager.getResourceMetadata(resourceKey)
        if (!cancelled && metadata) setCatalogReadyKey(resourceKey)
      } catch {
        /* ignore */
      }
      attempts += 1
      if (!cancelled && attempts >= HARD_MISS_POLLS) setHardMissKey(resourceKey)
    }
    void poll()
    const id = window.setInterval(() => {
      void poll()
    }, METADATA_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [resourceKey, catalogManager, storeRevision, book])

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
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        const failure = applyObsContentLoadFailure(e, allowHardMiss)
        if (failure.retryWhenMetadataArrives) {
          setError(null)
          setStoryMap({})
          setLoading(true)
          return
        }
        setError(failure.error)
        setStoryMap({})
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadKey, catalogManager, allowHardMiss, resourceKey, storyNum, endStory])

  return { storyMap, loading, error }
}
