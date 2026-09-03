import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import {
  useCacheAdapter,
  useCurrentReference,
  useLoaderRegistry,
  useNavigation,
  useNavigationMode,
} from '../../../../contexts'
import {
  PHASE_UPGRADE_HOLD_MS,
  SETTLE_HOLD_MS,
  PREFETCH_DISTANCE_PX,
  approachingNeighborChapter,
  canRevealChapterAtEdge,
  CHAPTER_EDGE_SWAP_MODE,
  chapterWindowAround,
  contentChaptersFromSlots,
  effectiveScrollVelocity,
  ensureChapterPainted,
  entryCoversReadLine,
  edgeRevealTargetChapter,
  isChapterInfiniteScrollEnabled,
  isSpacerEntry,
  lastChapterNumber,
  measureScrollVelocity,
  neighborChapterToPaint,
  recenterSlots,
  resetChapterSlots,
  revealChapterInWindow,
  settledCommitMode,
  settledNavChapter,
  shouldAllowChapterStitch,
  shouldPromotePlaceholderOnSettle,
  shouldResetWindowOnNavChange,
  settleViewportChapter,
  singlePaintedChapterSlots,
  slotsEqual,
  upgradeSlot,
  type ChapterSlot,
} from '../../../../features/nav/chapterInfiniteScroll'
import {
  getChapterScrollActivity,
  markChapterScrollSettled,
  markChapterScrollUnsettled,
  clearChapterScrollActivity,
} from '../../../../features/nav/chapterScrollActivity'
import { useChapterScrollActivity } from '../../../../features/nav/usePinnedHelpsReference'
import {
  markScripturePerfEnd,
  markScripturePerfStart,
} from '../../../../features/perf/scripturePerf'
import { markReadNavigationInternal } from '../../../../features/read/replaceReadUrlFromUi'
import {
  ensurePreparedFullChapter,
  hasPreparedFullChapter,
  healPreparedFullChapter,
  isPreparedSourceMissing,
  watchPrepareSourceMissing,
} from '../../../../features/scripture/ensurePreparedFullChapter'
import { RESOURCE_TYPE_IDS } from '../../../../resourceTypes/resourceTypeIds'
import {
  subscribePrepareReady,
  subscribePrepareReadyFailed,
} from '../../../../workers/prepareClient'
import { rememberChapterLayoutHeight } from '../utils/chapterLayoutCache'

const MAX_FULL_ENSURE_ATTEMPTS = 3

function findOverflowParent(el: HTMLElement | null): HTMLElement | null {
  let parent = el?.parentElement ?? null
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }
  return null
}

export function lastChapterFromViewModel(
  chapters: ReadonlyArray<{ number: number }> | undefined
): number {
  if (!chapters || chapters.length === 0) return 0
  return lastChapterNumber(chapters.map((chapter) => chapter.number))
}

export function useChapterInfiniteScroll(
  lastChapter: number,
  options?: {
    resourceKey?: string
    bookId?: string
    /**
     * When true, settle may flip paragraph→rendered before prepared-full is in
     * the LRU. ScriptureContent paints USJ VerseBlock until full rows arrive.
     * Prevents light-only lock after verse/section → chapter mode switches.
     */
    canFallbackToUsjTokens?: boolean
  }
) {
  const resourceKey = options?.resourceKey ?? ''
  const bookId = options?.bookId ?? ''
  const canFallbackToUsjTokens = options?.canFallbackToUsjTokens ?? false
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const { navigateToReference } = useNavigation()
  const enabled = isChapterInfiniteScrollEnabled(navigationMode, currentRef.book)
  const scrollActivity = useChapterScrollActivity()
  const cache = useCacheAdapter()
  const loaderRegistry = useLoaderRegistry()
  const [fullReadyTick, setFullReadyTick] = useState(0)
  const [settleKick, setSettleKick] = useState(0)
  const [tokenSourceFailed, setTokenSourceFailed] = useState(false)
  const ensureAttemptsRef = useRef<Map<number, number>>(new Map())
  const healingRef = useRef(false)
  const prevEnabledRef = useRef(enabled)

  const [slots, setSlots] = useState<ChapterSlot[]>(() =>
    CHAPTER_EDGE_SWAP_MODE
      ? singlePaintedChapterSlots(currentRef.chapter, 'paragraph')
      : resetChapterSlots(currentRef.chapter, lastChapter)
  )
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const contentRef = useRef<HTMLDivElement>(null)
  const chapterElsRef = useRef<Map<number, HTMLElement>>(new Map())
  const scrollParentRef = useRef<HTMLElement | null>(null)
  const velocityRef = useRef(0)
  const lastScrollRef = useRef({ top: 0, time: 0 })
  const committedByUsRef = useRef<number | null>(null)
  const navBookRef = useRef(currentRef.book)
  const navChapterRef = useRef(currentRef.chapter)
  const settleTimerRef = useRef<number | null>(null)
  const prependAdjustRef = useRef<{ height: number; top: number } | null>(null)
  const preserveAlignRef = useRef<{ chapter: number; viewportOffset: number } | null>(null)
  const alignToChapterRef = useRef<number | null>(currentRef.chapter)
  const rafRef = useRef<number | null>(null)

  const registerChapter = useCallback((chapter: number, el: HTMLElement | null) => {
    if (el) chapterElsRef.current.set(chapter, el)
    else chapterElsRef.current.delete(chapter)
  }, [])

  const commitChapter = useCallback(
    (chapter: number) => {
      if (chapter === currentRef.chapter) return
      committedByUsRef.current = chapter
      markReadNavigationInternal()
      navigateToReference({
        book: currentRef.book,
        chapter,
        verse: 1,
      })
    },
    [currentRef.book, currentRef.chapter, navigateToReference]
  )

  const revealChapterAtEdge = useCallback(
    (direction: 'next' | 'previous'): boolean => {
      if (!enabled || !CHAPTER_EDGE_SWAP_MODE || lastChapter < 1) return false
      const target = edgeRevealTargetChapter(slotsRef.current, direction, lastChapter)
      if (target == null) return false

      if (direction === 'previous') {
        const parent = scrollParentRef.current ?? findOverflowParent(contentRef.current)
        if (parent) {
          scrollParentRef.current = parent
          prependAdjustRef.current = {
            height: parent.scrollHeight,
            top: parent.scrollTop,
          }
        }
      }

      setSlots((prev) => {
        const next = revealChapterInWindow(prev, target, direction, lastChapter)
        return slotsEqual(prev, next) ? prev : next
      })
      // Reveal often grows content without a scroll event — kick settle so
      // paragraph→rendered upgrade is not stuck behind unsettled forever.
      markChapterScrollUnsettled()
      setSettleKick((n) => n + 1)
      return true
    },
    [enabled, lastChapter]
  )

  const canRevealAtEdge = useCallback(
    (direction: 'next' | 'previous') => {
      if (!enabled || !CHAPTER_EDGE_SWAP_MODE || lastChapter < 1) return false
      return canRevealChapterAtEdge(slotsRef.current, direction, lastChapter)
    },
    [enabled, lastChapter]
  )

  useEffect(() => {
    const justEnabled = enabled && !prevEnabledRef.current
    prevEnabledRef.current = enabled

    if (!enabled) {
      setSlots(
        CHAPTER_EDGE_SWAP_MODE
          ? singlePaintedChapterSlots(currentRef.chapter, 'paragraph')
          : resetChapterSlots(currentRef.chapter, lastChapter)
      )
      navBookRef.current = currentRef.book
      navChapterRef.current = currentRef.chapter
      committedByUsRef.current = null
      // Verse / section / custom-range: do not pin settledChapter — helps must
      // cover the full currentRef span, not only the start chapter.
      clearChapterScrollActivity()
      return
    }

    // Edge-reveal: stack up to 3 chapters; neighbors warm in cache until pull.
    if (CHAPTER_EDGE_SWAP_MODE) {
      const bookChanged = currentRef.book !== navBookRef.current
      if (justEnabled || bookChanged) {
        ensureAttemptsRef.current.clear()
        setTokenSourceFailed(false)
        healingRef.current = false
        setSlots(singlePaintedChapterSlots(currentRef.chapter, 'paragraph'))
        alignToChapterRef.current = currentRef.chapter
        committedByUsRef.current = null
      } else if (currentRef.chapter !== navChapterRef.current) {
        const fromOurCommit = committedByUsRef.current === currentRef.chapter
        if (fromOurCommit) {
          // Scroll settle advanced nav — keep the stacked window.
          committedByUsRef.current = null
        } else {
          // Picker / bar jump: reset to one chapter.
          ensureAttemptsRef.current.clear()
          setTokenSourceFailed(false)
          healingRef.current = false
          setSlots((prev) => {
            const existing = prev.find((s) => s.chapter === currentRef.chapter)
            const kind = existing?.kind === 'rendered' ? 'rendered' : 'paragraph'
            const next = singlePaintedChapterSlots(currentRef.chapter, kind)
            return slotsEqual(prev, next) ? prev : next
          })
          alignToChapterRef.current = currentRef.chapter
          committedByUsRef.current = null
        }
      }
      markChapterScrollSettled(currentRef.chapter)
      navBookRef.current = currentRef.book
      navChapterRef.current = currentRef.chapter
      return
    }

    const shouldReset = shouldResetWindowOnNavChange({
      navChapter: currentRef.chapter,
      navBook: currentRef.book,
      prevNavChapter: navChapterRef.current,
      prevNavBook: navBookRef.current,
      committedByUs: committedByUsRef.current,
    })

    // Re-entering chapter mode (or hard nav reset): fresh window + settle so
    // upgrade is not stuck waiting on a cleared/stale settle pin.
    if (justEnabled || shouldReset) {
      committedByUsRef.current = null
      ensureAttemptsRef.current.clear()
      setTokenSourceFailed(false)
      healingRef.current = false
      setSlots(resetChapterSlots(currentRef.chapter, lastChapter))
      alignToChapterRef.current = currentRef.chapter
      markChapterScrollSettled(currentRef.chapter)
      navBookRef.current = currentRef.book
      navChapterRef.current = currentRef.chapter
      return
    }

    if (committedByUsRef.current === currentRef.chapter) {
      const jumped = Math.abs(currentRef.chapter - navChapterRef.current) > 1
      setSlots((prev) => {
        const next = jumped
          ? resetChapterSlots(currentRef.chapter, lastChapter)
          : recenterSlots(prev, currentRef.chapter, lastChapter)
        const parent = scrollParentRef.current
        const el = chapterElsRef.current.get(currentRef.chapter)
        if (jumped) {
          // Spacer/multi-chapter land: snap to chapter top — preserve-align
          // fights the new spacer heights and oscillates nav (e.g. 113↔125).
          preserveAlignRef.current = null
          alignToChapterRef.current = currentRef.chapter
        } else if (parent && el) {
          preserveAlignRef.current = {
            chapter: currentRef.chapter,
            viewportOffset: el.getBoundingClientRect().top - parent.getBoundingClientRect().top,
          }
        } else if (next[0] && prev[0] && next[0].chapter < prev[0].chapter && parent) {
          prependAdjustRef.current = {
            height: parent.scrollHeight,
            top: parent.scrollTop,
          }
        }
        return slotsEqual(prev, next) ? prev : next
      })
    } else {
      setSlots((prev) => {
        const next = recenterSlots(prev, currentRef.chapter, lastChapter)
        if (slotsEqual(prev, next)) return prev
        if (next[0] && prev[0] && next[0].chapter < prev[0].chapter) {
          alignToChapterRef.current = currentRef.chapter
        }
        return next
      })
      if (getChapterScrollActivity().settledChapter == null) {
        markChapterScrollSettled(currentRef.chapter)
      }
    }

    navBookRef.current = currentRef.book
    navChapterRef.current = currentRef.chapter
  }, [enabled, currentRef.book, currentRef.chapter, lastChapter])

  useEffect(() => {
    return () => {
      // Leaving the viewer / mode: clear settle pinning so remounts in verse
      // or section mode are not stuck on a prior chapter-mode settledChapter.
      clearChapterScrollActivity()
    }
  }, [])

  useLayoutEffect(() => {
    const parent = scrollParentRef.current ?? findOverflowParent(contentRef.current)
    if (parent) scrollParentRef.current = parent

    const preserve = preserveAlignRef.current
    if (preserve && parent) {
      const el = chapterElsRef.current.get(preserve.chapter)
      if (el) {
        const now = el.getBoundingClientRect().top - parent.getBoundingClientRect().top
        parent.scrollTop += now - preserve.viewportOffset
      }
      preserveAlignRef.current = null
    } else {
      const adjust = prependAdjustRef.current
      if (adjust && parent) {
        const delta = parent.scrollHeight - adjust.height
        if (delta > 0) parent.scrollTop = adjust.top + delta
        prependAdjustRef.current = null
      } else {
        const align = alignToChapterRef.current
        if (align != null && parent) {
          const el = chapterElsRef.current.get(align)
          if (el) {
            parent.scrollTop =
              el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop
          }
          alignToChapterRef.current = null
        }
      }
    }

    for (const slot of slots) {
      if (slot.kind !== 'rendered' && slot.kind !== 'paragraph') continue
      const el = chapterElsRef.current.get(slot.chapter)
      if (el) rememberChapterLayoutHeight(currentRef.book, slot.chapter, el.offsetHeight)
    }
  }, [slots, currentRef.book])

  useEffect(() => {
    // Edge-swap paints one chapter; elastic overscroll advances units — no stitch.
    if (CHAPTER_EDGE_SWAP_MODE) return
    if (!enabled || lastChapter < 1) return
    const content = contentRef.current
    if (!content) return
    const parent = findOverflowParent(content)
    if (!parent) return
    scrollParentRef.current = parent
    lastScrollRef.current = { top: parent.scrollTop, time: performance.now() }

    const readViewportEntries = () => {
      const root = parent.getBoundingClientRect()
      const entries: Array<{
        chapter: number
        top: number
        bottom: number
        toChapter?: number
      }> = []
      for (const [chapter, el] of chapterElsRef.current) {
        const rect = el.getBoundingClientRect()
        const toRaw = el.dataset.chapterSpacerTo
        const toChapter = toRaw ? Number(toRaw) : undefined
        entries.push({
          chapter,
          top: rect.top,
          bottom: rect.bottom,
          toChapter: toChapter != null && Number.isFinite(toChapter) ? toChapter : undefined,
        })
      }
      return { root, entries }
    }

    const readViewportPark = () => {
      const { root, entries } = readViewportEntries()
      const parked = settleViewportChapter({
        entries,
        rootTop: root.top,
        rootBottom: root.bottom,
        nearEnd:
          parent.scrollTop + parent.clientHeight >= parent.scrollHeight - PREFETCH_DISTANCE_PX,
      })
      const onSpacer = entries.some(
        (entry) =>
          isSpacerEntry(entry) && entryCoversReadLine(entry, root.top, root.bottom)
      )
      return { parked, onSpacer, root, entries }
    }

    const readViewportChapter = () => readViewportPark().parked

    const paintApproachingNeighbor = () => {
      const { root, entries } = readViewportEntries()
      // Never drive paint from spacer chrome — that teleports the window and
      // thrash-oscillates the nav label.
      const contentEntries = entries.filter((entry) => {
        const el = chapterElsRef.current.get(entry.chapter)
        const kind = el?.dataset.chapterKind
        return kind === 'rendered' || kind === 'paragraph'
      })
      if (contentEntries.length === 0) return
      const raw = approachingNeighborChapter({
        entries: contentEntries,
        rootTop: root.top,
        rootBottom: root.bottom,
        lastChapter,
      })
      const approach = neighborChapterToPaint({
        approach: raw,
        paintedChapters: contentChaptersFromSlots(slotsRef.current),
      })
      if (approach == null) return
      setSlots((prev) => {
        const next = ensureChapterPainted(prev, approach, lastChapter)
        return slotsEqual(prev, next) ? prev : next
      })
    }

    const scheduleSettle = () => {
      const firstPark = readViewportPark()
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null
        const still = effectiveScrollVelocity(
          velocityRef.current,
          lastScrollRef.current.time,
          performance.now()
        )
        if (!shouldAllowChapterStitch(still)) return
        const park = readViewportPark()
        const parked = park.parked ?? firstPark.parked
        if (
          shouldPromotePlaceholderOnSettle({
            viewportChapter: parked,
            navChapter: navChapterRef.current,
            velocityPxPerMs: still,
          })
        ) {
          const incoming = settledNavChapter({
            viewportChapter: parked!,
            navChapter: navChapterRef.current,
            velocityPxPerMs: still,
          })
          if (incoming != null) {
            const mode = settledCommitMode({
              parked: incoming,
              navChapter: navChapterRef.current,
              parkedOnSpacer: park.onSpacer,
            })
            if (mode === 'jump') {
              preserveAlignRef.current = null
              alignToChapterRef.current = incoming
              setSlots(resetChapterSlots(incoming, lastChapter))
              commitChapter(incoming)
              markChapterScrollSettled(incoming)
              return
            }
            if (mode === 'step') {
              setSlots((prev) => {
                const next = recenterSlots(prev, incoming, lastChapter)
                return slotsEqual(prev, next) ? prev : next
              })
              commitChapter(incoming)
              markChapterScrollSettled(incoming)
              return
            }
          }
        }
        markChapterScrollSettled(parked ?? navChapterRef.current)
      }, SETTLE_HOLD_MS)
    }

    const onScroll = () => {
      markChapterScrollUnsettled()
      const now = performance.now()
      const top = parent.scrollTop
      velocityRef.current = measureScrollVelocity({
        prevTop: lastScrollRef.current.top,
        nextTop: top,
        prevTimeMs: lastScrollRef.current.time,
        nextTimeMs: now,
      })
      lastScrollRef.current = { top, time: now }
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        paintApproachingNeighbor()
        scheduleSettle()
      })
    }

    parent.addEventListener('scroll', onScroll, { passive: true })
    scheduleSettle()

    return () => {
      parent.removeEventListener('scroll', onScroll)
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
      if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    }
  }, [enabled, lastChapter, commitChapter])

  useEffect(() => {
    if (!enabled || !resourceKey || !bookId) return
    const stopWatch = watchPrepareSourceMissing()
    const unsubReady = subscribePrepareReady((msg) => {
      if (msg.typeId !== RESOURCE_TYPE_IDS.SCRIPTURE) return
      if (msg.resourceKey !== resourceKey) return
      if (msg.bookId.toLowerCase() !== bookId.toLowerCase()) return
      if (msg.tier !== 'full' && msg.tier !== 'both') return
      setTokenSourceFailed(false)
      ensureAttemptsRef.current.delete(msg.unit)
      setFullReadyTick((n) => n + 1)
    })
    const unsubFailed = subscribePrepareReadyFailed((msg) => {
      if (msg.typeId !== RESOURCE_TYPE_IDS.SCRIPTURE) return
      if (msg.resourceKey !== resourceKey) return
      if (msg.bookId.toLowerCase() !== bookId.toLowerCase()) return
      if (msg.reason !== 'source-missing') return
      setTokenSourceFailed(true)
      setFullReadyTick((n) => n + 1)
    })
    return () => {
      stopWatch()
      unsubReady()
      unsubFailed()
    }
  }, [enabled, resourceKey, bookId])

  useEffect(() => {
    ensureAttemptsRef.current.clear()
    setTokenSourceFailed(false)
    healingRef.current = false
  }, [resourceKey, bookId])

  useEffect(() => {
    if (!enabled || scrollActivity.unsettled) return
    const target =
      scrollActivity.settledChapter ??
      slots.find((slot) => slot.kind === 'paragraph')?.chapter ??
      null
    if (target == null) return
    if (!slots.some((slot) => slot.chapter === target && slot.kind === 'paragraph')) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      const still = effectiveScrollVelocity(
        velocityRef.current,
        lastScrollRef.current.time,
        performance.now()
      )
      if (!shouldAllowChapterStitch(still)) return
      if (getChapterScrollActivity().unsettled) return

      const runUpgrade = () => {
        if (cancelled) return
        markScripturePerfStart('chapter-upgrade', String(target))
        startTransition(() => {
          setSlots((prev) => {
            const next = upgradeSlot(prev, target)
            return slotsEqual(prev, next) ? prev : next
          })
        })
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            markScripturePerfEnd('chapter-upgrade', String(target))
          })
        })
      }

      // Prefer prepared-full before flipping to rendered. When USJ viewModel is
      // already in hand (e.g. after verse/section mode), upgrade immediately —
      // ScriptureContent paints VerseBlock until full rows land. Waiting forever
      // for prepare left users stuck on non-interactive light after mode switches.
      if (resourceKey && bookId && !hasPreparedFullChapter(resourceKey, bookId, target)) {
        const kickEnsure = () => {
          const attempts = ensureAttemptsRef.current.get(target) ?? 0

          const tryHeal = async () => {
            if (healingRef.current || cancelled) return
            const loader = loaderRegistry.getLoader(RESOURCE_TYPE_IDS.SCRIPTURE) as
              | { loadViewModel?: (rk: string, book: string) => Promise<UsjScriptureViewModel> }
              | undefined
            if (!loader?.loadViewModel) {
              setTokenSourceFailed(true)
              return
            }
            healingRef.current = true
            try {
              const healed = await healPreparedFullChapter({
                cache,
                resourceKey,
                bookId,
                chapter: target,
                loadViewModel: (rk, book) => loader.loadViewModel!(rk, book),
              })
              if (cancelled) return
              if (healed.status === 'ready' && healed.full) {
                setTokenSourceFailed(false)
                ensureAttemptsRef.current.delete(target)
                setFullReadyTick((n) => n + 1)
                return
              }
              setTokenSourceFailed(true)
            } finally {
              healingRef.current = false
            }
          }

          if (isPreparedSourceMissing(resourceKey, bookId) || attempts >= MAX_FULL_ENSURE_ATTEMPTS) {
            void tryHeal()
            return
          }

          ensureAttemptsRef.current.set(target, attempts + 1)
          void ensurePreparedFullChapter(cache, resourceKey, bookId, target).then((result) => {
            if (cancelled) return
            if (result.status === 'ready' && result.full) {
              ensureAttemptsRef.current.delete(target)
              setTokenSourceFailed(false)
              setFullReadyTick((n) => n + 1)
              return
            }
            if (result.status === 'source-missing') {
              void tryHeal()
              return
            }
            const nextAttempts = ensureAttemptsRef.current.get(target) ?? 0
            if (nextAttempts < MAX_FULL_ENSURE_ATTEMPTS) {
              window.setTimeout(() => {
                if (!cancelled) setFullReadyTick((n) => n + 1)
              }, 250 * (nextAttempts + 1))
            } else {
              void tryHeal()
            }
          })
        }

        kickEnsure()
        if (canFallbackToUsjTokens) {
          runUpgrade()
        }
        return
      }

      runUpgrade()
    }, PHASE_UPGRADE_HOLD_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    enabled,
    scrollActivity.unsettled,
    scrollActivity.settledChapter,
    slots,
    resourceKey,
    bookId,
    cache,
    fullReadyTick,
    loaderRegistry,
    canFallbackToUsjTokens,
  ])

  // Edge-reveal: keep prev/current/next full tiers warm beyond the painted stack.
  useEffect(() => {
    if (!CHAPTER_EDGE_SWAP_MODE || !enabled || !resourceKey || !bookId || lastChapter < 1) return
    const warm = new Set<number>(chapterWindowAround(currentRef.chapter, lastChapter))
    for (const chapter of contentChaptersFromSlots(slots)) {
      warm.add(chapter)
    }
    const painted = contentChaptersFromSlots(slots)
    if (painted.length > 0) {
      const lo = Math.min(...painted)
      const hi = Math.max(...painted)
      const prev = lo > 1 ? lo - 1 : null
      const next = hi < lastChapter ? hi + 1 : null
      if (prev != null) warm.add(prev)
      if (next != null) warm.add(next)
    }
    let cancelled = false
    for (const chapter of warm) {
      if (hasPreparedFullChapter(resourceKey, bookId, chapter)) continue
      void ensurePreparedFullChapter(cache, resourceKey, bookId, chapter).then((result) => {
        if (cancelled) return
        if (result.status === 'ready' && result.full) {
          setFullReadyTick((n) => n + 1)
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [enabled, resourceKey, bookId, lastChapter, currentRef.chapter, slots, cache])

  // Edge-reveal: sync nav when the user scrolls between painted chapters (no stitch).
  useEffect(() => {
    if (!CHAPTER_EDGE_SWAP_MODE || !enabled || lastChapter < 1) return
    const content = contentRef.current
    if (!content) return
    const parent = findOverflowParent(content)
    if (!parent) return
    scrollParentRef.current = parent

    let settleTimer: number | null = null

    const scheduleSettle = () => {
      if (settleTimer != null) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        settleTimer = null
        const root = parent.getBoundingClientRect()
        const painted = new Set(contentChaptersFromSlots(slotsRef.current))
        const entries: Array<{ chapter: number; top: number; bottom: number }> = []
        for (const [chapter, el] of chapterElsRef.current) {
          if (!painted.has(chapter)) continue
          const rect = el.getBoundingClientRect()
          entries.push({ chapter, top: rect.top, bottom: rect.bottom })
        }
        if (entries.length === 0) {
          // Always clear unsettled so paragraph→rendered upgrades can run.
          markChapterScrollSettled(navChapterRef.current)
          return
        }
        const parked = settleViewportChapter({
          entries,
          rootTop: root.top,
          rootBottom: root.bottom,
          nearEnd: false,
        })
        if (parked != null && painted.has(parked) && parked !== navChapterRef.current) {
          commitChapter(parked)
        }
        // Match legacy stitch settle: always re-settle, even when parked === nav
        // (post-commit scroll adjust / reveal-without-scroll would otherwise stick unsettled).
        markChapterScrollSettled(parked ?? navChapterRef.current)
      }, SETTLE_HOLD_MS)
    }

    const onScroll = () => {
      markChapterScrollUnsettled()
      scheduleSettle()
    }

    parent.addEventListener('scroll', onScroll, { passive: true })
    scheduleSettle()

    return () => {
      parent.removeEventListener('scroll', onScroll)
      if (settleTimer != null) window.clearTimeout(settleTimer)
    }
  }, [enabled, lastChapter, commitChapter, settleKick])

  const retryTokenSource = useCallback(() => {
    if (!resourceKey || !bookId) return
    ensureAttemptsRef.current.clear()
    setTokenSourceFailed(false)
    healingRef.current = false
    setFullReadyTick((n) => n + 1)
  }, [resourceKey, bookId])

  return {
    enabled,
    chapterSlots: enabled ? slots : null,
    displayChapters: enabled ? contentChaptersFromSlots(slots) : null,
    contentRef,
    registerChapter,
    tokenSourceFailed,
    retryTokenSource,
    revealChapterAtEdge,
    canRevealChapterAtEdge: canRevealAtEdge,
  }
}
