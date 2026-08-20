import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldShowHelpsExcerptSkeleton } from './helpsExcerptSkeleton'

describe('shouldShowHelpsExcerptSkeleton', () => {
  test('TN Bible card skeletons the note body while the quote excerpt is pending', () => {
    expect(
      shouldShowHelpsExcerptSkeleton({ kind: 'tn', quoteStatus: 'pending' })
    ).toBe(true)
    expect(
      shouldShowHelpsExcerptSkeleton({ kind: 'tn', quoteStatus: 'aligned' })
    ).toBe(false)
    expect(
      shouldShowHelpsExcerptSkeleton({ kind: 'tn', quoteStatus: 'ol-fallback' })
    ).toBe(false)
    expect(shouldShowHelpsExcerptSkeleton({ kind: 'tn', quoteStatus: 'none' })).toBe(false)
  })

  test('OBS TN never uses the excerpt skeleton (literal quote is ready)', () => {
    expect(
      shouldShowHelpsExcerptSkeleton({
        kind: 'tn',
        obsMode: true,
        quoteStatus: 'pending',
      })
    ).toBe(false)
  })

  test('TWL skeletons the article excerpt until a preview cache entry exists', () => {
    expect(
      shouldShowHelpsExcerptSkeleton({
        kind: 'twl',
        twPreviewPending: true,
        twPreview: null,
      })
    ).toBe(true)
    expect(
      shouldShowHelpsExcerptSkeleton({
        kind: 'twl',
        twPreviewPending: false,
        twPreview: 'Abram était un Chaldéen',
      })
    ).toBe(false)
    expect(
      shouldShowHelpsExcerptSkeleton({
        kind: 'twl',
        twPreviewPending: false,
        twPreview: null,
      })
    ).toBe(false)
  })

  test('OBS TWL still skeletons a pending article excerpt (fetch is independent of quote)', () => {
    expect(
      shouldShowHelpsExcerptSkeleton({
        kind: 'twl',
        obsMode: true,
        twPreviewPending: true,
        twPreview: null,
      })
    ).toBe(true)
  })
})

describe('card wiring reuses MarkdownSkeleton', () => {
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
  const combinedListSrc = readFileSync(
    join(
      import.meta.dir,
      '../../components/resources/CombinedHelpsViewer/CombinedHelpsList.tsx'
    ),
    'utf8'
  )

  test('TranslationNoteCard hides finished note prose while excerpt is loading', () => {
    expect(tnCardSrc).toContain('shouldShowHelpsExcerptSkeleton')
    expect(tnCardSrc).toContain('MarkdownSkeleton')
    expect(tnCardSrc).toContain('excerptLoading')
    expect(tnCardSrc).toContain("kind: 'tn'")
    expect(tnCardSrc).toContain('Loading excerpt')
  })

  test('WordLinkCard reuses the same skeleton while the TW excerpt is pending', () => {
    expect(twlCardSrc).toContain('shouldShowHelpsExcerptSkeleton')
    expect(twlCardSrc).toContain('MarkdownSkeleton')
    expect(twlCardSrc).toContain('isLoadingPreview')
    expect(twlCardSrc).toContain("kind: 'twl'")
    expect(twlCardSrc).toContain('Loading excerpt')
  })

  test('CombinedHelps list threads TWL preview-pending into WordLinkCard', () => {
    expect(combinedListSrc).toContain('isTWPreviewPending')
    expect(combinedListSrc).toContain('isLoadingPreview={isLoadingPreview}')
  })

  test('pending-quote spinner stays a later, separate state on both cards', () => {
    expect(tnCardSrc).toContain("quoteStatus === 'pending'")
    expect(tnCardSrc).toContain('Building quote')
    expect(twlCardSrc).toContain("quoteStatus === 'pending'")
    expect(twlCardSrc).toContain('Building quote')
  })
})
