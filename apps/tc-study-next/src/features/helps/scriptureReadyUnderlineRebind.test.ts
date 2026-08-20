/**
 * Helps-first / scripture-later underline rebind.
 *
 * Notes present + empty USJ must not throw. When scripture tokens appear,
 * the broadcast key changes so CombinedHelps re-sends NOTES_TOKEN_GROUPS.
 */
import { describe, expect, test } from 'bun:test'
import { semanticIdFor } from '@bt-synergy/scripture-loader'
import { findAlignedTokens } from './findAlignedTokens'
import { resolveAlignedQuoteTokens } from './resolveAlignedQuoteTokens'
import {
  SCRIPTURE_EMPTY_REVISION,
  scriptureContentRevision,
  shouldRetryOriginalLanguageLoad,
  tokenGroupsBroadcastDedupeKey,
  underlineGroupsFromHelpsNotes,
} from './scriptureReadyUnderlineRebind'

const PAUL_QUOTE = {
  id: 1,
  text: 'Παῦλος',
  type: 'word' as const,
  occurrence: 1,
}

const TITUS_INTRO_NOTE = {
  id: 'tn-tit-1-1-paul',
  reference: '1:1',
  occurrence: '1',
  origWords: 'Παῦλος',
  quoteTokens: [PAUL_QUOTE],
}

describe('helps-first then scripture hydrates', () => {
  test('notes present + empty scripture does not throw and yields quoteToken groups', () => {
    expect(() => underlineGroupsFromHelpsNotes([TITUS_INTRO_NOTE], 'tit')).not.toThrow()
    const groups = underlineGroupsFromHelpsNotes([TITUS_INTRO_NOTE], 'tit')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.sourceId).toBe('tn-tit-1-1-paul')
    expect(groups[0]!.semanticIds[0]?.toLowerCase()).toContain(':παῦλος:1')

    const emptyRevision = scriptureContentRevision({ tokenCount: 0 })
    expect(emptyRevision).toBe(SCRIPTURE_EMPTY_REVISION)
    const keyWhileEmpty = tokenGroupsBroadcastDedupeKey('all', groups, emptyRevision)
    expect(keyWhileEmpty).toContain(SCRIPTURE_EMPTY_REVISION)
  })

  test('notes without quoteTokens + empty scripture: no throw, no groups', () => {
    const bare = { id: 'tn-bare', reference: '1:1', origWords: 'Παῦλος' }
    expect(() => underlineGroupsFromHelpsNotes([bare], 'tit')).not.toThrow()
    expect(underlineGroupsFromHelpsNotes([bare], 'tit')).toEqual([])
  })

  test('scripture content appearing changes the broadcast key (rebroadcast)', () => {
    const groups = underlineGroupsFromHelpsNotes([TITUS_INTRO_NOTE], 'tit')
    const before = tokenGroupsBroadcastDedupeKey(
      'all',
      groups,
      scriptureContentRevision({ tokenCount: 0 })
    )
    const after = tokenGroupsBroadcastDedupeKey(
      'all',
      groups,
      scriptureContentRevision({
        sourceResourceId: 'unfoldingWord/en/ult',
        book: 'tit',
        chapter: 1,
        tokenCount: 48,
      })
    )
    expect(before).not.toBe(after)
    expect(after).toContain('unfoldingWord/en/ult')
    expect(after).toContain(':48')
  })

  test('scripture tokens + quote semantic IDs underline ULT Paul via zaln', () => {
    const groups = underlineGroupsFromHelpsNotes([TITUS_INTRO_NOTE], 'tit')
    const ultTokens = [
      {
        id: 1,
        text: 'Paul',
        type: 'word' as const,
        occurrence: 1,
        semanticId: semanticIdFor('tit 1:1', 'Paul', 1),
        alignedOriginalWordIds: ['tit 1:1:Παῦλος:1'],
      },
      {
        id: 2,
        text: 'a',
        type: 'word' as const,
        occurrence: 1,
        semanticId: semanticIdFor('tit 1:1', 'a', 1),
        alignedOriginalWordIds: [],
      },
    ]
    const aligned = findAlignedTokens(ultTokens, groups[0]!.semanticIds, 'tit', 1, 1)
    expect(aligned.some((t) => t.content === 'Paul')).toBe(true)

    const viaResolve = resolveAlignedQuoteTokens({
      targetTokens: ultTokens,
      originalSemanticIds: groups[0]!.semanticIds,
      quoteText: 'Παῦλος',
      occurrence: 1,
      bookCode: 'tit',
      chapter: 1,
      verse: 1,
      quoteLanguage: 'en',
      textLanguage: 'en',
    })
    expect(viaResolve.alignedTokens.some((t) => t.content === 'Paul')).toBe(true)
  })

  test('UGNT load retries only when scripture hydrates and originals are still missing', () => {
    expect(
      shouldRetryOriginalLanguageLoad({
        hasOriginalContent: false,
        scriptureRevision: SCRIPTURE_EMPTY_REVISION,
        lastAttemptedRevision: null,
      })
    ).toBe(false)
    expect(
      shouldRetryOriginalLanguageLoad({
        hasOriginalContent: false,
        scriptureRevision: 'scripture:ult:tit:1:48',
        lastAttemptedRevision: SCRIPTURE_EMPTY_REVISION,
      })
    ).toBe(true)
    expect(
      shouldRetryOriginalLanguageLoad({
        hasOriginalContent: true,
        scriptureRevision: 'scripture:ult:tit:1:48',
        lastAttemptedRevision: SCRIPTURE_EMPTY_REVISION,
      })
    ).toBe(false)
    expect(
      shouldRetryOriginalLanguageLoad({
        hasOriginalContent: false,
        scriptureRevision: 'scripture:ult:tit:1:48',
        lastAttemptedRevision: 'scripture:ult:tit:1:48',
      })
    ).toBe(false)
  })
})
