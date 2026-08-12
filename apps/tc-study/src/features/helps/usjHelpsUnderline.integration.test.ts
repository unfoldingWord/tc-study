/**
 * End-to-end Helps path on USJ-processed Titus fixtures:
 * QuoteMatcher → semantic IDs → SCRIPTURE_TOKENS broadcast → aligned underlines.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TranslationWordsLink } from '@bt-synergy/resource-parsers'
import {
  processUsfmToUsjResult,
  semanticIdFor,
  semanticIdKey,
} from '@bt-synergy/scripture-loader'
import { convertProcessedScriptureToOptimizedChapters } from '../../components/resources/WordsLinksViewer/utils/convertProcessedToOptimized'
import { buildQuoteTokens } from './quoteTokens/buildQuoteTokens'
import { generateSemanticIdsForQuoteTokens } from './quoteTokens/generateSemanticIds'
import { findAlignedTokens } from './findAlignedTokens'
import { extractOptimizedTokens } from './scriptureTokensBroadcast'

const FIXTURES = join(import.meta.dir, '../../../../../packages/usj-processor/fixtures')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
const UGNT_USFM = readFileSync(join(FIXTURES, 'el-x-koine_ugnt_TIT.usfm'), 'utf8')

async function processUsj(usfm: string, bookId: string, language: string) {
  const result = await processUsfmToUsjResult({
    usfmText: usfm,
    bookId,
    bookName: 'Titus',
    options: {
      language,
      includeWordTokens: true,
      includeAlignments: true,
    },
  })
  return result.scripture
}

describe('USJ CombinedHelps underline / alignment path (Titus)', () => {
  test('quote match Παῦλος → semantic ID underlines ULT Paul via alignedOriginalWordIds', async () => {
    const ugnt = await processUsj(UGNT_USFM, 'tit', 'el-x-koine')
    const ult = await processUsj(ULT_USFM, 'tit', 'en')

    const originalChapters = convertProcessedScriptureToOptimizedChapters(ugnt).filter(
      (ch) => ch.number === 1
    )
    expect(originalChapters[0]?.verses[0]?.tokens?.some((t) => t.text === 'Παῦλος')).toBe(true)

    const link: TranslationWordsLink = {
      reference: '1:1',
      id: 'paul-twl',
      tags: 'names',
      origWords: 'Παῦλος',
      occurrence: '1',
      articlePath: 'bible/names/paul',
    }

    const quoteTokens = buildQuoteTokens({
      link,
      originalChapters,
      bookCode: 'tit',
    })
    expect(quoteTokens).toHaveLength(1)
    expect(quoteTokens[0]?.text).toBe('Παῦλος')
    expect(quoteTokens[0]?.occurrence).toBe(1)

    const semanticIds = generateSemanticIdsForQuoteTokens(quoteTokens, 'tit', 1, 1, 1)
    expect(semanticIds).toEqual([semanticIdFor('tit 1:1', 'Παῦλος', 1)])

    const broadcast = extractOptimizedTokens(ult, 1, 1, 1, 999)
    const paul = broadcast.find((t) => t.type === 'word' && t.text === 'Paul')
    expect(paul).toBeTruthy()
    expect(paul!.alignedOriginalWordIds.map(semanticIdKey)).toContain(semanticIdKey(semanticIds[0]))

    const aligned = findAlignedTokens(broadcast, semanticIds, 'tit', 1, 1)
    expect(aligned.some((t) => t.content === 'Paul')).toBe(true)

    // Underline set as CombinedHelps broadcasts (NOTES_TOKEN_GROUPS_* flatten toLowerCase)
    const underlineSet = new Set(semanticIds.map(semanticIdKey))
    const wouldUnderline = (paul!.alignedOriginalWordIds || []).some((id) =>
      underlineSet.has(semanticIdKey(id))
    )
    expect(wouldUnderline).toBe(true)
  })

  test('TN-style Θεοῦ occurrence 1 → God underline group', async () => {
    const ugnt = await processUsj(UGNT_USFM, 'tit', 'el-x-koine')
    const ult = await processUsj(ULT_USFM, 'tit', 'en')

    const originalChapters = convertProcessedScriptureToOptimizedChapters(ugnt).filter(
      (ch) => ch.number === 1
    )
    const link: TranslationWordsLink = {
      reference: '1:1',
      id: 'god-tn',
      tags: 'kt',
      origWords: 'Θεοῦ',
      occurrence: '1',
      articlePath: '',
    }

    const quoteTokens = buildQuoteTokens({ link, originalChapters, bookCode: 'TIT' })
    const semanticIds = generateSemanticIdsForQuoteTokens(quoteTokens, 'TIT', 1, 1, 1)
    expect(semanticIds[0]?.toLowerCase()).toContain(':θεοῦ:1')

    const broadcast = extractOptimizedTokens(ult, 1, 1, 1, 20)
    const god = broadcast.find((t) => t.type === 'word' && t.text === 'God')
    expect(god).toBeTruthy()
    for (const id of semanticIds) {
      expect((god!.alignedOriginalWordIds || []).map(semanticIdKey)).toContain(semanticIdKey(id))
    }
  })
})
