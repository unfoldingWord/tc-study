import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  beginProgrammaticScrollSuppress,
  clearChapterScrollActivity,
  getChapterScrollActivity,
  markChapterScrollSettled,
  markChapterScrollUnsettled,
  pinReferenceWhileScrolling,
  resetChapterScrollActivity,
  shouldBroadcastScriptureTokens,
  shouldBroadcastUnderlineGroups,
  shouldEnqueueQuoteBuild,
  shouldHydrateHelpsForChapter,
  shouldPaintScriptureChromeExtras,
  subscribeChapterScrollActivity,
} from './chapterScrollActivity'

afterEach(() => {
  resetChapterScrollActivity()
})

describe('chapterScrollActivity gates', () => {
  test('while scrolling, no helps hydrate / no quote-build enqueue', () => {
    markChapterScrollSettled(2)
    markChapterScrollUnsettled()
    const next = getChapterScrollActivity()
    expect(next.unsettled).toBe(true)
    expect(next.settledChapter).toBe(2)
    expect(shouldEnqueueQuoteBuild(next.unsettled)).toBe(false)
    expect(shouldBroadcastScriptureTokens(next.unsettled)).toBe(false)
    expect(
      shouldHydrateHelpsForChapter({
        unsettled: next.unsettled,
        requestedChapter: 3,
        settledChapter: next.settledChapter,
      })
    ).toBe(false)
    expect(
      shouldHydrateHelpsForChapter({
        unsettled: next.unsettled,
        requestedChapter: 2,
        settledChapter: next.settledChapter,
      })
    ).toBe(false)
  })

  test('after settle, those run once for the settled chapter', () => {
    markChapterScrollUnsettled()
    markChapterScrollSettled(5)
    const next = getChapterScrollActivity()
    expect(next.unsettled).toBe(false)
    expect(next.settledChapter).toBe(5)
    expect(shouldEnqueueQuoteBuild(next.unsettled)).toBe(true)
    expect(shouldBroadcastScriptureTokens(next.unsettled)).toBe(true)
    expect(
      shouldHydrateHelpsForChapter({
        unsettled: next.unsettled,
        requestedChapter: 5,
        settledChapter: 5,
      })
    ).toBe(true)
    expect(
      shouldHydrateHelpsForChapter({
        unsettled: false,
        requestedChapter: 4,
        settledChapter: 5,
      })
    ).toBe(false)
  })

  test('idle chapter view hydrates when infinite-scroll never published a chapter', () => {
    expect(
      shouldHydrateHelpsForChapter({
        unsettled: false,
        requestedChapter: 1,
        settledChapter: null,
      })
    ).toBe(true)
    expect(shouldEnqueueQuoteBuild(false)).toBe(true)
  })

  test('repeated unsettled marks do not notify again', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeChapterScrollActivity(() => {
      seen.push(getChapterScrollActivity().unsettled)
    })
    markChapterScrollUnsettled()
    markChapterScrollUnsettled()
    markChapterScrollUnsettled()
    expect(seen).toEqual([true])
    unsubscribe()
  })

  test('incoming chapter skips scripture chrome until settle; hydrated stays rich', () => {
    expect(
      shouldPaintScriptureChromeExtras({ unsettled: true, chapterHydrated: false })
    ).toBe(false)
    expect(
      shouldPaintScriptureChromeExtras({ unsettled: true, chapterHydrated: true })
    ).toBe(true)
    expect(
      shouldPaintScriptureChromeExtras({ unsettled: false, chapterHydrated: false })
    ).toBe(true)
  })

  test('pin keeps helps on the settled chapter while nav has already advanced', () => {
    const live = { book: 'tit', chapter: 4, verse: 1, endChapter: 4, endVerse: 15 }
    expect(
      pinReferenceWhileScrolling(live, { unsettled: true, settledChapter: 2 })
    ).toEqual({ book: 'tit', chapter: 2, verse: 1, endChapter: 2, endVerse: 15 })
    expect(
      pinReferenceWhileScrolling(live, { unsettled: false, settledChapter: 4 })
    ).toBe(live)
  })

  test('clearing activity unpins settle so verse/section modes hydrate the full span', () => {
    markChapterScrollSettled(3)
    markChapterScrollUnsettled()
    clearChapterScrollActivity()
    const next = getChapterScrollActivity()
    expect(next.unsettled).toBe(false)
    expect(next.settledChapter).toBeNull()
    expect(
      shouldHydrateHelpsForChapter({
        unsettled: next.unsettled,
        requestedChapter: 1,
        settledChapter: next.settledChapter,
      })
    ).toBe(true)
    const live = { book: 'tit', chapter: 1, verse: 7, endChapter: 1, endVerse: 8 }
    expect(pinReferenceWhileScrolling(live, next)).toBe(live)
  })

  test('programmatic scroll suppress skips unsettle', () => {
    markChapterScrollSettled(2)
    beginProgrammaticScrollSuppress(200)
    markChapterScrollUnsettled()
    expect(getChapterScrollActivity().unsettled).toBe(false)
  })

  test('non-empty underline groups broadcast while unsettled; empty do not', () => {
    expect(shouldBroadcastUnderlineGroups({ unsettled: true, groupCount: 3 })).toBe(true)
    expect(shouldBroadcastUnderlineGroups({ unsettled: true, groupCount: 0 })).toBe(false)
    expect(shouldBroadcastUnderlineGroups({ unsettled: false, groupCount: 0 })).toBe(true)
  })
})

describe('chapter scroll activity wiring', () => {
  const root = join(import.meta.dir, '../..')

  test('scroller publishes unsettled / settled', () => {
    const hook = readFileSync(
      join(root, 'components/resources/ScriptureViewer/hooks/useChapterInfiniteScroll.ts'),
      'utf8'
    )
    expect(hook).toContain('markChapterScrollUnsettled')
    expect(hook).toContain('markChapterScrollSettled')
    expect(hook).toContain('clearChapterScrollActivity')
  })

  test('quote-build and OL hydrate wait for settle', () => {
    const quotes = readFileSync(
      join(root, 'components/resources/WordsLinksViewer/hooks/useQuoteTokens.ts'),
      'utf8'
    )
    const aligned = readFileSync(
      join(root, 'components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts'),
      'utf8'
    )
    const ol = readFileSync(
      join(root, 'components/resources/WordsLinksViewer/hooks/useOriginalLanguageContent.ts'),
      'utf8'
    )
    expect(quotes).toContain('shouldEnqueueQuoteBuild')
    expect(quotes).toContain('shouldKeepStaleHelpsRows')
    expect(quotes).toContain('staleQuotesAreUnderlineReady')
    expect(quotes).toContain('hydrateFromCache')
    expect(quotes).toContain('pinReferenceWhileScrolling')
    expect(aligned).toContain('shouldEnqueueQuoteBuild')
    expect(aligned).toContain('pinReferenceWhileScrolling')
    expect(aligned).toContain('batchAlignInWorker')
    expect(aligned).toContain('batchAlignLinks')
    expect(aligned).toContain('HELPS_SYNC_MAX_LINKS')
    expect(aligned).toContain('quoteReady')
    expect(aligned).toContain('lastAlignedRef.current.length > 0')
    expect(ol).toContain('shouldHydrateHelpsForChapter')
    expect(ol).toContain('pinReferenceWhileScrolling')
  })

  test('token broadcast and helps viewers pin to the settled chapter', () => {
    const broadcast = readFileSync(
      join(root, 'components/resources/ScriptureViewer/hooks/useTokenBroadcast.ts'),
      'utf8'
    )
    const combined = readFileSync(
      join(root, 'components/resources/CombinedHelpsViewer/index.tsx'),
      'utf8'
    )
    const tn = readFileSync(
      join(root, 'components/resources/TranslationNotesViewer/index.tsx'),
      'utf8'
    )
    const twl = readFileSync(
      join(root, 'components/resources/WordsLinksViewer/index.tsx'),
      'utf8'
    )
    const tq = readFileSync(
      join(root, 'components/resources/TranslationQuestionsViewer/index.tsx'),
      'utf8'
    )
    const twlContent = readFileSync(
      join(root, 'components/resources/WordsLinksViewer/hooks/useWordsLinksContent.ts'),
      'utf8'
    )
    expect(broadcast).toContain('shouldBroadcastScriptureTokens')
    expect(combined).toContain('usePinnedHelpsReference')
    expect(tn).toContain('usePinnedHelpsReference')
    expect(twl).toContain('usePinnedHelpsReference')
    expect(tq).toContain('usePinnedHelpsReference')
    expect(combined).toContain('features/nav/usePinnedHelpsReference')
    expect(twlContent).not.toContain('currentRef.chapter')
    const tokenGroups = readFileSync(
      join(root, 'components/resources/CombinedHelpsViewer/useCombinedHelpsTokenGroupsBroadcast.ts'),
      'utf8'
    )
    const listSrc = readFileSync(
      join(root, 'components/resources/CombinedHelpsViewer/CombinedHelpsList.tsx'),
      'utf8'
    )
    expect(tokenGroups).toContain('shouldBroadcastUnderlineGroups')
    expect(tokenGroups).toContain('shouldResetTokenGroupsDedupe')
    expect(tokenGroups).not.toContain('shouldEnqueueQuoteBuild')
    expect(listSrc).toContain('contentVisibility')
    expect(listSrc).toContain('windowMergedGroups')
    expect(listSrc).toContain('helps-list-window-sentinel')
  })
})
