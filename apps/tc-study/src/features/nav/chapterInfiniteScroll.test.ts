import { describe, expect, test } from 'bun:test'
import {
  canRevealChapterAtEdge,
  FULL_TIER_HOLD_MS,
  SETTLE_HOLD_MS,
  CHAPTER_REVEAL_PEEK_PX,
  peekScrollTopAfterEdgeReveal,
  adjacentChapterToRequest,
  isChapterInfiniteScrollEnabled,
  chapterWindowAround,
  edgeRevealTargetChapter,
  inFlightTargetsAfterPeek,
  paragraphChaptersFromSlots,
  revealChapterInWindow,
  settleViewportChapter,
  shouldBlockEdgeRevealRetrigger,
  shouldCommitSettledChapter,
  shouldReleaseEdgeRevealSnapBack,
  singlePaintedChapterSlots,
  upgradeSlot,
  viewportSettledChapter,
} from './chapterInfiniteScroll'

describe('chapterInfiniteScroll mode gate', () => {
  test('only Bible chapter grain enables edge-reveal', () => {
    expect(isChapterInfiniteScrollEnabled('chapter', 'tit')).toBe(true)
    expect(isChapterInfiniteScrollEnabled('verse', 'tit')).toBe(false)
    expect(isChapterInfiniteScrollEnabled('section', 'tit')).toBe(false)
    expect(isChapterInfiniteScrollEnabled('passage-set', 'tit')).toBe(false)
    expect(isChapterInfiniteScrollEnabled('chapter', 'obs')).toBe(false)
  })
})

describe('chapter edge-reveal stack', () => {
  test('paints a single chapter slot initially', () => {
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

describe('chapterInfiniteScroll stack upgrades', () => {
  test('revealed paragraph chapters upgrade to rendered without downgrading', () => {
    let slots = revealChapterInWindow(singlePaintedChapterSlots(2), 3, 'next', 16)
    expect(paragraphChaptersFromSlots(slots)).toEqual([2, 3])
    slots = upgradeSlot(slots, 3)
    expect(slots.find((slot) => slot.chapter === 3)?.kind).toBe('rendered')
    expect(slots.find((slot) => slot.chapter === 2)?.kind).toBe('paragraph')
    // Re-revealing a rendered chapter keeps its token tree.
    expect(revealChapterInWindow(slots, 3, 'next', 16).find((slot) => slot.chapter === 3)?.kind).toBe(
      'rendered'
    )
    expect(FULL_TIER_HOLD_MS).toBe(0)
  })

  test('settle hold is long enough that a continuous scroll stays scrolling', () => {
    expect(SETTLE_HOLD_MS).toBeGreaterThanOrEqual(250)
  })

  test('first and last chapter do not wrap', () => {
    expect(adjacentChapterToRequest(1, 'prev', 16)).toBeNull()
    expect(adjacentChapterToRequest(16, 'next', 16)).toBeNull()
    expect(chapterWindowAround(10, 21)).toEqual([9, 10, 11])
  })
})

describe('chapterInfiniteScroll nav settle', () => {
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
        userMovedSinceReveal: true,
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
        inFlightTargets: [4],
        target: 4,
      })
    ).toBe(true)
    // Overlapping load: a different neighbor must still be allowed while 4
    // is in-flight (programmatic peek suppress must not blanket-block).
    expect(
      shouldBlockEdgeRevealRetrigger({
        inFlightTargets: [4],
        target: 5,
      })
    ).toBe(false)
    expect(
      shouldBlockEdgeRevealRetrigger({
        inFlightTargets: [],
        target: 5,
      })
    ).toBe(false)
    expect(shouldBlockEdgeRevealRetrigger({ inFlightTargets: [4], target: null })).toBe(true)

    expect(inFlightTargetsAfterPeek([4, 5], [3, 4])).toEqual([5])
    expect(inFlightTargetsAfterPeek([4], [3, 4])).toEqual([])

    // Peek leaves the previous chapter on the read-line — settle must not
    // snap nav back (that would look like a picker jump and re-reveal).
    expect(
      shouldCommitSettledChapter({
        parked: 3,
        navChapter: 4,
        paintedHasParked: true,
        blockSnapBackTo: 3,
        userMovedSinceReveal: false,
      })
    ).toBe(false)
    expect(
      shouldReleaseEdgeRevealSnapBack({
        parked: 3,
        blockSnapBackTo: 3,
        userMovedSinceReveal: false,
      })
    ).toBe(false)
  })

  test('edge-reveal snap-back pin allows settle once the user scrolls another chapter into view', () => {
    expect(
      shouldCommitSettledChapter({
        parked: 5,
        navChapter: 6,
        paintedHasParked: true,
        blockSnapBackTo: 5,
        userMovedSinceReveal: false,
      })
    ).toBe(false)
    expect(
      shouldCommitSettledChapter({
        parked: 6,
        navChapter: 6,
        paintedHasParked: true,
        blockSnapBackTo: 5,
        userMovedSinceReveal: false,
      })
    ).toBe(false)
    // Peek settle must not snap to a stacked neighbor until the user scrolls.
    expect(
      shouldCommitSettledChapter({
        parked: 7,
        navChapter: 6,
        paintedHasParked: true,
        blockSnapBackTo: 5,
        userMovedSinceReveal: false,
      })
    ).toBe(false)
    // After a real scroll, chrome follows the parked stacked chapter.
    expect(
      shouldCommitSettledChapter({
        parked: 7,
        navChapter: 6,
        paintedHasParked: true,
        blockSnapBackTo: 5,
        userMovedSinceReveal: true,
      })
    ).toBe(true)
    expect(
      shouldReleaseEdgeRevealSnapBack({
        parked: 6,
        blockSnapBackTo: 5,
        userMovedSinceReveal: false,
      })
    ).toBe(false)
    expect(
      shouldReleaseEdgeRevealSnapBack({
        parked: 7,
        blockSnapBackTo: 5,
        userMovedSinceReveal: true,
      })
    ).toBe(true)
  })
})

describe('chapterInfiniteScroll document end', () => {
  test('at document end, a short last chapter wins over the previous chapter read-line', () => {
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
