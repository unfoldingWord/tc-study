import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QuoteMatcher } from '../../utils/quote-matcher'
import {
  processUsfmToOptimizedScripture,
  viewModelToOptimizedScripture,
} from './optimized-scripture'
import { viewModelToOptimizedChapters } from './usj-projection'
import { USJProcessor } from '@bt-synergy/usj-processor'

const FIXTURES = join(import.meta.dir, '..', '..', '..', '..', 'usj-processor', 'fixtures')
const UGNT_USFM = readFileSync(join(FIXTURES, 'el-x-koine_ugnt_TIT.usfm'), 'utf8')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')

describe('OptimizedScripture from USJ', () => {
  test('processUsfmToOptimizedScripture preserves Παῦλος occurrence for QuoteMatcher', async () => {
    const optimized = await processUsfmToOptimizedScripture(
      UGNT_USFM,
      'tit',
      'Titus',
      'el-x-koine'
    )
    const v1 = optimized.chapters
      .find((c) => c.number === 1)
      ?.verses.find((v) => v.number === 1)
    const paul = v1?.tokens.find((t) => t.text === 'Παῦλος')
    expect(paul?.occurrence).toBe(1)
    expect(paul?.type).toBe('word')
    expect(optimized.meta.type).toBe('original')
  })

  test('USJProcessor.processUSFM returns ProcessedScripture projection', async () => {
    const { scripture } = await new USJProcessor().processUSFM(ULT_USFM, 'tit', 'Titus', {
      language: 'en',
      includeWordTokens: true,
      includeAlignments: true,
    })
    expect(scripture.bookCode.toLowerCase()).toBe('tit')
    expect(scripture.chapters.length).toBeGreaterThan(0)
    expect(scripture.metadata.hasWordTokens).toBe(true)
  })

  test('viewModelToOptimizedChapters matches processUsfmToOptimizedScripture chapters', async () => {
    const { viewModel } = await new USJProcessor().processUSFM(UGNT_USFM, 'tit', 'Titus', {
      language: 'el-x-koine',
      includeWordTokens: true,
    })
    const fromVm = viewModelToOptimizedChapters(viewModel)
    const fromEnvelope = viewModelToOptimizedScripture(
      viewModel,
      'tit',
      'Titus',
      'el-x-koine'
    )
    const optimized = await processUsfmToOptimizedScripture(
      UGNT_USFM,
      'tit',
      'Titus',
      'el-x-koine'
    )
    expect(optimized.chapters).toEqual(fromVm)
    expect(fromEnvelope.chapters).toEqual(fromVm)
  })

  test('QuoteMatcher finds quote on USJ-optimized chapters', async () => {
    const optimized = await processUsfmToOptimizedScripture(
      UGNT_USFM,
      'tit',
      'Titus',
      'el-x-koine'
    )
    const matcher = new QuoteMatcher()
    const match = matcher.findOriginalTokens(optimized.chapters, 'Παῦλος', 1, {
      book: 'tit',
      startChapter: 1,
      startVerse: 1,
    })
    expect(match.success).toBe(true)
    expect(match.totalTokens.some((t) => t.text === 'Παῦλος')).toBe(true)
  })
})
