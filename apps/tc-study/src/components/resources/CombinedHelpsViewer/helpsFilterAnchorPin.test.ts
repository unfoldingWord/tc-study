import { describe, expect, test } from 'bun:test'
import {
  helpsAnchorRowId,
  helpsAnchorSelection,
  helpsFilterAnchorFromRow,
  nextHelpsAnchorPin,
  prependedGroupRefs,
  prependedGroupsHeight,
  scrollTopToKeepAnchorInView,
  shouldScrollHelpsListToTop,
} from './helpsFilterAnchorPin'

describe('helpsFilterAnchorPin', () => {
  const anchor = helpsFilterAnchorFromRow('twl', 'l-psa-119', '119:105')

  test('builds a stable row id and selection from the apply-anchor', () => {
    expect(helpsAnchorRowId(anchor)).toBe('helps-row-twl-l-psa-119')
    expect(helpsAnchorSelection(anchor)).toEqual({ kind: 'twl', id: 'l-psa-119' })
    expect(helpsAnchorSelection(null)).toBeNull()
  })

  test('skips jump-to-top only when a book-wide chip has an apply-anchor', () => {
    expect(
      shouldScrollHelpsListToTop({ bookWideFilter: true, hasApplyAnchor: true })
    ).toBe(false)
    expect(
      shouldScrollHelpsListToTop({ bookWideFilter: true, hasApplyAnchor: false })
    ).toBe(true)
    expect(
      shouldScrollHelpsListToTop({ bookWideFilter: false, hasApplyAnchor: false })
    ).toBe(true)
  })

  test('prepended earlier groups bump scrollTop so the anchor stays put', () => {
    const prev = ['119:105']
    const next = ['1:1', '8:4', '119:105']
    expect(prependedGroupRefs(prev, next, '119:105')).toEqual(['1:1', '8:4'])
    expect(
      prependedGroupsHeight(['1:1', '8:4'], { '1:1': 240, '8:4': 160, '119:105': 200 })
    ).toBe(400)

    const after = nextHelpsAnchorPin({
      pinned: true,
      userScrolled: false,
      scrollTop: 20,
      prevGroupRefs: prev,
      nextGroupRefs: next,
      groupHeights: { '1:1': 240, '8:4': 160, '119:105': 200 },
      isApplyPass: false,
    })
    expect(after.pinned).toBe(true)
    expect(after.scrollTop).toBe(420)
    expect(after.scrollAnchorIntoView).toBe(true)
  })

  test('chapters landing after 1:n but still above the anchor also bump scroll', () => {
    const after = nextHelpsAnchorPin({
      pinned: true,
      userScrolled: false,
      scrollTop: 240,
      prevGroupRefs: ['1:2', '119:105'],
      nextGroupRefs: ['1:2', '8:4', '119:105'],
      groupHeights: { '1:2': 240, '8:4': 180, '119:105': 200 },
      isApplyPass: false,
      anchorRef: '119:105',
    })
    expect(after.pinned).toBe(true)
    expect(after.scrollTop).toBe(420)
    expect(after.scrollAnchorIntoView).toBe(true)
  })

  test('user-scroll cancels pin; further prepends do not bump scroll', () => {
    const after = nextHelpsAnchorPin({
      pinned: true,
      userScrolled: true,
      scrollTop: 80,
      prevGroupRefs: ['119:105'],
      nextGroupRefs: ['1:1', '119:105'],
      groupHeights: { '1:1': 300, '119:105': 200 },
      isApplyPass: false,
    })
    expect(after.pinned).toBe(false)
    expect(after.scrollTop).toBe(80)
    expect(after.scrollAnchorIntoView).toBe(false)
  })

  test('later-chapter appends do not yank the viewport', () => {
    const after = nextHelpsAnchorPin({
      pinned: true,
      userScrolled: false,
      scrollTop: 120,
      prevGroupRefs: ['1:1', '119:105'],
      nextGroupRefs: ['1:1', '119:105', '150:1'],
      groupHeights: { '1:1': 240, '119:105': 200, '150:1': 180 },
      isApplyPass: false,
    })
    expect(after.pinned).toBe(true)
    expect(after.scrollTop).toBe(120)
    expect(after.scrollAnchorIntoView).toBe(false)
  })

  test('apply pass one-shot scrolls the clicked card into view', () => {
    const after = nextHelpsAnchorPin({
      pinned: true,
      userScrolled: false,
      scrollTop: 0,
      prevGroupRefs: [],
      nextGroupRefs: ['119:105'],
      groupHeights: { '119:105': 200 },
      isApplyPass: true,
    })
    expect(after.pinned).toBe(true)
    expect(after.scrollTop).toBe(0)
    expect(after.scrollAnchorIntoView).toBe(true)
  })

  test('unmeasured prepends fall back to scroll-into-view while pinned', () => {
    const after = nextHelpsAnchorPin({
      pinned: true,
      userScrolled: false,
      scrollTop: 16,
      prevGroupRefs: ['119:105'],
      nextGroupRefs: ['1:1', '119:105'],
      groupHeights: {},
      isApplyPass: false,
    })
    expect(after.scrollTop).toBe(16)
    expect(after.scrollAnchorIntoView).toBe(true)
  })

  test('scrollTopToKeepAnchorInView pulls a far-below card into the scrollport', () => {
    expect(
      scrollTopToKeepAnchorInView({
        scrollTop: 0,
        viewportHeight: 528,
        anchorOffsetTop: 21031,
        anchorHeight: 180,
      })
    ).toBe(21015)
  })

  test('scrollTopToKeepAnchorInView leaves an on-screen card alone', () => {
    expect(
      scrollTopToKeepAnchorInView({
        scrollTop: 240,
        viewportHeight: 528,
        anchorOffsetTop: 80,
        anchorHeight: 160,
      })
    ).toBe(240)
  })

  test('Metaphor note anchor uses tn kind', () => {
    const metaphor = helpsFilterAnchorFromRow('tn', 'n-psa-23', '23:1')
    expect(helpsAnchorRowId(metaphor)).toBe('helps-row-tn-n-psa-23')
    expect(helpsAnchorSelection(metaphor)).toEqual({ kind: 'tn', id: 'n-psa-23' })
  })
})
