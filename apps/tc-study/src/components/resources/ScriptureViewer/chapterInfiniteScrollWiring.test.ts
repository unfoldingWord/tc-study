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
    expect(viewerSrc).toContain('useChapterInfiniteScroll')
    expect(viewerSrc).toContain('useScriptureEdgeNavigate')
    expect(viewerSrc).toContain('revealChapterAtEdge')
    expect(viewerSrc).toContain('canRevealChapterAtEdge')
    expect(viewerSrc).toContain('displayChapters={chapterScroll.displayChapters}')
    expect(viewerSrc).toContain('chapterSlots={chapterScroll.chapterSlots}')
    expect(hookSrc).toContain('CHAPTER_EDGE_SWAP_MODE')
    expect(hookSrc).toContain('revealChapterInWindow')
    expect(hookSrc).toContain('revealChapterAtEdge')
    expect(hookSrc).toContain('ensurePreparedFullChapter')
    expect(hookSrc).toContain('markChapterScrollSettled(parked ?? navChapterRef.current)')
    expect(hookSrc).toContain('fromOurCommit')
    expect(hookSrc).toContain('settleKick')
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
