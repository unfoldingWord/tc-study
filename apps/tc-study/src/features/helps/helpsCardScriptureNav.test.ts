import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getHelpsHighlightEpoch,
  getPersistedHelpsHighlight,
  highlightForVisibleChapter,
  helpsRowScriptureRef,
  isHelpsHighlightApplied,
  markHelpsHighlightApplied,
  matchKeysBelongToChapter,
  parseTokenVerseRef,
  pendingHelpsHighlightFor,
  persistHelpsHighlight,
  planHelpsCardScriptureAction,
  replayHelpsHighlight,
  replayHelpsHighlightAcrossReadyCycles,
  resolveVisibleHelpsHighlight,
  scriptureChapterTokensReady,
  shouldApplyHelpsHighlightOnTokensReady,
  shouldClearHelpsHighlightOnTokenNull,
  shouldClearHelpsHighlightOnVerseFilter,
  shouldKeepSelectedHelpsCardOnPassageChange,
  shouldNavigateScriptureToRef,
  shouldNavigateToHelpsHighlight,
  shouldRetainHelpsHighlight,
  shouldScrollToQuoteHighlight,
  subscribeHelpsHighlightPersist,
  usjDisplayTokensReady,
} from './helpsCardScriptureNav'

describe('parseTokenVerseRef', () => {
  test('parses CombinedHelps token-click verseRef', () => {
    expect(parseTokenVerseRef('tit 1:7')).toEqual({ book: 'tit', chapter: 1, verse: 7 })
    expect(parseTokenVerseRef('TIT 1:7')).toEqual({ book: 'tit', chapter: 1, verse: 7 })
  })

  test('rejects empty or malformed refs', () => {
    expect(parseTokenVerseRef('')).toBeNull()
    expect(parseTokenVerseRef('1:7')).toBeNull()
  })
})

describe('helpsRowScriptureRef', () => {
  test('maps a TN/TWL card reference onto the current book', () => {
    expect(helpsRowScriptureRef('tit', '1:7')).toEqual({ book: 'tit', chapter: 1, verse: 7 })
    expect(helpsRowScriptureRef('TIT', '2:1-3')).toEqual({ book: 'tit', chapter: 2, verse: 1 })
  })
})

describe('shouldNavigateScriptureToRef', () => {
  test('off-chapter card navigates; same-chapter quote does not', () => {
    const viewingCh2 = { book: 'tit', chapter: 2 }
    expect(shouldNavigateScriptureToRef(viewingCh2, { book: 'tit', chapter: 1 })).toBe(true)
    expect(shouldNavigateScriptureToRef(viewingCh2, { book: 'tit', chapter: 2 })).toBe(false)
  })

  test('book change navigates even when chapter numbers match', () => {
    expect(
      shouldNavigateScriptureToRef({ book: 'tit', chapter: 1 }, { book: '1ti', chapter: 1 })
    ).toBe(true)
  })
})

describe('shouldNavigateToHelpsHighlight', () => {
  test('user scroll / already-applied persist does not snap BCV back', () => {
    const viewingCh3 = { book: 'psa', chapter: 3 }
    const highlightCh2 = { book: 'psa', chapter: 2 }
    expect(
      shouldNavigateToHelpsHighlight({
        current: viewingCh3,
        target: highlightCh2,
      })
    ).toBe(true)
    expect(
      shouldNavigateToHelpsHighlight({
        current: viewingCh3,
        target: highlightCh2,
        userScrolling: true,
      })
    ).toBe(false)
    expect(
      shouldNavigateToHelpsHighlight({
        current: viewingCh3,
        target: highlightCh2,
        highlightAlreadyApplied: true,
      })
    ).toBe(false)
  })

  test('fresh off-chapter click still navigates once', () => {
    expect(
      shouldNavigateToHelpsHighlight({
        current: { book: 'tit', chapter: 1 },
        target: { book: 'tit', chapter: 2 },
        userScrolling: false,
        highlightAlreadyApplied: false,
      })
    ).toBe(true)
  })
})

describe('shouldScrollToQuoteHighlight', () => {
  const base = {
    selectedTokenId: 'psa 119:1:blessed:1',
    lastScrolledTokenId: null as string | null,
    lastScrolledEpoch: -1,
    highlightEpoch: 4,
    userScrolling: false,
    highlightChapter: 119,
    visibleChapter: 119,
    highlightApplied: false,
  }

  test('scrolls once for a new click on the highlight chapter', () => {
    expect(shouldScrollToQuoteHighlight(base)).toBe(true)
  })

  test('does not re-scroll the same persist after a successful scroll', () => {
    expect(
      shouldScrollToQuoteHighlight({
        ...base,
        lastScrolledTokenId: base.selectedTokenId,
        lastScrolledEpoch: 4,
      })
    ).toBe(false)
  })

  test('does not snap back when the user scrolls to another chapter', () => {
    expect(
      shouldScrollToQuoteHighlight({
        ...base,
        visibleChapter: 120,
        userScrolling: true,
      })
    ).toBe(false)
    expect(
      shouldScrollToQuoteHighlight({
        ...base,
        lastScrolledTokenId: null,
        highlightApplied: false,
        visibleChapter: 120,
        userScrolling: false,
      })
    ).toBe(false)
  })

  test('does not re-scroll when adjacent-chapter tokensReady churns after apply', () => {
    expect(
      shouldScrollToQuoteHighlight({
        ...base,
        lastScrolledTokenId: base.selectedTokenId,
        lastScrolledEpoch: 7,
        highlightEpoch: 8,
        highlightApplied: true,
        visibleChapter: 119,
      })
    ).toBe(false)
  })

  test('off-chapter land still scrolls once dest chapter is visible', () => {
    expect(
      shouldScrollToQuoteHighlight({
        ...base,
        highlightChapter: 5,
        visibleChapter: 2,
        lastScrolledTokenId: null,
      })
    ).toBe(false)
    expect(
      shouldScrollToQuoteHighlight({
        ...base,
        highlightChapter: 5,
        visibleChapter: 5,
        lastScrolledTokenId: null,
        highlightApplied: false,
      })
    ).toBe(true)
  })
})

describe('planHelpsCardScriptureAction', () => {
  test('off-chapter TN card emits nav + token-click for the note chapter', () => {
    const plan = planHelpsCardScriptureAction({
      bookCode: 'tit',
      reference: '2:11',
      current: { book: 'tit', chapter: 1 },
      item: {
        quote: 'for all men',
        alignedTokens: [{ semanticId: 'tit 2:11:men:1', type: 'word', content: 'men' }],
        semanticIds: ['tit 2:11:πάντας:1', 'tit 2:11:ἀνθρώπους:1'],
      },
    })
    expect(plan.navigate).toEqual({ book: 'tit', chapter: 2, verse: 11 })
    expect(plan.token?.verseRef).toBe('tit 2:11')
    expect(plan.token?.semanticId).toBe('tit 2:11:men:1')
    expect(plan.token?.alignedSemanticIds).toEqual([
      'tit 2:11:πάντας:1',
      'tit 2:11:ἀνθρώπους:1',
      'tit 2:11:men:1',
    ])
  })

  test('same-chapter quote does not navigate but still sends token-click', () => {
    const plan = planHelpsCardScriptureAction({
      bookCode: 'tit',
      reference: '1:7',
      current: { book: 'tit', chapter: 1 },
      item: {
        quoteTokens: [{ text: 'overseer', id: '1' }],
        semanticIds: ['tit 1:7:ἐπίσκοπον:1'],
      },
    })
    expect(plan.navigate).toBeNull()
    expect(plan.token?.verseRef).toBe('tit 1:7')
  })

  test('uses live scripture chapter, not a pinned stale chapter', () => {
    const viewingCh1 = { book: 'tit', chapter: 1 }
    const plan = planHelpsCardScriptureAction({
      bookCode: 'tit',
      reference: '2:1',
      current: viewingCh1,
      item: { quote: 'for all men', semanticIds: ['tit 2:1:men:1'] },
    })
    expect(plan.navigate?.chapter).toBe(2)
  })
})

describe('persistHelpsHighlight survives chapter change', () => {
  test('keeps the note chapter highlight until that chapter is visible', () => {
    persistHelpsHighlight(null)
    const plan = planHelpsCardScriptureAction({
      bookCode: 'tit',
      reference: '2:11',
      current: { book: 'tit', chapter: 3 },
      item: {
        quote: 'for all men',
        alignedTokens: [
          { semanticId: 'tit 2:11:for:2', type: 'word', content: 'for' },
          { semanticId: 'tit 2:11:all:1', type: 'word', content: 'all' },
          { semanticId: 'tit 2:11:men:1', type: 'word', content: 'men' },
        ],
        semanticIds: ['tit 2:11:πάντας:1', 'tit 2:11:ἀνθρώπους:1'],
      },
    })
    persistHelpsHighlight(plan.token)
    expect(plan.navigate).toEqual({ book: 'tit', chapter: 2, verse: 11 })
    expect(highlightForVisibleChapter(3)).toBeNull()
    const applied = highlightForVisibleChapter(2)
    expect(applied?.verseRef).toBe('tit 2:11')
    expect(applied?.alignedSemanticIds).toContain('tit 2:11:for:2')
    expect(applied?.alignedSemanticIds).toContain('tit 2:11:men:1')
    persistHelpsHighlight(null)
  })
})

describe('resolveVisibleHelpsHighlight survives token arrival', () => {
  test('keeps alignedSemanticIds across chapter change before tokens exist', () => {
    persistHelpsHighlight(null)
    persistHelpsHighlight({
      semanticId: 'tit 2:11:men:1',
      alignedSemanticIds: ['tit 2:11:πάντας:1', 'tit 2:11:ἀνθρώπους:1', 'tit 2:11:men:1'],
      content: 'men',
      verseRef: 'tit 2:11',
    })
    // Would fail if chapter change cleared state before tokens painted.
    const pending = resolveVisibleHelpsHighlight({ visibleChapter: 2, tokensReady: false })
    expect(pending?.verseRef).toBe('tit 2:11')
    expect(pending?.alignedSemanticIds).toContain('tit 2:11:men:1')
    expect(pending?.alignedSemanticIds).toContain('tit 2:11:πάντας:1')

    const painted = resolveVisibleHelpsHighlight({ visibleChapter: 2, tokensReady: true })
    expect(painted?.alignedSemanticIds).toEqual(pending?.alignedSemanticIds)
    // Unapplied persist must survive viewing the old chapter with tokens ready.
    expect(resolveVisibleHelpsHighlight({ visibleChapter: 1, tokensReady: true })?.verseRef).toBe(
      'tit 2:11'
    )
    expect(replayHelpsHighlight({ visibleBook: 'tit', visibleChapter: 1, tokensReady: true })).toBeNull()
    expect(getPersistedHelpsHighlight()?.verseRef).toBe('tit 2:11')
    persistHelpsHighlight(null)
  })

  test('persist survives delayed tokensReady flicker, remount, then applies', () => {
    persistHelpsHighlight(null)
    persistHelpsHighlight({
      semanticId: 'tit 2:11:men:1',
      alignedSemanticIds: ['tit 2:11:πάντας:1', 'tit 2:11:ἀνθρώπους:1', 'tit 2:11:men:1'],
      content: 'men',
      verseRef: 'tit 2:11',
    })
    // Remount while still on chapter 1 (event already gone).
    expect(
      resolveVisibleHelpsHighlight({ visibleBook: 'tit', visibleChapter: 1, tokensReady: false })
        ?.verseRef
    ).toBe('tit 2:11')
    // Intermediate nav lands on the target chapter before tokens exist.
    expect(pendingHelpsHighlightFor('tit', 2)?.verseRef).toBe('tit 2:11')
    expect(
      shouldClearHelpsHighlightOnVerseFilter({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 2,
        tokensReady: false,
      })
    ).toBe(false)
    expect(getPersistedHelpsHighlight()?.verseRef).toBe('tit 2:11')
    expect(isHelpsHighlightApplied()).toBe(false)
    expect(shouldClearHelpsHighlightOnTokenNull()).toBe(false)

    const afterFlicker = replayHelpsHighlightAcrossReadyCycles(
      { book: 'tit', chapter: 2 },
      [false, false, false, true]
    )
    expect(afterFlicker?.verseRef).toBe('tit 2:11')
    expect(afterFlicker?.alignedSemanticIds).toContain('tit 2:11:men:1')
    expect(getPersistedHelpsHighlight()?.verseRef).toBe('tit 2:11')
    expect(markHelpsHighlightApplied('tit', 2)).toBe(true)
    expect(isHelpsHighlightApplied()).toBe(true)
    persistHelpsHighlight(null)
  })

  test('intermediate chapter change to the target chapter does not clear persist', () => {
    persistHelpsHighlight(null)
    persistHelpsHighlight({
      semanticId: 'tit 2:11:men:1',
      alignedSemanticIds: ['tit 2:11:men:1'],
      content: 'men',
      verseRef: 'tit 2:11',
    })
    // Nav to 2:1 (target chapter) then expand to full chapter — persist stays.
    expect(replayHelpsHighlight({ visibleBook: 'tit', visibleChapter: 2, tokensReady: false }))
      .not.toBeNull()
    expect(
      shouldClearHelpsHighlightOnVerseFilter({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 2,
        tokensReady: true,
      })
    ).toBe(false)
    expect(getPersistedHelpsHighlight()?.chapter).toBe(2)
    persistHelpsHighlight(null)
  })

  test('leftover chapter-1 USJ verses are not tokensReady for chapter 3', () => {
    expect(
      usjDisplayTokensReady([{ chapterNumber: 1 }, { chapterNumber: 1 }], 3)
    ).toBe(false)
    expect(usjDisplayTokensReady([{ chapterNumber: 3 }], 3)).toBe(true)
    expect(
      scriptureChapterTokensReady({
        visibleChapter: 3,
        matchKeys: ['tit 1:8:sensible:1'],
        hasUsjTokens: usjDisplayTokensReady([{ chapterNumber: 1 }], 3),
      })
    ).toBe(false)
  })

  test('second persist replaces applied highlight and notifies scripture', () => {
    persistHelpsHighlight(null)
    persistHelpsHighlight({
      semanticId: 'tit 1:8:sensible:1',
      alignedSemanticIds: ['tit 1:8:sensible:1'],
      content: 'sensible',
      verseRef: 'tit 1:8',
    })
    markHelpsHighlightApplied('tit', 1)
    expect(isHelpsHighlightApplied()).toBe(true)
    const epoch = getHelpsHighlightEpoch()
    let notified = 0
    const stop = subscribeHelpsHighlightPersist(() => {
      notified += 1
    })
    persistHelpsHighlight({
      semanticId: 'tit 3:1:rulers:1',
      alignedSemanticIds: ['tit 3:1:rulers:1', 'tit 3:1:authorities:1'],
      content: 'rulers',
      verseRef: 'tit 3:1',
    })
    stop()
    expect(isHelpsHighlightApplied()).toBe(false)
    expect(getPersistedHelpsHighlight()?.verseRef).toBe('tit 3:1')
    expect(getPersistedHelpsHighlight()?.alignedSemanticIds).toContain('tit 3:1:authorities:1')
    expect(getHelpsHighlightEpoch()).toBeGreaterThan(epoch)
    expect(notified).toBe(1)
    expect(replayHelpsHighlight({ visibleBook: 'tit', visibleChapter: 3, tokensReady: true })?.semanticId).toBe(
      'tit 3:1:rulers:1'
    )
    persistHelpsHighlight(null)
  })

  test('scriptureChapterTokensReady waits for this chapter’s matchKeys', () => {
    expect(
      matchKeysBelongToChapter(['tit 1:1:Παῦλος:1'], 2)
    ).toBe(false)
    expect(
      matchKeysBelongToChapter(['tit 2:11:men:1', 'tit 2:11:πάντας:1'], 2)
    ).toBe(true)
    expect(
      scriptureChapterTokensReady({
        visibleChapter: 2,
        matchKeys: ['tit 1:1:Παῦλος:1'],
        hasUsjTokens: false,
      })
    ).toBe(false)
    expect(
      scriptureChapterTokensReady({
        visibleChapter: 2,
        matchKeys: ['tit 2:11:men:1'],
        hasUsjTokens: false,
      })
    ).toBe(true)
    expect(
      scriptureChapterTokensReady({
        visibleChapter: 2,
        matchKeys: [],
        hasUsjTokens: true,
      })
    ).toBe(true)
  })

  test('verse-filter does not clear a helps highlight waiting for tokens', () => {
    persistHelpsHighlight(null)
    persistHelpsHighlight({
      semanticId: 'tit 2:11:men:1',
      alignedSemanticIds: ['tit 2:11:men:1'],
      content: 'men',
      verseRef: 'tit 2:11',
    })
    expect(
      shouldClearHelpsHighlightOnVerseFilter({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 2,
        tokensReady: false,
      })
    ).toBe(false)
    expect(
      shouldClearHelpsHighlightOnVerseFilter({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 1,
        tokensReady: true,
      })
    ).toBe(false)
    // Still unapplied — even tokensReady on the target chapter must not wipe persist.
    expect(
      shouldClearHelpsHighlightOnVerseFilter({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 2,
        tokensReady: true,
      })
    ).toBe(false)
    markHelpsHighlightApplied('tit', 2)
    expect(
      shouldClearHelpsHighlightOnVerseFilter({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 2,
        tokensReady: true,
      })
    ).toBe(true)
    persistHelpsHighlight(null)
  })

  test('chapter change with already-loaded book notes does not clear selected card / persist', () => {
    persistHelpsHighlight(null)
    persistHelpsHighlight({
      semanticId: 'tit 2:11:men:1',
      alignedSemanticIds: ['tit 2:11:πάντας:1', 'tit 2:11:men:1'],
      content: 'men',
      verseRef: 'tit 2:11',
    })
    expect(
      shouldKeepSelectedHelpsCardOnPassageChange({
        supportRefActive: false,
        persist: getPersistedHelpsHighlight(),
        nextBook: 'tit',
        nextChapter: 2,
      })
    ).toBe(true)
    expect(
      shouldKeepSelectedHelpsCardOnPassageChange({
        supportRefActive: true,
        persist: null,
        nextBook: 'tit',
        nextChapter: 2,
      })
    ).toBe(true)
    expect(
      shouldKeepSelectedHelpsCardOnPassageChange({
        supportRefActive: false,
        persist: getPersistedHelpsHighlight(),
        nextBook: 'tit',
        nextChapter: 3,
      })
    ).toBe(false)
    expect(getPersistedHelpsHighlight()?.verseRef).toBe('tit 2:11')
    expect(shouldClearHelpsHighlightOnTokenNull()).toBe(false)
    persistHelpsHighlight(null)
  })

  test('persist applies on tokensReady even if helps quoteBuildReady is false', () => {
    persistHelpsHighlight(null)
    persistHelpsHighlight({
      semanticId: 'tit 2:11:men:1',
      alignedSemanticIds: ['tit 2:11:πάντας:1', 'tit 2:11:men:1'],
      content: 'men',
      verseRef: 'tit 2:11',
    })
    expect(
      shouldApplyHelpsHighlightOnTokensReady({
        tokensReady: true,
        quoteBuildReady: false,
      })
    ).toBe(true)
    expect(
      shouldApplyHelpsHighlightOnTokensReady({
        tokensReady: false,
        quoteBuildReady: true,
      })
    ).toBe(false)
    const painted = replayHelpsHighlight({
      visibleBook: 'tit',
      visibleChapter: 2,
      tokensReady: true,
    })
    expect(painted?.verseRef).toBe('tit 2:11')
    expect(painted?.alignedSemanticIds).toContain('tit 2:11:men:1')
    // Links reload / remount null after scripture applied must not wipe persist.
    markHelpsHighlightApplied('tit', 2)
    expect(shouldClearHelpsHighlightOnTokenNull()).toBe(false)
    expect(getPersistedHelpsHighlight()?.verseRef).toBe('tit 2:11')
    persistHelpsHighlight(null)
    expect(shouldClearHelpsHighlightOnTokenNull()).toBe(true)
  })
})

describe('shouldRetainHelpsHighlight', () => {
  test('keeps highlight until destination tokens exist', () => {
    persistHelpsHighlight(null)
    persistHelpsHighlight({
      semanticId: 'tit 2:11:men:1',
      alignedSemanticIds: ['tit 2:11:men:1'],
      content: 'men',
      verseRef: 'tit 2:11',
    })
    expect(
      shouldRetainHelpsHighlight({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 1,
        tokensReady: false,
      })
    ).toBe(true)
    expect(
      shouldRetainHelpsHighlight({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 2,
        tokensReady: false,
      })
    ).toBe(true)
    expect(
      shouldRetainHelpsHighlight({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 2,
        tokensReady: true,
      })
    ).toBe(true)
    expect(
      shouldRetainHelpsHighlight({
        highlightVerseRef: 'tit 2:11',
        visibleChapter: 1,
        tokensReady: true,
      })
    ).toBe(true)
    persistHelpsHighlight(null)
  })
})

describe('handler wiring uses the store, not pinned chapter', () => {
  test('CombinedHelps click persists and token-clicks before navigate', () => {
    const handlers = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/useCombinedHelpsHandlers.ts'),
      'utf8'
    )
    const card = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/TranslationNotesViewer/components/TranslationNoteCard.tsx'
      ),
      'utf8'
    )
    expect(handlers).toContain('planHelpsCardScriptureAction')
    expect(handlers).toContain('persistHelpsHighlight(token)')
    expect(handlers).toContain('applyHelpsQuoteToScripture')
    expect(handlers).toContain('useNavigationStore.getState().navigateToReference')
    expect(handlers).toContain('markReadNavigationInternal')
    expect(handlers).toContain('useNavigationStore.getState().currentReference')
    expect(handlers).not.toContain('currentChapter')
    expect(handlers).toMatch(
      /if \(token\) persistHelpsHighlight\(token\)\s*if \(token\) sendTokenClick\(\{ lifecycle: 'event', token \}\)\s*navigateToHelpsRow\(reference\)/
    )
    expect(handlers).toContain('applyHelpsQuoteToScripture(note.reference, note)')
    expect(card).toMatch(/onQuoteClick\?\.\(note\)\s*onClick\(note\)/)
  })

  test('ScriptureViewer reapplies persisted highlight when the note chapter lands', () => {
    const highlighting = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/ScriptureViewer/hooks/useHighlighting.ts'
      ),
      'utf8'
    )
    expect(highlighting).toContain('resolveVisibleHelpsHighlight')
    expect(highlighting).toContain('replayHelpsHighlight')
    expect(highlighting).toContain('persistHelpsHighlight')
    expect(highlighting).toContain('tokensReady')
    expect(highlighting).toContain('requestAnimationFrame')
    expect(highlighting).toContain('shouldClearHelpsHighlightOnTokenNull')
    expect(highlighting).toContain('shouldApplyHelpsHighlightOnTokensReady')
    expect(highlighting).toContain('setHighlightTarget(targetFromSignalToken(signal.token))')
    expect(highlighting).toContain('subscribeHelpsHighlightPersist')
    expect(highlighting).toContain('shouldNavigateToHelpsHighlight')
    expect(highlighting).toContain('getChapterScrollActivity')
    expect(highlighting).not.toMatch(/useEffect\(\(\) => \{\s*setHighlightTarget\(null\)/)
  })

  test('ScriptureContent scroll-to-quote is one-shot and ignores user chapter scroll', () => {
    const content = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/ScriptureViewer/components/ScriptureContent.tsx'
      ),
      'utf8'
    )
    expect(content).toContain('shouldScrollToQuoteHighlight')
    expect(content).toContain('lastScrolledEpochRef')
    expect(content).toContain('getChapterScrollActivity()')
    expect(content).not.toMatch(
      /lastScrolledTokenRef\.current = null\s*\}, \[currentRef\.book, currentRef\.chapter/
    )
  })

  test('CombinedHelps keeps selected card across chapter change when persist matches', () => {
    const viewer = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/index.tsx'),
      'utf8'
    )
    const signals = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/CombinedHelpsViewer/useCombinedHelpsSignals.ts'
      ),
      'utf8'
    )
    expect(viewer).toContain('shouldKeepSelectedHelpsCardOnPassageChange')
    expect(viewer).toContain('getPersistedHelpsHighlight()')
    expect(signals).toContain('shouldClearHelpsHighlightOnTokenNull')
  })
})
