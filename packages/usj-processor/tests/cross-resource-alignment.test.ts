/**
 * Cross-resource alignment: gateway ↔ original (Paul ↔ Παῦλος).
 * Prefers UsjScriptureViewModel APIs; projection must match viewModel.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  flattenUsjTokens,
  semanticIdFor,
  USJProcessor,
  type UsjWordToken,
} from '../src/index'

const FIXTURES = join(import.meta.dir, '..', 'fixtures')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
const UGNT_USFM = readFileSync(join(FIXTURES, 'el-x-koine_ugnt_TIT.usfm'), 'utf8')

function findVmWord(
  tokens: UsjWordToken[],
  surface: string,
  verseRefSuffix = '1:1'
): UsjWordToken | undefined {
  return tokens.find(
    (t) => t.content === surface && t.verseRef.toLowerCase().endsWith(verseRefSuffix)
  )
}

describe('Cross-resource alignment — Paul ↔ Παῦλος (viewModel)', () => {
  test('viewModel: ULT Paul alignedOriginalWordIds include Παῦλος semanticId', async () => {
    const proc = new USJProcessor()
    const ult = await proc.processUSFM(ULT_USFM, 'tit', 'Titus', { language: 'en' })
    const ugnt = await proc.processUSFM(UGNT_USFM, 'tit', 'Titus', {
      language: 'el-x-koine',
    })

    const paul = findVmWord(flattenUsjTokens(ult.viewModel, 1), 'Paul')
    const paulos = findVmWord(flattenUsjTokens(ugnt.viewModel, 1), 'Παῦλος')
    expect(paul).toBeTruthy()
    expect(paulos).toBeTruthy()
    expect(paul!.semanticId).toBe(
      semanticIdFor(paul!.verseRef, paul!.content, paul!.occurrence)
    )

    const expectedOlId = paulos!.semanticId.toLowerCase()
    const aligned = paul!.alignedOriginalWordIds.map((id) => id.toLowerCase())
    expect(aligned).toContain(expectedOlId)
  })

  test('viewModel: ULT God alignedOriginalWordIds include Θεοῦ occurrence 1', async () => {
    const { viewModel } = await new USJProcessor().processUSFM(ULT_USFM, 'tit', 'Titus', {
      language: 'en',
    })
    const god = findVmWord(flattenUsjTokens(viewModel, 1), 'God')
    expect(god).toBeTruthy()
    expect(god!.alignedOriginalWordIds.some((id) => id.toLowerCase().includes(':θεοῦ:1'))).toBe(
      true
    )
  })

  test('viewModel projection matches Paul ↔ Παῦλος alignedOriginalWordIds', async () => {
    const usj = await new USJProcessor().processUSFM(ULT_USFM, 'tit', 'Titus', {
      language: 'en',
    })

    const vmPaul = findVmWord(flattenUsjTokens(usj.viewModel, 1), 'Paul')
    const projPaul = usj.scripture.chapters
      .find((c) => c.number === 1)
      ?.verses.find((v) => v.number === 1)
      ?.wordTokens?.find((t) => t.type === 'word' && t.content === 'Paul')

    expect(vmPaul).toBeTruthy()
    expect(projPaul).toBeTruthy()

    const norm = (ids: string[] | undefined) =>
      (ids || []).map((id) => id.toLowerCase()).sort()

    expect(norm(vmPaul!.alignedOriginalWordIds)).toEqual(
      norm(projPaul!.alignedOriginalWordIds)
    )
    expect(norm(vmPaul!.alignedOriginalWordIds).some((id) => id.includes('παῦλος'))).toBe(true)
  })
})
