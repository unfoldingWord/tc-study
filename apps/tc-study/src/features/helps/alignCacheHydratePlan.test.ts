import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  broadcastTokensCoverFullChapter,
  planAlignCacheHydrate,
  resolveLiveAlignTargetSource,
} from './alignCacheHydratePlan'

describe('broadcastTokensCoverFullChapter', () => {
  test('accepts single-chapter whole-unit broadcast (verse 1→999)', () => {
    expect(
      broadcastTokensCoverFullChapter({
        hasTokens: true,
        passageStartChapter: 14,
        passageEndChapter: 14,
        tokenChapter: 14,
        tokenEndChapter: 14,
        tokenStartVerse: 1,
        tokenEndVerse: 999,
      })
    ).toBe(true)
  })

  test('accepts verse 1→chapter-end hydrate (nav last verse)', () => {
    expect(
      broadcastTokensCoverFullChapter({
        hasTokens: true,
        passageStartChapter: 14,
        passageEndChapter: 14,
        tokenChapter: 14,
        tokenEndChapter: 14,
        tokenStartVerse: 1,
        tokenEndVerse: 7,
      })
    ).toBe(true)
  })

  test('rejects mid-chapter verse-span broadcast', () => {
    expect(
      broadcastTokensCoverFullChapter({
        hasTokens: true,
        passageStartChapter: 14,
        passageEndChapter: 14,
        tokenChapter: 14,
        tokenEndChapter: 14,
        tokenStartVerse: 3,
        tokenEndVerse: 7,
      })
    ).toBe(false)
  })

  test('rejects multi-chapter passage without prepared per chapter', () => {
    expect(
      broadcastTokensCoverFullChapter({
        hasTokens: true,
        passageStartChapter: 14,
        passageEndChapter: 15,
        tokenChapter: 14,
        tokenEndChapter: 15,
        tokenStartVerse: 1,
        tokenEndVerse: 999,
      })
    ).toBe(false)
  })
})

describe('planAlignCacheHydrate', () => {
  test('full IDB hit without tokens waits instead of live-align rebuild', () => {
    expect(
      planAlignCacheHydrate({
        canReconstruct: false,
        hitCount: 40,
        missCount: 0,
        hasAnyTargetTokens: false,
      })
    ).toBe('wait-for-tokens')
  })

  test('full IDB hit with display texts paints without waiting for tokens', () => {
    expect(
      planAlignCacheHydrate({
        canReconstruct: false,
        hitCount: 40,
        missCount: 0,
        hasAnyTargetTokens: false,
        canPaintDisplay: true,
      })
    ).toBe('paint-display')
  })

  test('reconstruct preferred over paint-display when tokens ready', () => {
    expect(
      planAlignCacheHydrate({
        canReconstruct: true,
        hitCount: 40,
        missCount: 0,
        hasAnyTargetTokens: true,
        canPaintDisplay: true,
      })
    ).toBe('reconstruct')
  })

  test('full IDB hit with non-full tokens falls back to live-align', () => {
    expect(
      planAlignCacheHydrate({
        canReconstruct: false,
        hitCount: 40,
        missCount: 0,
        hasAnyTargetTokens: true,
      })
    ).toBe('live-align')
  })

  test('IDB hits with reconstruct tokens use cache', () => {
    expect(
      planAlignCacheHydrate({
        canReconstruct: true,
        hitCount: 40,
        missCount: 0,
        hasAnyTargetTokens: true,
      })
    ).toBe('reconstruct')
    expect(
      planAlignCacheHydrate({
        canReconstruct: true,
        hitCount: 30,
        missCount: 10,
        hasAnyTargetTokens: true,
      })
    ).toBe('reconstruct')
  })

  test('cache miss live-aligns', () => {
    expect(
      planAlignCacheHydrate({
        canReconstruct: true,
        hitCount: 0,
        missCount: 40,
        hasAnyTargetTokens: true,
      })
    ).toBe('live-align')
    expect(
      planAlignCacheHydrate({
        canReconstruct: false,
        hitCount: 0,
        missCount: 40,
        hasAnyTargetTokens: false,
      })
    ).toBe('live-align')
  })
})

describe('resolveLiveAlignTargetSource', () => {
  test('uses prepared full without waiting for SCRIPTURE_TOKENS', () => {
    expect(
      resolveLiveAlignTargetSource({
        preparedFlat: [{}, {}],
        broadcastTokens: [],
        hasBroadcastTokens: false,
        currentChapter: 3,
        endChapter: 3,
        tokenChapter: 1,
        tokenEndChapter: 1,
        tokenStartVerse: 1,
        tokenEndVerse: 1,
      })
    ).toEqual({
      usePrepared: true,
      hasTokens: true,
      tokenChapter: 3,
      tokenEndChapter: 3,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
    })
  })

  test('falls back to broadcast when prepared is absent', () => {
    expect(
      resolveLiveAlignTargetSource({
        preparedFlat: null,
        broadcastTokens: [{}],
        hasBroadcastTokens: true,
        currentChapter: 3,
        endChapter: 3,
        tokenChapter: 3,
        tokenEndChapter: 3,
        tokenStartVerse: 2,
        tokenEndVerse: 10,
      })
    ).toEqual({
      usePrepared: false,
      hasTokens: true,
      tokenChapter: 3,
      tokenEndChapter: 3,
      tokenStartVerse: 2,
      tokenEndVerse: 10,
    })
  })
})

describe('useAlignedTokens honors align cache when prepared is late', () => {
  test('reads IDB before live-align and uses hydrate plan', () => {
    const src = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts'
      ),
      'utf8'
    )
    expect(src).toContain('planAlignCacheHydrate')
    expect(src).toContain('broadcastTokensCoverFullChapter')
    expect(src).toContain('resolveLiveAlignTargetSource')
    expect(src).toContain('readCachedAlignmentsForSpan')
    expect(src).toContain('ensurePreparedFullChapter')
    expect(src).toContain('subscribePrepareReady')
    expect(src).toContain("if (plan === 'reconstruct')")
    // Must not bail to live-align solely because prepared:full is missing.
    expect(src).not.toMatch(/if \(!allPrepared[\s\S]{0,120}runLiveAlign/)
  })
})
