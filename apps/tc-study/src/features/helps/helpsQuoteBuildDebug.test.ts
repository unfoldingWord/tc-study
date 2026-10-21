import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  diagnoseHelpsAlignMiss,
  helpsQuoteMissLogKey,
  isHelpsQuoteDebugVerbose,
  logHelpsAlignMisses,
  logHelpsQuoteBuildMiss,
  resetHelpsQuoteBuildDebugLog,
  shouldLogHelpsQuoteMiss,
} from './helpsQuoteBuildDebug'

describe('helpsQuoteBuildDebug', () => {
  test('diagnose identifies align_matcher_empty when all gates pass', () => {
    const miss = diagnoseHelpsAlignMiss({
      hasOrigWords: true,
      hasAlignedTokens: false,
      hasTargetTokens: true,
      quoteBuildReady: true,
      bookCode: 'psa',
      tokenBook: 'psa',
      linkChapter: 14,
      linkVerse: 1,
      passageStartChapter: 14,
      passageEndChapter: 14,
      tokenChapter: 14,
      tokenEndChapter: 14,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      quoteTokenCount: 2,
    })
    expect(miss?.reason).toBe('align_matcher_empty')
  })

  test('diagnose identifies token span and quote-token gaps', () => {
    expect(
      diagnoseHelpsAlignMiss({
        hasOrigWords: true,
        hasAlignedTokens: false,
        hasTargetTokens: true,
        quoteBuildReady: true,
        bookCode: 'psa',
        tokenBook: 'tit',
        linkChapter: 1,
        linkVerse: 1,
        passageStartChapter: 1,
        passageEndChapter: 1,
        tokenChapter: 1,
        tokenEndChapter: 1,
        tokenStartVerse: 1,
        tokenEndVerse: 999,
        quoteTokenCount: 1,
      })?.reason
    ).toBe('tokens_book_or_chapter_mismatch')

    expect(
      diagnoseHelpsAlignMiss({
        hasOrigWords: true,
        hasAlignedTokens: false,
        hasTargetTokens: true,
        quoteBuildReady: true,
        bookCode: 'psa',
        tokenBook: 'psa',
        linkChapter: 1,
        linkVerse: 1,
        passageStartChapter: 1,
        passageEndChapter: 1,
        tokenChapter: 1,
        tokenEndChapter: 1,
        tokenStartVerse: 1,
        tokenEndVerse: 999,
        quoteTokenCount: 0,
      })?.reason
    ).toBe('quote_tokens_empty')
  })

  test('verbose-only reasons stay quiet unless debug flag is on', () => {
    expect(shouldLogHelpsQuoteMiss('no_target_tokens')).toBe(isHelpsQuoteDebugVerbose())
    expect(shouldLogHelpsQuoteMiss('align_matcher_empty')).toBe(true)
    expect(shouldLogHelpsQuoteMiss('quote_tokens_empty')).toBe(true)
  })

  test('logHelpsQuoteBuildMiss dedupes identical keys', () => {
    resetHelpsQuoteBuildDebugLog()
    const event = {
      stage: 'align' as const,
      reason: 'align_matcher_empty' as const,
      linkId: 'tn-1',
      reference: '14:1',
      resourceKey: 'unfoldingWord/en/tn',
      bookId: 'psa',
      chapter: 14,
    }
    expect(helpsQuoteMissLogKey(event)).toContain('tn-1')
    expect(logHelpsQuoteBuildMiss(event)).toBe(true)
    expect(logHelpsQuoteBuildMiss(event)).toBe(false)
  })

  test('logHelpsAlignMisses reports settled OL rows without ULT', () => {
    resetHelpsQuoteBuildDebugLog()
    const logged = logHelpsAlignMisses({
      resourceKey: 'unfoldingWord/en/tn',
      bookCode: 'psa',
      hasTargetTokens: true,
      quoteBuildReady: true,
      passageStartChapter: 14,
      passageEndChapter: 14,
      tokenBook: 'psa',
      tokenChapter: 14,
      tokenEndChapter: 14,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      results: [
        {
          id: 'tn-g1e5',
          reference: '14:1',
          origWords: 'אֵין אֱלֹהִים',
          quoteTokens: { length: 2 },
          quoteStatus: 'ol-fallback',
        },
        {
          id: 'tn-ok',
          reference: '14:2',
          origWords: 'x',
          quoteStatus: 'aligned',
          alignedTokens: { length: 1 },
        },
      ],
    })
    expect(logged).toBe(1)
  })

  test('hooks import the debug logger', () => {
    const aligned = readFileSync(
      join(import.meta.dir, '../../components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts'),
      'utf8'
    )
    const quotes = readFileSync(
      join(import.meta.dir, '../../components/resources/WordsLinksViewer/hooks/useQuoteTokens.ts'),
      'utf8'
    )
    const support = readFileSync(join(import.meta.dir, 'useSupportRefQuotes.ts'), 'utf8')
    expect(aligned).toContain('logHelpsAlignMisses')
    expect(quotes).toContain('logHelpsQuoteBuildMiss')
    expect(support).toContain('logHelpsQuoteBuildMiss')
  })
})
