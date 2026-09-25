import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('chapter edge-reveal + warm wiring', () => {
  test('ScriptureViewer reveals stacked chapters via elastic edge nav', () => {
    const viewerSrc = readFileSync(join(import.meta.dir, 'index.tsx'), 'utf8')
    const hookSrc = readFileSync(
      join(import.meta.dir, 'hooks/useChapterInfiniteScroll.ts'),
      'utf8'
    )
    const edgeSrc = readFileSync(
      join(import.meta.dir, 'hooks/useScriptureEdgeNavigate.ts'),
      'utf8'
    )
    expect(viewerSrc).toContain('useChapterInfiniteScroll')
    expect(viewerSrc).toContain('resolveLastChapter')
    expect(viewerSrc).toContain('useScriptureEdgeNavigate')
    expect(viewerSrc).toContain('revealChapterAtEdge')
    expect(viewerSrc).toContain('canRevealChapterAtEdge')
    expect(viewerSrc).toContain('ScriptureEdgeCue')
    expect(viewerSrc).toContain('showTopCue')
    expect(viewerSrc).toContain('showBottomCue')
    expect(viewerSrc).toContain('onClick={clickPrev}')
    expect(viewerSrc).toContain('onClick={clickNext}')
    // Owned scrollport; cues sit at content start/end inside the elastic wrapper.
    expect(viewerSrc).toContain('flex-1 min-h-0 bg-scripture')
    expect(viewerSrc).not.toContain('flex-1 min-h-0 relative')
    expect(viewerSrc).toContain('h-full overflow-auto')
    expect(viewerSrc).toMatch(
      /will-change-transform[\s\S]*ScriptureEdgeCue[\s\S]*edge="top"[\s\S]*ScriptureContent[\s\S]*ScriptureEdgeCue[\s\S]*edge="bottom"/
    )
    expect(viewerSrc).toContain('warmChapterAtEdge')
    expect(hookSrc).toContain('warmChapterAtEdge')
    expect(viewerSrc).toContain('displayChapters={chapterScroll.displayChapters}')
    expect(viewerSrc).toContain('chapterSlots={chapterScroll.chapterSlots}')
    expect(hookSrc).toContain('CHAPTER_EDGE_SWAP_MODE')
    expect(hookSrc).toContain('revealChapterInWindow')
    expect(hookSrc).toContain('revealChapterAtEdge')
    expect(hookSrc).toContain('ensurePreparedFullChapter')
    expect(hookSrc).toContain('warmChapterAtEdge')
    expect(hookSrc).toContain('shouldCommitSettledChapter')
    expect(hookSrc).toContain('blockSnapBackToRef')
    expect(hookSrc).toContain('userMovedSinceReveal')
    expect(hookSrc).toContain('markChapterScrollSettled')
    expect(hookSrc).toContain('fromOurCommit')
    expect(hookSrc).toContain('settleKick')
    expect(hookSrc).toContain('pendingRevealPeekRef')
    expect(hookSrc).toContain('peekScrollTopAfterEdgeReveal')
    expect(hookSrc).toContain('pendingRevealPeekRef.current = direction')
    expect(hookSrc).toContain('commitChapter(target)')
    expect(hookSrc).toContain('shouldReleaseEdgeRevealSnapBack')
    expect(hookSrc).toContain('shouldBlockEdgeRevealRetrigger')
    expect(hookSrc).toContain('inFlightTargetsAfterPeek')
    expect(hookSrc).toContain('revealInFlightRef')
    expect(hookSrc).toContain('beginProgrammaticScrollSuppress(500)')
    expect(hookSrc).not.toContain('holdSettledToRef')
    expect(hookSrc).not.toContain('holdToChapter')
    expect(hookSrc).toContain('userMovedSinceReveal')
    expect(hookSrc).toContain('isProgrammaticScrollSuppressed')
    expect(hookSrc).toContain('Do not mark unsettled')
    expect(hookSrc).toContain('incomingTop')
    expect(hookSrc).toContain('preserveAlignRef.current')
    expect(hookSrc).not.toContain('pendingRevealTopAlignRef')
    expect(hookSrc).not.toContain('scrollTopForElementAtTop')
    expect(hookSrc).not.toContain('CHAPTER_REVEAL_TOP_OFFSET_PX')
    expect(edgeSrc).toContain('nextEdgeCueVisibility')
    expect(edgeSrc).toContain('showTopCue')
    expect(edgeSrc).toContain('showBottomCue')
    expect(edgeSrc).toContain('resolveScriptureScrollParent')
    expect(edgeSrc).toContain('latchedEdgeRef')
    expect(edgeSrc).toContain('peakRawRef')
    expect(edgeSrc).toContain('commitIfCrossed')
    expect(edgeSrc).toContain('peakOverscrollPx')
    expect(edgeSrc).toContain('isProgrammaticScrollSuppressed')
    expect(edgeSrc).not.toContain('EDGE_TRAVEL_PAD_PX')
    const cueSrc = readFileSync(
      join(import.meta.dir, 'components/ScriptureEdgeCue.tsx'),
      'utf8'
    )
    expect(cueSrc).toContain('data-scripture-edge-cue')
    expect(cueSrc).not.toContain('absolute')
    expect(cueSrc).not.toContain('data-scripture-edge-pad')
    expect(cueSrc).not.toContain('EDGE_TRAVEL_PAD_PX')
    const edgeNavSrc = readFileSync(
      join(import.meta.dir, '../../../features/nav/scriptureEdgeNavigate.ts'),
      'utf8'
    )
    // Content-edge cues when adjacent unit exists — no empty scroll runway / sticky host.
    expect(edgeNavSrc).toContain('nextEdgeCueVisibility')
    expect(edgeNavSrc).toContain('canPrev')
    expect(edgeNavSrc).toContain('canNext')
    expect(edgeNavSrc).not.toContain('EDGE_TRAVEL_PAD_PX')
    expect(edgeNavSrc).not.toContain('edgeTravelFromPads')
    expect(edgeNavSrc).not.toContain('EDGE_CUE_HIDE_SLOP_PX')
    // Cue visibility no longer gates on park-at-edge scroll position.
    expect(edgeNavSrc).toMatch(/showBottom:\s*Boolean\(args\.canNext\)/)
  })

  test('ScriptureViewer broadcasts the live BCV span (not hardcoded whole-chapter)', () => {
    const viewerSrc = readFileSync(join(import.meta.dir, 'index.tsx'), 'utf8')
    expect(viewerSrc).toContain('currentVerse: currentRef.verse || 1')
    expect(viewerSrc).toContain('endChapter: currentRef.endChapter || currentRef.chapter || 1')
    expect(viewerSrc).toContain('endVerse: currentRef.endVerse ?? 999')
  })

  test('content warms painted stack edges and uses prepared panes', () => {
    const contentSrc = readFileSync(
      join(import.meta.dir, 'components/ScriptureContent.tsx'),
      'utf8'
    )
    expect(contentSrc).toContain('contentChaptersFromSlots')
    expect(contentSrc).toContain('usePreparedChapterWindow')
    expect(contentSrc).toContain('PreparedFullChapterPane')
    expect(contentSrc).toContain('PreparedLightChapterPane')
    // Token highlight scroll must not center — that pulls the previous chapter
    // into the settle band when the token is near the start of a chapter.
    expect(contentSrc).toContain("block: 'start'")
    expect(contentSrc).toContain('beginProgrammaticScrollSuppress')
    expect(contentSrc).toContain('shouldScrollToQuoteHighlight')
    expect(contentSrc).not.toContain("block: 'center'")
    const tokenSrc = readFileSync(
      join(import.meta.dir, 'components/TokenRenderer.tsx'),
      'utf8'
    )
    const preparedSrc = readFileSync(
      join(import.meta.dir, 'components/PreparedFullChapterPane.tsx'),
      'utf8'
    )
    expect(tokenSrc).toContain('scroll-mt-12')
    expect(preparedSrc).toContain('scroll-mt-12')
  })

  test('layout toggle: verse-block slots use VerseBlockChapterPane, not PreparedFull', () => {
    const contentSrc = readFileSync(
      join(import.meta.dir, 'components/ScriptureContent.tsx'),
      'utf8'
    )
    const toggleSrc = readFileSync(
      join(import.meta.dir, 'components/ScriptureLayoutToggle.tsx'),
      'utf8'
    )
    const formattedSrc = readFileSync(
      join(import.meta.dir, 'components/FormattedScriptureContent.tsx'),
      'utf8'
    )
    expect(toggleSrc).toContain('toggleLayoutMode')
    expect(toggleSrc).toContain('data-scripture-layout-toggle')
    expect(contentSrc).toContain("layoutMode === 'formatted'")
    expect(contentSrc).toContain('FormattedScriptureContent')
    expect(contentSrc).toContain('VerseBlockChapterPane')
    expect(contentSrc).toContain('useStackedChapterViewModel')
    expect(contentSrc).toContain('slotPaintViewModel')
    // Infinite-scroll verse-block path must not prefer PreparedFull (paragraph
    // BlockView) — that made the toggle a visual no-op.
    const viewModelSlotsBranch = contentSrc.slice(
      contentSrc.indexOf("layoutMode === 'formatted' && slotPaintViewModel"),
      contentSrc.indexOf('chapters.map((chapterNum) =>')
    )
    expect(viewModelSlotsBranch).toContain('VerseBlockChapterPane')
    expect(viewModelSlotsBranch).not.toContain('PreparedFullChapterPane')
    expect(formattedSrc).toContain('layout="formatted"')
    // Empty stack chapters keep light fallback until SoT merge lands.
    expect(viewModelSlotsBranch).toContain('lightPaneForChapter')
    expect(formattedSrc).toContain('prepared-light-pending')
  })

  test('edge-reveal mode stacks up to three chapters', () => {
    const navSrc = readFileSync(
      join(import.meta.dir, '../../../features/nav/chapterInfiniteScroll.ts'),
      'utf8'
    )
    expect(navSrc).toContain('CHAPTER_EDGE_SWAP_MODE = true')
    expect(navSrc).toContain('revealChapterInWindow')
    expect(navSrc).toContain('MAX_MOUNTED_CHAPTERS = 3')
    expect(navSrc).toContain('CHAPTER_REVEAL_PEEK_PX')
    expect(navSrc).toContain('peekScrollTopAfterEdgeReveal')
    expect(navSrc).toContain('shouldBlockEdgeRevealRetrigger')
    expect(navSrc).toContain('inFlightTargetsAfterPeek')
    expect(navSrc).toContain('shouldReleaseEdgeRevealSnapBack')
    expect(navSrc).not.toContain('CHAPTER_REVEAL_TOP_OFFSET_PX')
    expect(navSrc).not.toContain('scrollTopForElementAtTop')
  })
})
