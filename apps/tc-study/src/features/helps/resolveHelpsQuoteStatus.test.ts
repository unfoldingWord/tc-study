import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isHelpsQuoteAlignmentPending,
  isOriginalLanguageQuoteBlocked,
  isQuoteBuildReady,
  resolveHelpsQuoteStatus,
  resolveHelpsQuoteStatusForNote,
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

  test('UGNT/UHB chapters with word tokens are ready', () => {
    expect(
      isQuoteBuildReady({
        loadingOriginal: false,
        originalContent: [{ verses: [{ tokens: [{ text: 'Παῦλος' }] }] }],
      })
    ).toBe(true)
  })

  test('chapter shells without word tokens stay pending', () => {
    expect(isQuoteBuildReady({ loadingOriginal: false, originalContent: [{ n: 1 }] })).toBe(false)
    expect(
      isQuoteBuildReady({
        loadingOriginal: false,
        originalContent: [{ verses: [{ tokens: [] }] }],
      })
    ).toBe(false)
  })

  test('quotesSettled false keeps align pending even when OL chapters exist', () => {
    expect(
      isQuoteBuildReady({
        loadingOriginal: false,
        originalContent: [{ verses: [{ tokens: [{ text: 'Παῦλος' }] }] }],
        quotesSettled: false,
      })
    ).toBe(false)
  })

  test('empty UGNT/UHB attempt stays pending (do not settle Greek/Hebrew as OL-fallback)', () => {
    expect(isQuoteBuildReady({ loadingOriginal: false, originalContent: [] })).toBe(false)
    expect(
      isQuoteBuildReady({ loadingOriginal: false, originalContent: null, originalError: 'fail' })
    ).toBe(false)
  })
})

describe('isOriginalLanguageQuoteBlocked', () => {
  test('first paint and in-flight load are not blocked', () => {
    expect(
      isOriginalLanguageQuoteBlocked({
        loadingOriginal: false,
        originalContent: null,
      })
    ).toBe(false)
    expect(
      isOriginalLanguageQuoteBlocked({
        loadingOriginal: true,
        originalContent: [],
      })
    ).toBe(false)
  })

  test('attempted empty or error is blocked so notes can paint', () => {
    expect(
      isOriginalLanguageQuoteBlocked({
        loadingOriginal: false,
        originalContent: [],
      })
    ).toBe(true)
    expect(
      isOriginalLanguageQuoteBlocked({
        loadingOriginal: false,
        originalContent: null,
        originalError: 'missing usfm',
      })
    ).toBe(true)
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

describe('resolveHelpsQuoteStatusForNote', () => {
  test('empty-quote notes settle to none instead of perpetual pending', () => {
    expect(
      resolveHelpsQuoteStatusForNote({
        hasAlignedTokens: false,
        quote: '',
      })
    ).toBe('none')
    expect(
      resolveHelpsQuoteStatusForNote({
        hasAlignedTokens: false,
        quote: '   ',
      })
    ).toBe('none')
  })

  test('quoted notes without pipeline status stay pending until aligned', () => {
    expect(
      resolveHelpsQuoteStatusForNote({
        hasAlignedTokens: false,
        quote: 'But you',
      })
    ).toBe('pending')
  })

  test('explicit pipeline status wins', () => {
    expect(
      resolveHelpsQuoteStatusForNote({
        quoteStatus: 'ol-fallback',
        hasAlignedTokens: false,
        quote: 'But you',
      })
    ).toBe('ol-fallback')
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
    expect(tnCardSrc).toContain('resolveHelpsQuoteStatusForNote')
    expect(tnCardSrc).toContain('supportRefQuoteChipKind')
    expect(tnCardSrc).toContain('quoteWarmPending')
    expect(tnCardSrc).toContain("quoteChipKind === 'ol-pending'")
    expect(tnCardSrc).toContain('Building quote')
    expect(tnCardSrc).toContain('quote: note.quote')
    expect(tnCardSrc).not.toContain('alignmentPending: !hasAlignedTokens')
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
    expect(twlCardSrc).toContain('alignmentPending: !hasAlignedTokens')
  })

  test('CombinedHelps TN half passes quoteBuildReady and copies quoteStatus', () => {
    expect(combinedPipelineSrc).toContain('quoteBuildReady: tnQuoteBuildReady')
    expect(combinedPipelineSrc).toContain('quoteBuildReady: twlQuoteBuildReady')
    expect(combinedPipelineSrc).toContain('quoteStatusMap.get(note.id)')
    expect(combinedPipelineSrc).toContain("note.quote?.trim() ? undefined : 'none'")
  })

  test('useQuoteTokens gates quoteBuildReady on settled request key', () => {
    const src = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useQuoteTokens.ts'
      ),
      'utf8'
    )
    expect(src).toContain('quotesSettled')
    expect(src).toContain('settledRequestKey')
    expect(src).toContain('buildQuotesSync')
    expect(src).toContain('HELPS_SYNC_MAX_LINKS')
    expect(src).toContain('partitionHelpsWork')
    expect(src).toContain('quoteReady')
    expect(src).toContain('readCachedQuoteTokensForSpan')
    expect(src).toContain('mergeAndWriteCachedQuoteTokens')
    expect(src).toContain('staleQuotesAreUnderlineReady')
    expect(src).toContain('hydrateFromCache')
  })

  test('CombinedHelps underlines prefer quoteTokens over align settle', () => {
    expect(combinedPipelineSrc).toContain('notesForUnderline')
    expect(combinedPipelineSrc).toContain('twlLinksWithQuotes')
    expect(combinedPipelineSrc).toContain('underlineGroupsFromHelpsNotes')
  })
})
