import { describe, expect, test } from 'bun:test'
import type { NavigationMode } from '../../contexts/types'
import {
  BIBLE_NAVIGATION_MODE_ORDER,
  OBS_NAVIGATION_MODE_ORDER,
  nextNavigationMode,
  resolveNavigationModeInOrder,
} from './navigationTypeCycle'

describe('navigationTypeCycle', () => {
  test('Bible order is Custom Range → Chapter → Section → Passage Set', () => {
    expect([...BIBLE_NAVIGATION_MODE_ORDER]).toEqual([
      'verse',
      'chapter',
      'section',
      'passage-set',
    ])
    expect(nextNavigationMode(BIBLE_NAVIGATION_MODE_ORDER, 'verse')).toBe('chapter')
    expect(nextNavigationMode(BIBLE_NAVIGATION_MODE_ORDER, 'chapter')).toBe('section')
    expect(nextNavigationMode(BIBLE_NAVIGATION_MODE_ORDER, 'section')).toBe('passage-set')
    expect(nextNavigationMode(BIBLE_NAVIGATION_MODE_ORDER, 'passage-set')).toBe('verse')
  })

  test('Stories order is Frame → Story', () => {
    expect([...OBS_NAVIGATION_MODE_ORDER]).toEqual(['verse', 'chapter'])
    expect(nextNavigationMode(OBS_NAVIGATION_MODE_ORDER, 'verse')).toBe('chapter')
    expect(nextNavigationMode(OBS_NAVIGATION_MODE_ORDER, 'chapter')).toBe('verse')
  })

  test('unknown current mode starts the cycle from the first type', () => {
    expect(nextNavigationMode(BIBLE_NAVIGATION_MODE_ORDER, 'not-a-mode' as NavigationMode)).toBe(
      'chapter'
    )
    expect(resolveNavigationModeInOrder(OBS_NAVIGATION_MODE_ORDER, 'section')).toBe('verse')
    expect(resolveNavigationModeInOrder(BIBLE_NAVIGATION_MODE_ORDER, 'chapter')).toBe('chapter')
  })
})
