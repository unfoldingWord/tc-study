import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Hard ≤400 for peeled composers — aligned with godSize.test.ts. */
const READ_COMPOSER_HARD_MAX = 400
const STUDIO_COMPOSER_HARD_MAX = 400

describe('composerSize', () => {
  test('SimplifiedReadView stays under hard budget', () => {
    const src = readFileSync(
      join(import.meta.dir, '../../components/read/SimplifiedReadView.tsx'),
      'utf8'
    )
    const lines = src.split(/\r?\n/).length
    expect(lines).toBeLessThanOrEqual(READ_COMPOSER_HARD_MAX)
  })

  test('LinkedPanelsStudio stays under hard budget (≤400)', () => {
    const src = readFileSync(
      join(import.meta.dir, '../../components/studio/LinkedPanelsStudio.tsx'),
      'utf8'
    )
    const lines = src.split(/\r?\n/).length
    expect(lines).toBeLessThanOrEqual(STUDIO_COMPOSER_HARD_MAX)
  })
})
