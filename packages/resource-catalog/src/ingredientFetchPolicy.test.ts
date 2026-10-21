import { describe, expect, test } from 'bun:test'
import {
  PARTIAL_CACHE_INDIVIDUAL_MIN_CACHED,
  chooseIngredientFetchMode,
} from './ingredientFetchPolicy'

describe('chooseIngredientFetchMode', () => {
  test('cold start (0 cached) uses zip when work remains', () => {
    expect(
      chooseIngredientFetchMode({ cachedCount: 0, remainingToFetchCount: 40 })
    ).toBe('zip')
  })

  test('partial cache at/above threshold uses individual fill', () => {
    expect(PARTIAL_CACHE_INDIVIDUAL_MIN_CACHED).toBe(1)
    expect(
      chooseIngredientFetchMode({ cachedCount: 1, remainingToFetchCount: 39 })
    ).toBe('individual')
    expect(
      chooseIngredientFetchMode({ cachedCount: 60, remainingToFetchCount: 2 })
    ).toBe('individual')
  })

  test('nothing remaining skips (complete or only phantoms)', () => {
    expect(
      chooseIngredientFetchMode({ cachedCount: 40, remainingToFetchCount: 0 })
    ).toBe('skip')
    expect(
      chooseIngredientFetchMode({ cachedCount: 0, remainingToFetchCount: 0 })
    ).toBe('skip')
  })
})
