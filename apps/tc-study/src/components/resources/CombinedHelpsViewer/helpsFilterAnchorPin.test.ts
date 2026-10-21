import { describe, expect, test } from 'bun:test'
import {
  HELPS_ANCHOR_PIN_OFFSET_PX,
  HELPS_ANCHOR_PIN_RELEASE_EVENTS,
  helpsAnchorRowId,
  helpsAnchorSelection,
  helpsFilterAnchorFromRow,
  scrollTopToPinAnchor,
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

  test('apply: a far-below card is pulled to the pin offset near the top', () => {
    expect(scrollTopToPinAnchor({ scrollTop: 0, anchorOffsetTop: 21031 })).toBe(
      21031 - HELPS_ANCHOR_PIN_OFFSET_PX
    )
  })

  test('filtered list shrinks: card above the scrollport comes back down', () => {
    expect(scrollTopToPinAnchor({ scrollTop: 6451, anchorOffsetTop: -6000 })).toBe(
      6451 - 6000 - HELPS_ANCHOR_PIN_OFFSET_PX
    )
  })

  test('rows growing above push the card down; pin pulls it back to the offset', () => {
    // Live repro: card drifted to 505px in a 532px scrollport (only 27px visible).
    expect(scrollTopToPinAnchor({ scrollTop: 5957, anchorOffsetTop: 505 })).toBe(
      5957 + 505 - HELPS_ANCHOR_PIN_OFFSET_PX
    )
  })

  test('a card already at the offset is left alone (no scroll churn)', () => {
    expect(scrollTopToPinAnchor({ scrollTop: 240, anchorOffsetTop: 16 })).toBe(240)
    expect(scrollTopToPinAnchor({ scrollTop: 240, anchorOffsetTop: 16.4 })).toBe(240)
  })

  test('never asks for a negative scrollTop', () => {
    expect(scrollTopToPinAnchor({ scrollTop: 0, anchorOffsetTop: 4 })).toBe(0)
  })

  test('user input releases the pin; programmatic scroll does not', () => {
    expect(HELPS_ANCHOR_PIN_RELEASE_EVENTS).toContain('wheel')
    expect(HELPS_ANCHOR_PIN_RELEASE_EVENTS).toContain('touchmove')
    expect(HELPS_ANCHOR_PIN_RELEASE_EVENTS).toContain('pointerdown')
    expect(HELPS_ANCHOR_PIN_RELEASE_EVENTS).not.toContain('scroll' as never)
  })

  test('Metaphor note anchor uses tn kind', () => {
    const metaphor = helpsFilterAnchorFromRow('tn', 'n-psa-23', '23:1')
    expect(helpsAnchorRowId(metaphor)).toBe('helps-row-tn-n-psa-23')
    expect(helpsAnchorSelection(metaphor)).toEqual({ kind: 'tn', id: 'n-psa-23' })
  })
})
