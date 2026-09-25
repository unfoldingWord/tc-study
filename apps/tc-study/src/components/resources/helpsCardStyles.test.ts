import { describe, expect, test } from 'bun:test'
import {
  HELPS_CARD_FOOTER_BUTTON_TA,
  HELPS_CARD_FOOTER_BUTTON_TW,
  HELPS_CARD_IDLE,
  HELPS_CARD_SELECTED,
  HELPS_COMPACT_STICKY_BAR,
  helpsCardStateClass,
  HELPS_LIST_PANEL,
  HELPS_LIST_SHELL,
  HELPS_VERSE_HEADER,
  HELPS_VERSE_HEADER_STICKY,
} from './helpsCardStyles'

describe('helps card footer kind colors (CVD)', () => {
  test('TW uses accent blue, TA uses warning amber — not helps purple', () => {
    expect(HELPS_CARD_FOOTER_BUTTON_TW).toContain('text-accent-fg')
    expect(HELPS_CARD_FOOTER_BUTTON_TW).toContain('hover:text-accent')
    expect(HELPS_CARD_FOOTER_BUTTON_TA).toContain('text-warning-fg')
    expect(HELPS_CARD_FOOTER_BUTTON_TA).toContain('hover:text-warning')
    expect(HELPS_CARD_FOOTER_BUTTON_TA).not.toContain('helps')
  })
})

describe('helps card active states', () => {
  test('clicked card keeps the highlight wash', () => {
    expect(helpsCardStateClass(true, false)).toBe(HELPS_CARD_SELECTED)
    expect(helpsCardStateClass(false, false)).toBe(HELPS_CARD_IDLE)
  })

  test('filter source uses accent chrome, distinct from click highlight', () => {
    const source = helpsCardStateClass(false, true)
    expect(source).toContain('border-accent')
    expect(source).toContain('bg-accent-soft')
    expect(source).not.toBe(HELPS_CARD_SELECTED)
  })

  test('clicked + filter source keeps accent primary and adds a highlight ring', () => {
    const both = helpsCardStateClass(true, true)
    expect(both).toContain('border-accent')
    expect(both).toContain('ring-highlight-strong')
    expect(both).toContain('ring-inset')
    expect(both).not.toBe(helpsCardStateClass(false, true))
    expect(both).not.toBe(HELPS_CARD_SELECTED)
  })
})

describe('helps list panel scroll containment', () => {
  test('flex child can shrink so the scrollbar stays inside the panel', () => {
    expect(HELPS_LIST_PANEL).toContain('min-h-0')
    expect(HELPS_LIST_PANEL).toContain('overflow-y-auto')
    expect(HELPS_LIST_PANEL).toContain('flex-1')
  })

  test('CombinedHelps shell keeps the compact sticky chrome out of the scrollport', () => {
    expect(HELPS_LIST_SHELL).toContain('flex-col')
    expect(HELPS_LIST_SHELL).toContain('min-h-0')
    expect(HELPS_LIST_SHELL).toContain('h-full')
    expect(HELPS_LIST_SHELL).not.toContain('overflow-y-auto')
    expect(HELPS_COMPACT_STICKY_BAR).toContain('sticky')
    expect(HELPS_COMPACT_STICKY_BAR).toContain('top-0')
    expect(HELPS_VERSE_HEADER).not.toContain('sticky')
    expect(HELPS_VERSE_HEADER_STICKY).toContain('sticky')
    expect(HELPS_VERSE_HEADER_STICKY).toContain('top-0')
  })
})
