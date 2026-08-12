import { describe, expect, test } from 'bun:test'
import type { UsjWordToken } from '@bt-synergy/scripture-loader'
import { resolveTokenVisualState } from './tokenHighlight'
import { semanticIdFor, semanticIdKey } from './wordIdentity'

function usjWord(
  partial: Pick<UsjWordToken, 'content' | 'verseRef'> & Partial<UsjWordToken>
): UsjWordToken {
  const occurrence = partial.occurrence ?? 1
  return {
    semanticId:
      partial.semanticId ?? semanticIdFor(partial.verseRef, partial.content, occurrence),
    content: partial.content,
    occurrence,
    totalOccurrences: partial.totalOccurrences ?? 1,
    verseRef: partial.verseRef,
    alignedOriginalWordIds: partial.alignedOriginalWordIds ?? [],
  }
}

describe('resolveTokenVisualState (Journey 4/8 contract)', () => {
  const paulos = usjWord({ content: 'Παῦλος', verseRef: 'tit 1:1' })
  const paul = usjWord({
    content: 'Paul',
    verseRef: 'tit 1:1',
    alignedOriginalWordIds: ['tit 1:1:Παῦλος:1'],
  })

  test('Paul click selects Paul', () => {
    const state = resolveTokenVisualState(paul, {
      isOriginalLanguage: false,
      highlightTarget: {
        semanticId: paul.semanticId,
        alignedSemanticIds: paul.alignedOriginalWordIds,
        content: 'Paul',
        verseRef: 'tit 1:1',
      },
    })
    expect(state.isHighlighted).toBe(true)
    expect(state.isSelected).toBe(true)
  })

  test('Παῦλος click highlights Paul via alignedOriginalWordIds', () => {
    const state = resolveTokenVisualState(paul, {
      isOriginalLanguage: false,
      highlightTarget: {
        semanticId: 'TIT 1:1:Παῦλος:1',
        alignedSemanticIds: ['TIT 1:1:Παῦλος:1'],
        content: 'Παῦλος',
        verseRef: 'TIT 1:1',
      },
    })
    expect(state.isHighlighted).toBe(true)
  })

  test('Paul click highlights Παῦλος via alignedSemanticIds', () => {
    const state = resolveTokenVisualState(paulos, {
      isOriginalLanguage: true,
      highlightTarget: {
        semanticId: paul.semanticId,
        alignedSemanticIds: ['tit 1:1:Παῦλος:1'],
        content: 'Paul',
        verseRef: 'tit 1:1',
      },
    })
    expect(state.isHighlighted).toBe(true)
  })

  test('TN underline via alignedOriginalWordIds (God←Θεοῦ)', () => {
    const god = usjWord({
      content: 'God',
      verseRef: 'tit 1:1',
      alignedOriginalWordIds: ['tit 1:1:Θεοῦ:1'],
    })
    const state = resolveTokenVisualState(god, {
      isOriginalLanguage: false,
      highlightTarget: null,
      underlinedSemanticIds: new Set([semanticIdKey('tit 1:1:Θεοῦ:1')]),
    })
    expect(state.isUnderlined).toBe(true)
  })
})
