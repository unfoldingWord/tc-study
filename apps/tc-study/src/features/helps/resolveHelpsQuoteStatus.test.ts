import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isHelpsQuoteAlignmentPending,
  isQuoteBuildReady,
  resolveHelpsQuoteStatus,
} from './resolveHelpsQuoteStatus'

describe('isQuoteBuildReady', () => {
  test('first paint (null content, not loading) is not ready', () => {
    expect(
      isQuoteBuildReady({ loadingOriginal: false, originalContent: null, originalError: null })
    ).toBe(false)
  })

  test('loading original language is not ready', () => {
    expect(isQuoteBuildReady({ loadingOriginal: true, originalContent: null })).toBe(false)
    expect(isQuoteBuildReady({ loadingOriginal: true, originalContent: [{ n: 1 }] })).toBe(false)
  })

  test('non-empty UGNT/UHB chapters are ready', () => {
    expect(isQuoteBuildReady({ loadingOriginal: false, originalContent: [{ n: 1 }] })).toBe(true)
  })

  test('empty UGNT/UHB attempt stays pending (do not settle Greek/Hebrew as OL-fallback)', () => {
    expect(isQuoteBuildReady({ loadingOriginal: false, originalContent: [] })).toBe(false)
    expect(
      isQuoteBuildReady({ loadingOriginal: false, originalContent: null, originalError: 'fail' })
    ).toBe(false)
  })
})

describe('isHelpsQuoteAlignmentPending', () => {
  test('pending when tokens, passage bind, or quote-build are not ready', () => {
    expect(
      isHelpsQuoteAlignmentPending({
        hasTargetTokens: false,
        tokensMatchPassage: true,
        quoteBuildReady: true,
      })
    ).toBe(true)
    expect(
      isHelpsQuoteAlignmentPending({
        hasTargetTokens: true,
        tokensMatchPassage: false,
        quoteBuildReady: true,
      })
    ).toBe(true)
    expect(
      isHelpsQuoteAlignmentPending({
        hasTargetTokens: true,
        tokensMatchPassage: true,
        quoteBuildReady: false,
      })
    ).toBe(true)
  })

  test('settled when tokens match the passage and quote-build finished', () => {
    expect(
      isHelpsQuoteAlignmentPending({
        hasTargetTokens: true,
        tokensMatchPassage: true,
        quoteBuildReady: true,
      })
    ).toBe(false)
  })
})

describe('resolveHelpsQuoteStatus', () => {
  test('aligned wins over pending and OL text', () => {
    expect(
      resolveHelpsQuoteStatus({
        hasAlignedTokens: true,
        alignmentPending: true,
        olQuote: 'בֹּעַז',
      })
    ).toBe('aligned')
  })

  test('pending is not painted as a finished OL fallback', () => {
    expect(
      resolveHelpsQuoteStatus({
        hasAlignedTokens: false,
        alignmentPending: true,
        olQuote: 'בֹּעַז',
      })
    ).toBe('pending')
  })

  test('settled miss with origWords is OL fallback', () => {
    expect(
      resolveHelpsQuoteStatus({
        hasAlignedTokens: false,
        alignmentPending: false,
        olQuote: 'בֹּעַז',
      })
    ).toBe('ol-fallback')
  })

  test('settled miss without origWords is none', () => {
    expect(
      resolveHelpsQuoteStatus({
        hasAlignedTokens: false,
        alignmentPending: false,
        olQuote: '   ',
      })
    ).toBe('none')
  })

  test('TN note.quote uses the same pending vs OL-fallback rules as TWL origWords', () => {
    const tnQuote = 'בֹּעַז'
    expect(
      resolveHelpsQuoteStatus({
        hasAlignedTokens: false,
        alignmentPending: true,
        olQuote: tnQuote,
      })
    ).toBe('pending')
    expect(
      resolveHelpsQuoteStatus({
        hasAlignedTokens: false,
        alignmentPending: false,
        olQuote: tnQuote,
      })
    ).toBe('ol-fallback')
    expect(
      resolveHelpsQuoteStatus({
        hasAlignedTokens: true,
        alignmentPending: false,
        olQuote: tnQuote,
      })
    ).toBe('aligned')
  })
})

describe('TN quote-status wiring (same helper as TWL)', () => {
  const tnCardSrc = readFileSync(
    join(
      import.meta.dir,
      '../../components/resources/TranslationNotesViewer/components/TranslationNoteCard.tsx'
    ),
    'utf8'
  )
  const twlCardSrc = readFileSync(
    join(
      import.meta.dir,
      '../../components/resources/WordsLinksViewer/components/WordLinkCard.tsx'
    ),
    'utf8'
  )
  const combinedPipelineSrc = readFileSync(
    join(
      import.meta.dir,
      '../../components/resources/CombinedHelpsViewer/useCombinedHelpsPipeline.ts'
    ),
    'utf8'
  )
  const tnPipelineSrc = readFileSync(
    join(
      import.meta.dir,
      '../../components/resources/TranslationNotesViewer/hooks/useTranslationNotesPipeline.ts'
    ),
    'utf8'
  )

  test('TranslationNoteCard reuses resolveHelpsQuoteStatus and pending spinner', () => {
    expect(tnCardSrc).toContain('resolveHelpsQuoteStatus')
    expect(tnCardSrc).toContain('quoteStatus')
    expect(tnCardSrc).toContain("quoteStatus === 'pending'")
    expect(tnCardSrc).toContain("quoteStatus === 'ol-fallback'")
    expect(tnCardSrc).toContain('Building quote')
    expect(tnCardSrc).toContain('olQuote: note.quote')
    expect(tnCardSrc).not.toMatch(
      /!hasAlignedTokens && note\.quote && note\.quote\.trim\(\)\.length > 0 && !obsMode/
    )
  })

  test('WordLinkCard pending treatment is unchanged', () => {
    expect(twlCardSrc).toContain('resolveHelpsQuoteStatus')
    expect(twlCardSrc).toContain("quoteStatus === 'pending'")
    expect(twlCardSrc).toContain("quoteStatus === 'ol-fallback'")
    expect(twlCardSrc).toContain('Building quote')
    expect(twlCardSrc).toContain('olQuote: link.origWords')
  })

  test('CombinedHelps TN half passes quoteBuildReady and copies quoteStatus', () => {
    expect(combinedPipelineSrc).toContain('quoteBuildReady: tnQuoteBuildReady')
    expect(combinedPipelineSrc).toContain('quoteBuildReady: twlQuoteBuildReady')
    expect(combinedPipelineSrc).toContain('quoteStatus: quoteStatusMap.get(note.id)')
  })

  test('standalone TN pipeline also threads quoteBuildReady and quoteStatus', () => {
    expect(tnPipelineSrc).toContain('quoteBuildReady')
    expect(tnPipelineSrc).toContain('quoteStatus: quoteStatusMap.get(note.id)')
  })
})
