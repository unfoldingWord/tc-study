import { describe, expect, test } from 'bun:test'
import { blockClassForMarker, indentClassForLevel } from './paraStyles'

describe('paraStyles', () => {
  test('indentClassForLevel maps poetry steps', () => {
    expect(indentClassForLevel(0)).toBe('')
    expect(indentClassForLevel(1)).toBe('pl-6')
    expect(indentClassForLevel(2)).toBe('pl-10')
    expect(indentClassForLevel(4)).toBe('pl-16')
  })

  test('blockClassForMarker styles poetry, headings, and breaks', () => {
    expect(blockClassForMarker('b', 'break', 0)).toContain('h-3')
    expect(blockClassForMarker('s1', 'heading', 0)).toContain('font-semibold')
    expect(blockClassForMarker('q1', 'para', 1)).toContain('pl-6')
    expect(blockClassForMarker('q2', 'para', 2)).toContain('pl-10')
    expect(blockClassForMarker('p', 'para', 0)).toContain('mb-3')
  })
})
