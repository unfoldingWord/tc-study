import { describe, expect, test } from 'bun:test'
import { semanticIdMatchKey } from '../../../../features/helps/semanticIdMatchKey'
import type { InternedToken } from '../../../../features/scripture/scripturePreparer'
import { clickAlignedSemanticIds, usjWordFromInterned } from './useHighlighting'

// Ruth 4:5 in the UHB: the verse has the ketiv קניתי; its footnote gives the qere קָנִ֔יתָה,
// which the GLT's \zaln names (aligned to «adquieres»).
const verseRef = 'rut 4:5'
const ketivKey = semanticIdMatchKey('rut 4:5:קניתי:1')
const qereKey = semanticIdMatchKey('rut 4:5:קָנִ֔יתָה:1')

describe('a ketiv click broadcasts its qere', () => {
  test('usjWordFromInterned carries the qere from the prepared token', () => {
    const matchKeys = [ketivKey, qereKey]
    const token: InternedToken = { c: 'קניתי', o: 1, k: 0, qc: 'קָנִ֔יתָה', q: 1 }
    const word = usjWordFromInterned(verseRef, token, matchKeys)
    expect(word.qere).toBe('קָנִ֔יתָה')
    expect(word.qereSemanticId).toBe(qereKey)
    expect(word.alignedOriginalWordIds).toEqual([])
  })

  test('a plain prepared token gets no qere', () => {
    const word = usjWordFromInterned(verseRef, { c: 'וַיֹּ֣אמֶר', o: 1, k: 0 }, [ketivKey])
    expect(word.qere).toBeUndefined()
    expect(word.qereSemanticId).toBeUndefined()
  })

  test('clickAlignedSemanticIds sends the ketiv and its qere', () => {
    const word = usjWordFromInterned(
      verseRef,
      { c: 'קניתי', o: 1, k: 0, qc: 'קָנִ֔יתָה', q: 1 },
      [ketivKey, qereKey]
    )
    expect(clickAlignedSemanticIds(word)).toEqual([word.semanticId, qereKey])
  })

  test('clickAlignedSemanticIds keeps a gateway word to its alignments', () => {
    const word = usjWordFromInterned(verseRef, { c: 'adquieres', o: 1, k: 0, a: [1] }, [
      semanticIdMatchKey('rut 4:5:adquieres:1'),
      qereKey,
    ])
    expect(clickAlignedSemanticIds(word)).toEqual([qereKey])
  })
})
