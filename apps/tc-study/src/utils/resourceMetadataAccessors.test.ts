import { describe, expect, test } from 'bun:test'
import { getContentStructure, getIngredients } from './resourceMetadataAccessors'

describe('resourceMetadataAccessors', () => {
  test('reads top-level ingredients', () => {
    expect(getIngredients({ ingredients: [{ identifier: 'gen' }] })).toEqual([
      { identifier: 'gen' },
    ])
  })

  test('falls back to contentMetadata.ingredients', () => {
    expect(
      getIngredients({ contentMetadata: { ingredients: [{ identifier: 'exo' }] } })
    ).toEqual([{ identifier: 'exo' }])
  })

  test('reads contentStructure with legacy fallback', () => {
    expect(getContentStructure({ contentStructure: 'book' })).toBe('book')
    expect(
      getContentStructure({ contentMetadata: { contentStructure: 'entry' } })
    ).toBe('entry')
  })
})
