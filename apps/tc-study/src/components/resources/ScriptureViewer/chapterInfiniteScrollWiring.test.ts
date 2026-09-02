import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('chapter infinite scroll wiring', () => {
  test('ScriptureViewer uses the chapter-mode scroller and commits via navigateToReference', () => {
    const viewerSrc = readFileSync(join(import.meta.dir, 'index.tsx'), 'utf8')
    const hookSrc = readFileSync(
      join(import.meta.dir, 'hooks/useChapterInfiniteScroll.ts'),
      'utf8'
    )
    expect(viewerSrc).toContain('useChapterInfiniteScroll')
    expect(viewerSrc).toContain('displayChapters={chapterScroll.displayChapters}')
    expect(viewerSrc).toContain('chapterSlots={chapterScroll.chapterSlots}')
    expect(viewerSrc).toContain('contentRef={chapterScroll.contentRef}')
    expect(hookSrc).toContain('isChapterInfiniteScrollEnabled')
    expect(hookSrc).toContain('markReadNavigationInternal')
    expect(hookSrc).toContain('navigateToReference')
    expect(hookSrc).toContain('resetChapterSlots')
    expect(hookSrc).toContain('shouldPromotePlaceholderOnSettle')
    expect(hookSrc).toContain('settledNavChapter')
    expect(hookSrc).toContain('markChapterScrollUnsettled')
    expect(hookSrc).toContain('markChapterScrollSettled')
    expect(hookSrc).toContain('clearChapterScrollActivity')
    expect(hookSrc).toContain('ensureChapterPainted')
    expect(hookSrc).toContain('approachingNeighborChapter')
    expect(hookSrc).toContain('settledCommitMode')
    expect(hookSrc).toContain('neighborChapterToPaint')
    expect(hookSrc).not.toContain('shouldStitchAtDocumentEdge')
    expect(hookSrc).not.toContain('stitchMountedChapters')
    expect(hookSrc).not.toContain('IntersectionObserver')
  })

  test('ScriptureViewer broadcasts the live BCV span (not hardcoded whole-chapter)', () => {
    const viewerSrc = readFileSync(join(import.meta.dir, 'index.tsx'), 'utf8')
    expect(viewerSrc).toContain('currentVerse: currentRef.verse || 1')
    expect(viewerSrc).toContain('endChapter: currentRef.endChapter || currentRef.chapter || 1')
    expect(viewerSrc).toContain('endVerse: currentRef.endVerse ?? 999')
    expect(viewerSrc).not.toContain('currentVerse: 1,')
    expect(viewerSrc).not.toContain('endChapter: currentRef.chapter,')
  })

  test('content renderers wrap chapters with sentinels', () => {
    const contentSrc = readFileSync(
      join(import.meta.dir, 'components/ScriptureContent.tsx'),
      'utf8'
    )
    const formattedSrc = readFileSync(
      join(import.meta.dir, 'components/FormattedScriptureContent.tsx'),
      'utf8'
    )
    const sectionSrc = readFileSync(
      join(import.meta.dir, 'components/ChapterScrollSection.tsx'),
      'utf8'
    )
    expect(contentSrc).toContain('ChapterScrollSection')
    expect(contentSrc).toContain('ChapterSlotChrome')
    expect(contentSrc).toContain('PreparedFullChapterPane')
    expect(contentSrc).toContain('PreparedLightChapterPane')
    expect(contentSrc).toContain('usePreparedBookLightPreload')
    expect(contentSrc).toContain('usePreparedChapterWindow')
    expect(contentSrc).toContain('displayVersesForChapters')
    expect(contentSrc).toContain('getChapterVerseBlockItems')
    expect(contentSrc).toContain('prefetchAdjacentChapterParagraphs')
    expect(contentSrc).toContain('prefetchChapterLayouts')
    expect(formattedSrc).toContain('ChapterScrollSection')
    expect(formattedSrc).toContain('ChapterSlotChrome')
    expect(formattedSrc).toContain('PreparedLightChapterPane')
    expect(formattedSrc).toContain('getChapterLayoutBlocks')
    expect(formattedSrc).toContain('getChapterParagraphs')
    expect(sectionSrc).toContain('data-chapter-edge="start"')
    expect(sectionSrc).toContain('data-chapter-edge="end"')
    expect(sectionSrc).toContain('data-chapter-kind')
    expect(sectionSrc).toContain('data-chapter-spacer-to')
  })

  test('placeholders fall back to skeleton; near slots prefer light when warm', () => {
    const placeholderSrc = readFileSync(
      join(import.meta.dir, 'components/ChapterScrollPlaceholder.tsx'),
      'utf8'
    )
    const contentSrc = readFileSync(
      join(import.meta.dir, 'components/ScriptureContent.tsx'),
      'utf8'
    )
    const formattedSrc = readFileSync(
      join(import.meta.dir, 'components/FormattedScriptureContent.tsx'),
      'utf8'
    )
    expect(placeholderSrc).toContain('MarkdownSkeleton')
    expect(placeholderSrc).not.toContain('VerseRenderer')
    expect(placeholderSrc).not.toContain('TokenRenderer')
    expect(placeholderSrc).not.toContain('Loading chapter')
    expect(contentSrc).toContain("slot.kind === 'placeholder'")
    expect(contentSrc).toContain('lightPaneForChapter')
    expect(formattedSrc).toContain("slot.kind === 'placeholder'")
    expect(formattedSrc).toContain('PreparedLightChapterPane')
    expect(contentSrc).toContain("slot.kind !== 'rendered'")
    expect(formattedSrc).toContain("slot.kind !== 'rendered'")
    const paragraphSrc = readFileSync(
      join(import.meta.dir, 'components/ChapterParagraphPane.tsx'),
      'utf8'
    )
    const spacerSrc = readFileSync(
      join(import.meta.dir, 'components/ChapterScrollSpacer.tsx'),
      'utf8'
    )
    expect(paragraphSrc).toContain('<p')
    expect(paragraphSrc).not.toContain('TokenRenderer')
    expect(paragraphSrc).not.toContain('VerseRenderer')
    expect(spacerSrc).toContain('spacerHeightPx')
    expect(spacerSrc).not.toContain('TokenRenderer')
  })

  test('scroller upgrades one settled chapter after the upgrade hold', () => {
    const viewerSrc = readFileSync(join(import.meta.dir, 'index.tsx'), 'utf8')
    const hookSrc = readFileSync(
      join(import.meta.dir, 'hooks/useChapterInfiniteScroll.ts'),
      'utf8'
    )
    expect(hookSrc).toContain('PHASE_UPGRADE_HOLD_MS')
    expect(hookSrc).toContain('upgradeSlot')
    expect(hookSrc).toContain('startTransition')
    expect(hookSrc).toContain('recenterSlots')
    expect(hookSrc).toContain('useChapterScrollActivity')
    expect(hookSrc).toContain('justEnabled')
    expect(hookSrc).toContain('canFallbackToUsjTokens')
    expect(hookSrc).not.toContain('promoteSlot')
    const navSrc = readFileSync(
      join(import.meta.dir, '../../../features/nav/chapterInfiniteScroll.ts'),
      'utf8'
    )
    expect(viewerSrc).toContain('useChapterInfiniteScroll(lastChapter, {')
    expect(viewerSrc).toContain('resourceKey')
    expect(viewerSrc).toContain('canFallbackToUsjTokens: Boolean(viewModel)')
    expect(hookSrc).toContain('hasPreparedFullChapter')
    expect(hookSrc).toContain('ensurePreparedFullChapter')
    expect(navSrc).toContain('FULL_TIER_HOLD_MS = 0')
    expect(navSrc).toContain('PHASE_UPGRADE_HOLD_MS = FULL_TIER_HOLD_MS')
  })
})
