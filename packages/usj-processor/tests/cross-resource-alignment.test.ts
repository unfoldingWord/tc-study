/**
 * Cross-resource alignment parity: gateway ↔ original (Paul ↔ Παῦλος).
 * Proves underline / highlight target resolution inputs match across pipelines.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { USFMProcessor } from '@bt-synergy/usfm-processor'

import { attachAlignmentSemanticIds } from '../src/attachAlignmentSemanticIds'
import { semanticIdFor } from '../src/parity'
import { USJProcessor } from '../src/USJProcessor'

const FIXTURES = join(import.meta.dir, '..', 'fixtures')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
const UGNT_USFM = readFileSync(join(FIXTURES, 'el-x-koine_ugnt_TIT.usfm'), 'utf8')

function findWord(
  scripture: Awaited<ReturnType<USJProcessor['processUSFM']>>['scripture'],
  chapter: number,
  verse: number,
  surface: string
) {
  const ch = scripture.chapters.find((c) => c.number === chapter)
  const v = ch?.verses.find((vv) => vv.number === verse)
  return (v?.wordTokens || []).find((t) => t.type === 'word' && t.content === surface)
}

async function processUsj(usfm: string, bookId: string, language: string) {
  return (
    await new USJProcessor().processUSFM(usfm, bookId, 'Titus', {
      language,
      includeWordTokens: true,
      includeAlignments: true,
    })
  ).scripture
}

async function processLegacy(usfm: string, bookId: string, language: string) {
  const scripture = await new USFMProcessor().processUSFM(usfm, bookId, 'Titus', {
    language,
    includeWordTokens: true,
    includeAlignments: true,
  })
  attachAlignmentSemanticIds(
    scripture,
    scripture.chapters.flatMap((c) => c.verses)
  )
  return scripture
}

describe('Cross-resource alignment — Paul ↔ Παῦλος', () => {
  test('USJ ULT Paul alignedOriginalWordIds include Παῦλος semantic id', async () => {
    const ult = await processUsj(ULT_USFM, 'tit', 'en')
    const ugnt = await processUsj(UGNT_USFM, 'tit', 'el-x-koine')

    const paul = findWord(ult, 1, 1, 'Paul')
    const paulos = findWord(ugnt, 1, 1, 'Παῦλος')
    expect(paul).toBeTruthy()
    expect(paulos).toBeTruthy()

    const expectedOlId = semanticIdFor(
      paulos!.verseRef,
      paulos!.content,
      paulos!.occurrence
    ).toLowerCase()
    const aligned = (paul!.alignedOriginalWordIds || []).map((id) => id.toLowerCase())
    expect(aligned).toContain(expectedOlId)
  })

  test('USJ ULT God alignedOriginalWordIds include Θεοῦ occurrence 1', async () => {
    const ult = await processUsj(ULT_USFM, 'tit', 'en')
    const god = findWord(ult, 1, 1, 'God')
    expect(god).toBeTruthy()
    const aligned = (god!.alignedOriginalWordIds || []).map((id) => id.toLowerCase())
    expect(aligned.some((id) => id.includes(':θεοῦ:1'))).toBe(true)
  })

  test('legacy vs USJ: Paul ↔ Παῦλος alignment targets equal', async () => {
    const legacyUlt = await processLegacy(ULT_USFM, 'tit', 'en')
    const usjUlt = await processUsj(ULT_USFM, 'tit', 'en')

    const legacyPaul = findWord(legacyUlt, 1, 1, 'Paul')
    const usjPaul = findWord(usjUlt, 1, 1, 'Paul')
    expect(legacyPaul).toBeTruthy()
    expect(usjPaul).toBeTruthy()

    const left = (legacyPaul!.alignedOriginalWordIds || []).map((id) => id.toLowerCase()).sort()
    const right = (usjPaul!.alignedOriginalWordIds || []).map((id) => id.toLowerCase()).sort()
    expect(right).toEqual(left)
    expect(left.some((id) => id.includes('παῦλος'))).toBe(true)
  })
})
