import { describe, expect, test } from 'bun:test'
import {
  currentHelpsGroupFromBounds,
  isHelpsGroupHeaderInView,
  shouldShowStickyCurrentRefClone,
} from './helpsStickyCurrentRef'

describe('helpsStickyCurrentRef', () => {
  const groups = [
    { ref: '1:4', top: 0, bottom: 400 },
    { ref: '1:6', top: 400, bottom: 700 },
    { ref: '1:8', top: 700, bottom: 900 },
  ]

  test('picks the group that contains the scrollport top', () => {
    expect(currentHelpsGroupFromBounds(groups, 50)).toBe('1:4')
    expect(currentHelpsGroupFromBounds(groups, 400)).toBe('1:6')
    expect(currentHelpsGroupFromBounds(groups, 650)).toBe('1:6')
  })

  test('does not stay on the first mounted group when a later group is on screen', () => {
    expect(currentHelpsGroupFromBounds(groups, 720)).toBe('1:8')
  })

  test('uses the first group while the viewport is in list padding above it', () => {
    expect(currentHelpsGroupFromBounds(groups, -24)).toBe('1:4')
  })

  test('uses the last group when the viewport is past every group', () => {
    expect(currentHelpsGroupFromBounds(groups, 1200)).toBe('1:8')
  })

  test('returns null when no groups are mounted', () => {
    expect(currentHelpsGroupFromBounds([], 0)).toBeNull()
  })

  test('shows a sticky clone only when the native header has left the scrollport', () => {
    expect(shouldShowStickyCurrentRefClone('1:4', true)).toBe(false)
    expect(shouldShowStickyCurrentRefClone('1:4', false)).toBe(true)
    expect(shouldShowStickyCurrentRefClone(null, false)).toBe(false)
  })

  test('treats a CSS-stuck header at the scrollport top as still visible', () => {
    expect(
      isHelpsGroupHeaderInView({ top: 80, bottom: 108 }, { top: 80, bottom: 640 })
    ).toBe(true)
    expect(
      isHelpsGroupHeaderInView({ top: -40, bottom: -8 }, { top: 80, bottom: 640 })
    ).toBe(false)
  })
})
