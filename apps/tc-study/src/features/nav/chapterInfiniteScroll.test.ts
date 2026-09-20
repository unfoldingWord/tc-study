import { describe, expect, test } from 'bun:test'
import {
  BOOK_SPACER_CHAPTER_THRESHOLD,
  canRevealChapterAtEdge,
  CHAPTER_EDGE_SWAP_MODE,
  FAST_SCROLL_PX_PER_MS,
  MAX_MOUNTED_CHAPTERS,
  PHASE_UPGRADE_HOLD_MS,
  PLACEHOLDER_MIN_HEIGHT_PX,
  SETTLE_HOLD_MS,
  CHAPTER_REVEAL_PEEK_PX,
  peekScrollTopAfterEdgeReveal,
  adjacentChapterToRequest,
  adjacentSlotKindAfterSettle,
  approachingNeighborChapter,
  bookSpanFromSlots,
  chapterCountInSlots,
  chapterFromSpacerOffset,
  chapterSlotsAround,
  isChapterInfiniteScrollEnabled,
  chapterToStitch,
  chapterWindowAround,
  contentChaptersFromSlots,
  edgeRevealTargetChapter,
  effectiveScrollVelocity,
  ensureChapterPainted,
  measureScrollVelocity,
  neighborChapterToPaint,
  placeholderHeightPx,
  promoteSlot,
  recenterSlots,
  renderedChaptersFromSlots,
  resetChapterSlots,
  resetMountedChapters,
  revealChapterInWindow,
  settleViewportChapter,
  settledCommitMode,
  settledNavChapter,
  shouldAllowChapterStitch,
  shouldBlockEdgeRevealRetrigger,
  shouldCommitSettledChapter,
  shouldPromotePlaceholderOnSettle,
  shouldResetWindowOnNavChange,
  shouldStitchAtDocumentEdge,
  singlePaintedChapterSlots,
  spacerHeightPx,
  stitchMountedChapters,
  trimMountedToWindow,
  upgradeParagraphSlots,
  upgradeSlot,
  viewportSettledChapter,
  wouldEnqueueWholeBook,
} from './chapterInfiniteScroll'

describe('chapterInfiniteScroll mode gate', () => {
  test('only Bible chapter grain enables stitch', () => {
    expect(isChapterInfiniteScrollEnabled('chapter', 'tit')).toBe(true)
    expect(isChapterInfiniteScrollEnabled('verse', 'tit')).toBe(false)
    expect(isChapterInfiniteScrollEnabled('section', 'tit')).toBe(false)
    expect(isChapterInfiniteScrollEnabled('passage-set', 'tit')).toBe(false)
    expect(isChapterInfiniteScrollEnabled('chapter', 'obs')).toBe(false)
  })
})

describe('chapter edge-reveal stack', () => {
  test('defaults to edge-reveal and paints a single chapter slot initially', () => {
    expect(CHAPTER_EDGE_SWAP_MODE).toBe(true)
    expect(singlePaintedChapterSlots(3)).toEqual([{ chapter: 3, kind: 'paragraph' }])
    expect(chapterWindowAround(3, 5)).toEqual([2, 3, 4])
  })

  test('revealChapterInWindow appends next and trims to three', () => {
    let slots = singlePaintedChapterSlots(1)
    slots = revealChapterInWindow(slots, 2, 'next', 10)
    expect(slots.map((s) => s.chapter)).toEqual([1, 2])
    slots = revealChapterInWindow(slots, 3, 'next', 10)
    expect(slots.map((s) => s.chapter)).toEqual([1, 2, 3])
    slots = revealChapterInWindow(slots, 4, 'next', 10)
    expect(slots.map((s) => s.chapter)).toEqual([2, 3, 4])
  })

  test('revealChapterInWindow prepends previous and trims to three', () => {
    let slots = singlePaintedChapterSlots(5)
    slots = revealChapterInWindow(slots, 4, 'previous', 10)
    expect(slots.map((s) => s.chapter)).toEqual([4, 5])
    slots = revealChapterInWindow(slots, 3, 'previous', 10)
    expect(slots.map((s) => s.chapter)).toEqual([3, 4, 5])
    slots = revealChapterInWindow(slots, 2, 'previous', 10)
    expect(slots.map((s) => s.chapter)).toEqual([2, 3, 4])
  })

  test('edgeRevealTargetChapter finds the next unpainted neighbor', () => {
    const slots = revealChapterInWindow(singlePaintedChapterSlots(2), 3, 'next', 10)
    expect(edgeRevealTargetChapter(slots, 'next', 10)).toBe(4)
    expect(edgeRevealTargetChapter(slots, 'previous', 10)).toBe(1)
    expect(canRevealChapterAtEdge(slots, 'next', 10)).toBe(true)
    expect(canRevealChapterAtEdge(revealChapterInWindow(slots, 4, 'next', 4), 'next', 4)).toBe(false)
  })

  test('peekScrollTopAfterEdgeReveal nudges toward the new chapter without a start snap', () => {
    expect(CHAPTER_REVEAL_PEEK_PX).toBe(56)
    expect(CHAPTER_REVEAL_PEEK_PX).toBeLessThan(168)
    expect(
      peekScrollTopAfterEdgeReveal({
        direction: 'next',
        parentScrollTop: 1400,
        scrollHeight: 4000,
        clientHeight: 600,
      })
    ).toBe(1456)
    expect(
      peekScrollTopAfterEdgeReveal({
        direction: 'previous',
        parentScrollTop: 1800,
        scrollHeight: 4000,
        clientHeight: 600,
      })
    ).toBe(1744)
  })

  test('peekScrollTopAfterEdgeReveal clamps to the scroll range', () => {
    expect(
      peekScrollTopAfterEdgeReveal({
        direction: 'next',
        parentScrollTop: 3380,
        scrollHeight: 4000,
        clientHeight: 600,
      })
    ).toBe(3400)
    expect(
      peekScrollTopAfterEdgeReveal({
        direction: 'previous',
        parentScrollTop: 20,
        scrollHeight: 4000,
        clientHeight: 600,
      })
    ).toBe(0)
  })

  test('peekScrollTopAfterEdgeReveal uses the incoming chapter junction, not a start snap', () => {
    // Bottom-anchored after append: pull back to show the new heading, not verse 1 (2000).
    expect(
      peekScrollTopAfterEdgeReveal({
        direction: 'next',
        parentScrollTop: 4000,
        scrollHeight: 5000,
        clientHeight: 600,
        incomingTop: 2000,
      })
    ).toBe(1456)
    // Prepend jumped to 0: show the previous chapter's end, not its verse 1.
    expect(
      peekScrollTopAfterEdgeReveal({
        direction: 'previous',
        parentScrollTop: 0,
        scrollHeight: 4000,
        clientHeight: 600,
        incomingTop: 0,
        incomingHeight: 1800,
      })
    ).toBe(1744)
  })
})

describe('chapterInfiniteScroll velocity gate', () => {
  test('fast flick does not stitch or advance nav', () => {
    const fast = FAST_SCROLL_PX_PER_MS + 0.8
    expect(shouldAllowChapterStitch(fast)).toBe(false)
    expect(
      shouldStitchAtDocumentEdge({
        nearStart: false,
        nearEnd: true,
        velocityPxPerMs: fast,
        lastDirection: 'down',
      })
    ).toEqual({ requestNext: false, requestPrev: false })
    expect(
      settledNavChapter({
        viewportChapter: 3,
        navChapter: 2,
        velocityPxPerMs: fast,
      })
    ).toBeNull()
  })

  test('paused after a flick treats velocity as zero so a later slow hold can stitch', () => {
    expect(effectiveScrollVelocity(4, 1_000, 1_000 + 200)).toBe(0)
    expect(effectiveScrollVelocity(4, 1_000, 1_050)).toBe(4)
  })

  test('settle hold is long enough that a continuous scroll stays scrolling', () => {
    expect(SETTLE_HOLD_MS).toBeGreaterThanOrEqual(250)
  })
})

describe('chapterInfiniteScroll stitch on slow approach', () => {
  test('slow approach to the end requests only the next chapter', () => {
    const slow = FAST_SCROLL_PX_PER_MS - 0.2
    const edge = shouldStitchAtDocumentEdge({
      nearStart: false,
      nearEnd: true,
      velocityPxPerMs: slow,
      lastDirection: 'down',
    })
    expect(edge).toEqual({ requestNext: true, requestPrev: false })
    expect(
      chapterToStitch({
        requestNext: true,
        requestPrev: false,
        mounted: [2],
        lastChapter: 16,
      })
    ).toBe(3)
  })

  test('slow approach to the start requests only the previous chapter', () => {
    const slow = 0.2
    const edge = shouldStitchAtDocumentEdge({
      nearStart: true,
      nearEnd: false,
      velocityPxPerMs: slow,
      lastDirection: 'up',
    })
    expect(edge).toEqual({ requestNext: false, requestPrev: true })
    expect(
      chapterToStitch({
        requestNext: false,
        requestPrev: true,
        mounted: [5, 6],
        lastChapter: 16,
      })
    ).toBe(4)
  })

  test('first and last chapter do not wrap', () => {
    expect(adjacentChapterToRequest(1, 'prev', 16)).toBeNull()
    expect(adjacentChapterToRequest(16, 'next', 16)).toBeNull()
    expect(
      chapterToStitch({
        requestNext: true,
        requestPrev: false,
        mounted: [16],
        lastChapter: 16,
      })
    ).toBeNull()
  })

  test('does not enqueue the whole book from one chapter', () => {
    let mounted = resetMountedChapters(1)
    for (let incoming = 2; incoming <= 50; incoming++) {
      mounted = stitchMountedChapters({
        mounted,
        incoming,
        settled: 1,
        lastChapter: 50,
      })
    }
    expect(mounted.length).toBeLessThanOrEqual(MAX_MOUNTED_CHAPTERS)
    expect(mounted).toEqual([1, 2])
    expect(wouldEnqueueWholeBook(mounted, 50)).toBe(false)
  })

  test('walking the book keeps a 3-chapter window', () => {
    let mounted = [1]
    for (let settled = 1; settled < 21; settled++) {
      const incoming = settled + 1
      mounted = stitchMountedChapters({
        mounted,
        incoming,
        settled,
        lastChapter: 21,
      })
      expect(mounted.length).toBeLessThanOrEqual(MAX_MOUNTED_CHAPTERS)
      mounted = trimMountedToWindow(mounted, incoming, 21)
      expect(mounted.length).toBeLessThanOrEqual(MAX_MOUNTED_CHAPTERS)
      expect(Math.max(...mounted) - Math.min(...mounted)).toBeLessThanOrEqual(2)
    }
    expect(chapterWindowAround(10, 21)).toEqual([9, 10, 11])
  })
})

describe('chapterInfiniteScroll nav settle', () => {
  test('updates nav when the new chapter is the settled viewport and scroll is slow', () => {
    expect(
      settledNavChapter({
        viewportChapter: 3,
        navChapter: 2,
        velocityPxPerMs: 0.1,
      })
    ).toBe(3)
  })

  test('does not update nav when the settled chapter is already current', () => {
    expect(
      settledNavChapter({
        viewportChapter: 2,
        navChapter: 2,
        velocityPxPerMs: 0,
      })
    ).toBeNull()
  })

  test('read-line pick uses the chapter under the top of the viewport', () => {
    expect(
      viewportSettledChapter(
        [
          { chapter: 2, top: 0, bottom: 400 },
          { chapter: 3, top: 400, bottom: 900 },
        ],
        0,
        500
      )
    ).toBe(2)
    expect(
      viewportSettledChapter(
        [
          { chapter: 2, top: -300, bottom: 40 },
          { chapter: 3, top: 40, bottom: 600 },
        ],
        0,
        500
      )
    ).toBe(3)
  })

  test('our settle commit does not reset the window; picker jumps do', () => {
    expect(
      shouldResetWindowOnNavChange({
        navChapter: 3,
        navBook: 'tit',
        prevNavChapter: 2,
        prevNavBook: 'tit',
        committedByUs: 3,
      })
    ).toBe(false)
    expect(
      shouldResetWindowOnNavChange({
        navChapter: 8,
        navBook: 'tit',
        prevNavChapter: 2,
        prevNavBook: 'tit',
        committedByUs: 3,
      })
    ).toBe(true)
    expect(
      shouldResetWindowOnNavChange({
        navChapter: 1,
        navBook: 'mrk',
        prevNavChapter: 3,
        prevNavBook: 'tit',
        committedByUs: 3,
      })
    ).toBe(true)
  })

  test('helps/picker jump does not settle-commit back to the previous chapter', () => {
    expect(
      shouldCommitSettledChapter({
        parked: 1,
        navChapter: 2,
        paintedHasParked: true,
        blockSnapBackTo: 1,
      })
    ).toBe(false)
    expect(
      shouldCommitSettledChapter({
        parked: 2,
        navChapter: 2,
        paintedHasParked: true,
        blockSnapBackTo: 1,
      })
    ).toBe(false)
    expect(
      shouldCommitSettledChapter({
        parked: 3,
        navChapter: 2,
        paintedHasParked: true,
        blockSnapBackTo: 1,
      })
    ).toBe(true)
  })

  test('peek/settle/commit cannot retrigger the same edge reveal in the same tick', () => {
    let slots = singlePaintedChapterSlots(3)
    const first = edgeRevealTargetChapter(slots, 'next', 10)
    expect(first).toBe(4)
    slots = revealChapterInWindow(slots, first!, 'next', 10)
    expect(slots.map((s) => s.chapter)).toEqual([3, 4])

    expect(
      shouldBlockEdgeRevealRetrigger({
        inFlightTarget: 4,
        target: 4,
        programmaticScrollActive: false,
      })
    ).toBe(true)
    expect(
      shouldBlockEdgeRevealRetrigger({
        inFlightTarget: 4,
        target: 5,
        programmaticScrollActive: true,
      })
    ).toBe(true)
    expect(
      shouldBlockEdgeRevealRetrigger({
        inFlightTarget: null,
        target: 5,
        programmaticScrollActive: false,
      })
    ).toBe(false)
    expect(shouldBlockEdgeRevealRetrigger({ inFlightTarget: 4, target: null })).toBe(true)

    // Peek leaves the previous chapter on the read-line — settle must not
    // snap nav back (that would look like a picker jump and re-reveal).
    expect(
      shouldCommitSettledChapter({
        parked: 3,
        navChapter: 4,
        paintedHasParked: true,
        blockSnapBackTo: null,
        holdToChapter: 4,
      })
    ).toBe(false)
  })

  test('edge-reveal hold does not settle-commit the chapter that still owns the read-line', () => {
    expect(
      shouldCommitSettledChapter({
        parked: 5,
        navChapter: 6,
        paintedHasParked: true,
        blockSnapBackTo: null,
        holdToChapter: 6,
      })
    ).toBe(false)
    expect(
      shouldCommitSettledChapter({
        parked: 6,
        navChapter: 6,
        paintedHasParked: true,
        blockSnapBackTo: null,
        holdToChapter: 6,
      })
    ).toBe(false)
    expect(
      shouldCommitSettledChapter({
        parked: 7,
        navChapter: 6,
        paintedHasParked: true,
        blockSnapBackTo: null,
        holdToChapter: 6,
      })
    ).toBe(false)
    expect(
      shouldCommitSettledChapter({
        parked: 7,
        navChapter: 6,
        paintedHasParked: true,
        blockSnapBackTo: null,
        holdToChapter: 7,
      })
    ).toBe(true)
  })
})

describe('chapterInfiniteScroll velocity math', () => {
  test('measureScrollVelocity is px per ms', () => {
    expect(
      measureScrollVelocity({
        prevTop: 100,
        nextTop: 220,
        prevTimeMs: 1_000,
        nextTimeMs: 1_100,
      })
    ).toBe(1.2)
  })
})

describe('chapterInfiniteScroll placeholder slots', () => {
  test('always reserves book-length gaps and paints nav ±1 as paragraph', () => {
    const mid = resetChapterSlots(2, 16)
    expect(bookSpanFromSlots(mid)).toEqual({ from: 1, to: 16 })
    expect(chapterCountInSlots(mid)).toBe(16)
    expect(contentChaptersFromSlots(mid)).toEqual([1, 2, 3])
    expect(mid.find((slot) => slot.chapter === 2)?.kind).toBe('paragraph')
    // Near band beyond painted window: placeholders; far chapters in one spacer.
    expect(mid.filter((slot) => slot.kind === 'placeholder').map((slot) => slot.chapter)).toEqual([
      4, 5,
    ])
    expect(mid.at(-1)).toEqual({ kind: 'spacer', chapter: 6, toChapter: 16 })

    expect(bookSpanFromSlots(resetChapterSlots(1, 16))).toEqual({ from: 1, to: 16 })
    expect(resetChapterSlots(1, 16)[0]).toEqual({ chapter: 1, kind: 'paragraph' })
    expect(contentChaptersFromSlots(resetChapterSlots(1, 16))).toEqual([1, 2])
    expect(bookSpanFromSlots(resetChapterSlots(16, 16))).toEqual({ from: 1, to: 16 })
    expect(resetChapterSlots(16, 16).at(-1)).toEqual({ chapter: 16, kind: 'paragraph' })
    expect(contentChaptersFromSlots(resetChapterSlots(16, 16))).toEqual([15, 16])
    expect(resetChapterSlots(5, 0)).toEqual([{ chapter: 5, kind: 'paragraph' }])
  })

  test('neighbors stay painted so scrolling into next/prev never blanks', () => {
    const slots = resetChapterSlots(2, 16)
    expect(contentChaptersFromSlots(slots)).toEqual([1, 2, 3])
    expect(renderedChaptersFromSlots(slots)).toEqual([])
    expect(
      slots
        .filter((slot) => slot.kind !== 'paragraph')
        .every((slot) => slot.kind === 'placeholder' || slot.kind === 'spacer')
    ).toBe(true)
    expect(adjacentSlotKindAfterSettle({
      viewportChapter: 3,
      navChapter: 2,
      adjacentChapter: 3,
      velocityPxPerMs: FAST_SCROLL_PX_PER_MS + 0.8,
    })).toBe('placeholder')
    expect(
      shouldPromotePlaceholderOnSettle({
        viewportChapter: 3,
        navChapter: 2,
        velocityPxPerMs: FAST_SCROLL_PX_PER_MS + 0.8,
      })
    ).toBe(false)
  })

  test('after settle on the bottom gap, next chapter promotes to paragraph then can upgrade', () => {
    expect(
      shouldPromotePlaceholderOnSettle({
        viewportChapter: 3,
        navChapter: 2,
        velocityPxPerMs: 0.1,
      })
    ).toBe(true)
    expect(
      adjacentSlotKindAfterSettle({
        viewportChapter: 3,
        navChapter: 2,
        adjacentChapter: 3,
        velocityPxPerMs: 0.1,
      })
    ).toBe('paragraph')
    const promoted = promoteSlot(resetChapterSlots(2, 16), 3)
    expect(promoted.find((slot) => slot.chapter === 3)?.kind).toBe('paragraph')
    expect(promoted.find((slot) => slot.chapter === 2)?.kind).toBe('paragraph')
    expect(upgradeSlot(promoted, 3).find((slot) => slot.chapter === 3)?.kind).toBe('rendered')
    expect(upgradeSlot(promoted, 3).find((slot) => slot.chapter === 2)?.kind).toBe('paragraph')
    expect(
      upgradeParagraphSlots(promoted).every(
        (slot) => slot.kind !== 'paragraph'
      )
    ).toBe(true)
    expect(PHASE_UPGRADE_HOLD_MS).toBeGreaterThanOrEqual(0)
    expect(PHASE_UPGRADE_HOLD_MS).toBe(0)
  })

  test('fast flick to current-chapter end does not mount next chapter', () => {
    expect(
      shouldPromotePlaceholderOnSettle({
        viewportChapter: 2,
        navChapter: 2,
        velocityPxPerMs: 0,
      })
    ).toBe(false)
    expect(
      adjacentSlotKindAfterSettle({
        viewportChapter: 2,
        navChapter: 2,
        adjacentChapter: 3,
        velocityPxPerMs: 0,
      })
    ).toBe('placeholder')
    expect(contentChaptersFromSlots(chapterSlotsAround(2, 16, new Set([2])))).toEqual([1, 2, 3])
    expect(chapterSlotsAround(2, 16, new Set([2])).find((slot) => slot.chapter === 2)?.kind).toBe(
      'rendered'
    )
    expect(chapterSlotsAround(2, 16, new Set([2])).find((slot) => slot.chapter === 1)?.kind).toBe(
      'paragraph'
    )
    expect(chapterSlotsAround(2, 16, new Set([2])).find((slot) => slot.chapter === 3)?.kind).toBe(
      'paragraph'
    )
  })

  test('does not downgrade a fully rendered chapter while scrolling within it', () => {
    const rendered = chapterSlotsAround(5, 16, new Set([5]))
    expect(rendered.find((slot) => slot.chapter === 5)?.kind).toBe('rendered')
    expect(recenterSlots(rendered, 5, 16).find((slot) => slot.chapter === 5)?.kind).toBe('rendered')
    expect(promoteSlot(rendered, 5).find((slot) => slot.chapter === 5)?.kind).toBe('rendered')
  })

  test('recenter after settle into prev keeps current content and book-length gaps', () => {
    const afterPromote = promoteSlot(resetChapterSlots(5, 16), 4)
    const recentered = recenterSlots(afterPromote, 4, 16)
    expect(bookSpanFromSlots(recentered)).toEqual({ from: 1, to: 16 })
    expect(contentChaptersFromSlots(recentered)).toEqual([3, 4, 5])
    expect(recentered.find((slot) => slot.chapter === 3)?.kind).toBe('paragraph')
    expect(recentered.find((slot) => slot.chapter === 4)?.kind).toBe('paragraph')
    expect(recentered.find((slot) => slot.chapter === 5)?.kind).toBe('paragraph')
    expect(recentered.find((slot) => slot.chapter === 2)?.kind).toBe('placeholder')
  })

  test('all books use a spacer for far chapters and placeholders only nearby', () => {
    expect(BOOK_SPACER_CHAPTER_THRESHOLD).toBe(0)
    const slots = resetChapterSlots(75, 150)
    expect(bookSpanFromSlots(slots)).toEqual({ from: 1, to: 150 })
    expect(chapterCountInSlots(slots)).toBe(150)
    expect(contentChaptersFromSlots(slots)).toEqual([74, 75, 76])
    expect(slots[0]).toEqual({ kind: 'spacer', chapter: 1, toChapter: 71 })
    expect(slots.find((slot) => slot.chapter === 72)?.kind).toBe('placeholder')
    expect(slots.find((slot) => slot.chapter === 73)?.kind).toBe('placeholder')
    expect(slots.find((slot) => slot.chapter === 74)?.kind).toBe('paragraph')
    expect(slots.find((slot) => slot.chapter === 76)?.kind).toBe('paragraph')
    expect(slots.find((slot) => slot.chapter === 77)?.kind).toBe('placeholder')
    expect(slots.find((slot) => slot.chapter === 78)?.kind).toBe('placeholder')
    expect(slots.at(-1)).toEqual({ kind: 'spacer', chapter: 79, toChapter: 150 })
    expect(slots.filter((slot) => slot.kind === 'placeholder').length).toBe(4)
  })

  test('approaching the bottom of painted content paints the next chapter', () => {
    expect(
      approachingNeighborChapter({
        entries: [
          { chapter: 2, top: 100, bottom: 400 },
          { chapter: 3, top: 400, bottom: 520 },
        ],
        rootTop: 0,
        rootBottom: 500,
        lastChapter: 16,
        prefetchDistancePx: 120,
      })
    ).toBe(4)
    expect(
      approachingNeighborChapter({
        entries: [{ chapter: 5, top: -20, bottom: 800 }],
        rootTop: 0,
        rootBottom: 500,
        lastChapter: 16,
        prefetchDistancePx: 120,
      })
    ).toBe(4)
  })

  test('ensureChapterPainted promotes placeholders and teleports distant chapters', () => {
    const near = ensureChapterPainted(resetChapterSlots(2, 16), 4, 16)
    expect(near.find((slot) => slot.chapter === 4)?.kind).toBe('paragraph')
    expect(contentChaptersFromSlots(near).length).toBeLessThanOrEqual(MAX_MOUNTED_CHAPTERS)

    const far = ensureChapterPainted(resetChapterSlots(2, 16), 10, 16)
    expect(contentChaptersFromSlots(far)).toEqual([9, 10, 11])
    expect(far.find((slot) => slot.chapter === 2)?.kind).not.toBe('paragraph')
  })

  test('approach paint only steps outside the painted window', () => {
    expect(
      neighborChapterToPaint({ approach: 4, paintedChapters: [1, 2, 3] })
    ).toBe(4)
    expect(
      neighborChapterToPaint({ approach: 10, paintedChapters: [1, 2, 3] })
    ).toBeNull()
    expect(
      neighborChapterToPaint({ approach: 1, paintedChapters: [2, 3, 4] })
    ).toBe(1)
  })

  test('spacer or multi-chapter park jumps once instead of step-recentering', () => {
    expect(
      settledCommitMode({ parked: 125, navChapter: 113, parkedOnSpacer: true })
    ).toBe('jump')
    expect(
      settledCommitMode({ parked: 125, navChapter: 113, parkedOnSpacer: false })
    ).toBe('jump')
    expect(
      settledCommitMode({ parked: 114, navChapter: 113, parkedOnSpacer: false })
    ).toBe('step')
    expect(
      settledCommitMode({ parked: 113, navChapter: 113, parkedOnSpacer: false })
    ).toBeNull()
  })

  test('placeholder height uses cached chapter height or a viewport fraction', () => {
    expect(
      placeholderHeightPx({ cachedHeightPx: 720, viewportHeightPx: 500 })
    ).toBe(720)
    expect(
      placeholderHeightPx({ cachedHeightPx: null, viewportHeightPx: 800 })
    ).toBeGreaterThanOrEqual(PLACEHOLDER_MIN_HEIGHT_PX)
    expect(
      placeholderHeightPx({ cachedHeightPx: 4, viewportHeightPx: 800 })
    ).toBeGreaterThanOrEqual(PLACEHOLDER_MIN_HEIGHT_PX)
    expect(
      spacerHeightPx({
        fromChapter: 1,
        toChapter: 3,
        heightForChapter: (chapter) => (chapter === 2 ? 400 : null),
        viewportHeightPx: 800,
      })
    ).toBeGreaterThan(400)
    expect(
      chapterFromSpacerOffset({
        fromChapter: 10,
        toChapter: 19,
        offsetPx: 0,
        heightPx: 1000,
      })
    ).toBe(10)
    expect(
      chapterFromSpacerOffset({
        fromChapter: 10,
        toChapter: 19,
        offsetPx: 950,
        heightPx: 1000,
      })
    ).toBe(19)
  })

  test('viewport read-line inside a spacer maps to a chapter in that range', () => {
    expect(
      viewportSettledChapter(
        [{ chapter: 10, toChapter: 19, top: 0, bottom: 1000 }],
        0,
        500
      )
    ).toBeGreaterThanOrEqual(10)
  })

  test('at document end, a short last gap wins over the previous chapter read-line', () => {
    expect(
      settleViewportChapter({
        entries: [
          { chapter: 12, top: -2000, bottom: 174 },
          { chapter: 13, top: 198, bottom: 642 },
        ],
        rootTop: 89,
        rootBottom: 657,
        nearEnd: true,
      })
    ).toBe(13)
    expect(
      settleViewportChapter({
        entries: [
          { chapter: 12, top: -2000, bottom: 174 },
          { chapter: 13, top: 198, bottom: 642 },
        ],
        rootTop: 89,
        rootBottom: 657,
        nearEnd: false,
      })
    ).toBe(12)
  })
})
