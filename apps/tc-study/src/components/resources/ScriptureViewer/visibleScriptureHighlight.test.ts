import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UsjWordToken } from '@bt-synergy/scripture-loader'
import { foldHighlightTarget, resolveTokenVisualState } from './utils/tokenHighlight'
import { attachFoldedMatchKeys, semanticIdFor } from './utils/wordIdentity'

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

describe('visible scripture highlight (no keep-alive / paint cache)', () => {
  test('CombinedHelps token-click highlights the matching token on the visible pane', () => {
    const paul = usjWord({
      content: 'Paul',
      verseRef: 'tit 1:1',
      alignedOriginalWordIds: ['tit 1:1:Παῦλος:1'],
    })
    attachFoldedMatchKeys(paul)

    const signalToken = {
      id: 'tit 1:1:Παῦλος:1',
      content: 'Παῦλος',
      semanticId: 'tit 1:1:Παῦλος:1',
      verseRef: 'tit 1:1',
      position: 0,
      alignedSemanticIds: ['tit 1:1:Παῦλος:1'],
    }
    const highlightTarget = foldHighlightTarget({
      semanticId: signalToken.semanticId,
      alignedSemanticIds: signalToken.alignedSemanticIds,
      content: signalToken.content,
      verseRef: signalToken.verseRef,
    })

    const state = resolveTokenVisualState(paul, {
      isOriginalLanguage: false,
      highlightTarget,
    })
    expect(state.isHighlighted).toBe(true)
    expect(state.isSelected).toBe(true)
  })

  test('Read/Studio mount one viewer; token-click always setHighlightTarget', () => {
    const read = readFileSync(join(import.meta.dir, '../../read/ReadLinkedPanel.tsx'), 'utf8')
    const studio = readFileSync(join(import.meta.dir, '../../studio/StudioLinkedPanel.tsx'), 'utf8')
    const viewer = readFileSync(join(import.meta.dir, 'index.tsx'), 'utf8')
    const highlighting = readFileSync(join(import.meta.dir, 'hooks/useHighlighting.ts'), 'utf8')

    expect(read).not.toContain('ScripturePaneKeepAlive')
    expect(studio).not.toContain('ScripturePaneKeepAlive')
    expect(viewer).not.toContain('isPaneActive')
    expect(viewer).not.toContain('ScripturePaneActiveContext')
    expect(viewer).toContain('useHighlighting')
    expect(highlighting).toContain("useSignalHandler<TokenClickSignal>")
    expect(highlighting).toContain('setHighlightTarget(targetFromSignalToken(signal.token))')
    expect(highlighting).not.toContain('if (!applied.changed) return')
    expect(highlighting).not.toContain('applyHighlightSignal')
  })
})
