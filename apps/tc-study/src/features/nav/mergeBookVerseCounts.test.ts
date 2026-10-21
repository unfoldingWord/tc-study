import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractVerseCountsFromContent,
  getStandardVerseCount,
  mergeVerseCountsFromChapterMap,
} from '../../lib/versification'

describe('mergeVerseCountsFromChapterMap', () => {
  test('Psalms chapter-1-only load keeps 150 chapters', () => {
    const standard = getStandardVerseCount('psa')!
    expect(standard).toHaveLength(150)
    const merged = mergeVerseCountsFromChapterMap('psa', { '1': 6 }, standard)
    expect(merged).toHaveLength(150)
    expect(merged[0]).toBe(6)
    expect(merged[1]).toBe(standard[1])
    expect(merged[149]).toBe(standard[149])
  })

  test('sparse chapter 119 overlays the correct index', () => {
    const merged = mergeVerseCountsFromChapterMap('psa', { '119': 176 })
    expect(merged).toHaveLength(150)
    expect(merged[118]).toBe(176)
    expect(merged[0]).toBe(6)
  })

  test('extractVerseCountsFromContent keeps sparse chapters indexed by number', () => {
    expect(extractVerseCountsFromContent({ '1': 6 })).toEqual([6])
    const sparse = extractVerseCountsFromContent({ '119': 176 })
    expect(sparse).toHaveLength(119)
    expect(sparse[118]).toBe(176)
    expect(sparse[0]).toBe(0)
  })

  test('useContent and BCV slice refuse to shrink chapter-grained books', () => {
    const content = readFileSync(
      join(import.meta.dir, '../../components/resources/ScriptureViewer/hooks/useContent.ts'),
      'utf8'
    )
    expect(content).toContain('mergeVerseCountsFromChapterMap')
    expect(content).not.toMatch(
      /updateBookVerseCount\(\s*bookCode,\s*extractVerseCountsFromContent/
    )

    const slice = readFileSync(join(import.meta.dir, 'navigationBcvSlice.ts'), 'utf8')
    expect(slice).toContain('Never shrink below standard/existing length')
    expect(slice).toContain('getStandardVerseCount')
  })
})
