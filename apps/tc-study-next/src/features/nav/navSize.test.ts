import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Hard ≤400 for peeled BCV shell; NavigationContext hard after peel (thin facade). */
const BCV_NAVIGATOR_HARD_MAX = 400
/** Soft near actual (~87) + ~10% headroom — was theater soft 600. */
const NAVIGATION_CONTEXT_SOFT_MAX = 96

describe('navSize', () => {
  test('BCVNavigator stays under hard budget (≤400)', () => {
    const src = readFileSync(
      join(import.meta.dir, '../../components/studio/BCVNavigator.tsx'),
      'utf8'
    )
    const lines = src.split('\n').length
    expect(lines).toBeLessThanOrEqual(BCV_NAVIGATOR_HARD_MAX)
  })

  test('NavigationContext stays under soft budget', () => {
    const src = readFileSync(
      join(import.meta.dir, '../../contexts/NavigationContext.tsx'),
      'utf8'
    )
    const lines = src.split('\n').length
    expect(lines).toBeLessThanOrEqual(NAVIGATION_CONTEXT_SOFT_MAX)
  })
})
