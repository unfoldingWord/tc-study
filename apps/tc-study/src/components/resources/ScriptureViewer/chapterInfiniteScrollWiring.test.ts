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
    expect(viewerSrc).toContain('useScriptureEdgeNavigate')
    expect(viewerSrc).toContain('revealChapterAtEdge')
    expect(viewerSrc).toContain('canRevealChapterAtEdge')
    expect(viewerSrc).toContain('ScriptureEdgeCue')
    expect(viewerSrc).toContain('showTopPad')
    expect(viewerSrc).toContain('showBottomPad')
    expect(viewerSrc).toContain('onClick={clickPrev}')
    expect(viewerSrc).toContain('onClick={clickNext}')
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
    expect(hookSrc).toContain('markChapterScrollSettled(commitSettled ? parked! : navChapterRef.current)')
    expect(hookSrc).toContain('fromOurCommit')
    expect(hookSrc).toContain('settleKick')
    expect(hookSrc).toContain('pendingRevealTopAlignRef')
    expect(hookSrc).toContain('scrollTopForElementAtTop')
    expect(hookSrc).toContain('CHAPTER_REVEAL_TOP_OFFSET_PX')
    expect(hookSrc).toContain('pendingRevealTopAlignRef.current = target')
    expect(edgeSrc).toContain('beginProgrammaticScrollSuppress')
    expect(edgeSrc).toContain('EDGE_PAD_PEEK_PX')
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

  test('edge-reveal mode stacks up to three chapters', () => {
    const navSrc = readFileSync(
      join(import.meta.dir, '../../../features/nav/chapterInfiniteScroll.ts'),
      'utf8'
    )
    expect(navSrc).toContain('CHAPTER_EDGE_SWAP_MODE = true')
    expect(navSrc).toContain('revealChapterInWindow')
    expect(navSrc).toContain('MAX_MOUNTED_CHAPTERS = 3')
  })
})
