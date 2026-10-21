import { describe, expect, test } from 'bun:test'
import {
  firstVisibleHelpsSelection,
  focusFirstMatchingHelpsCard,
  isHelpsCardSelected,
  isHelpsFilterSourceCard,
  type HelpsCardSelection,
} from './helpsCardSelection'
import type { LinkWithAlignments, MergedRow, NoteWithAlignments } from './useCombinedHelpsMerge'

function makeNote(id: string, quote: string): NoteWithAlignments {
  return {
    id,
    reference: '2:9',
    tags: '',
    quote,
    occurrence: '1',
    note: 'note',
    supportReference: '',
  } as NoteWithAlignments
}

function makeLink(id: string, origWords: string): LinkWithAlignments {
  return {
    id,
    reference: '2:9',
    tags: '',
    origWords,
    occurrence: '1',
    twLink: 'rc://*/tw/dict/bible/kt/elect',
    articlePath: 'bible/kt/elect',
  } as LinkWithAlignments
}

describe('exclusive CombinedHelps card selection', () => {
  const tn = { kind: 'tn' as const, id: 'tn-chosen-people' }
  const twl = { kind: 'twl' as const, id: 'twl-chosen-people' }

  test('selecting one card (TN or TWL) leaves the other inactive', () => {
    const selectedTn: HelpsCardSelection = { kind: 'tn', id: tn.id }
    expect(isHelpsCardSelected(selectedTn, 'tn', tn.id)).toBe(true)
    expect(isHelpsCardSelected(selectedTn, 'twl', twl.id)).toBe(false)

    const selectedTwl: HelpsCardSelection = { kind: 'twl', id: twl.id }
    expect(isHelpsCardSelected(selectedTwl, 'tn', tn.id)).toBe(false)
    expect(isHelpsCardSelected(selectedTwl, 'twl', twl.id)).toBe(true)
  })

  test('token-click focus highlights only the first visible match', () => {
    const notes = [makeNote(tn.id, 'of the chosen people of God')]
    const links = [makeLink(twl.id, 'of the chosen people')]
    const focused = focusFirstMatchingHelpsCard({
      notes,
      links,
      kindFilter: 'all',
      tokenFilter: {
        semanticId: '1pe-2-9-chosen-1',
        content: 'chosen',
        alignedSemanticIds: [],
        timestamp: 1,
      },
      helpsScope: 'scripture',
      bookCodeLower: '1pe',
    })
    expect(focused).toEqual({ kind: 'tn', id: tn.id })
    expect(isHelpsCardSelected(focused, 'twl', twl.id)).toBe(false)
  })

  test('filter source is the anchor card only, independent of click selection', () => {
    const twlArticleFilter = {
      articlePath: 'bible/kt/elect',
      title: 'Elect',
      timestamp: 1,
      anchor: { kind: 'twl' as const, id: twl.id, ref: '2:9' },
    }
    expect(isHelpsFilterSourceCard({ twlArticleFilter }, 'twl', twl.id)).toBe(true)
    expect(isHelpsFilterSourceCard({ twlArticleFilter }, 'twl', 'twl-other')).toBe(false)
    expect(isHelpsFilterSourceCard({ twlArticleFilter }, 'tn', twl.id)).toBe(false)

    const supportRefFilter = {
      supportReference: 'rc://*/ta/man/translate/figs-doublet',
      title: 'Doublet',
      timestamp: 1,
      anchor: { kind: 'tn' as const, id: tn.id, ref: '2:9' },
    }
    expect(isHelpsFilterSourceCard({ supportRefFilter }, 'tn', tn.id)).toBe(true)
    expect(isHelpsFilterSourceCard({ supportRefFilter: null, twlArticleFilter: null }, 'tn', tn.id)).toBe(
      false
    )
    const { anchor: _anchor, ...noAnchor } = supportRefFilter
    expect(isHelpsFilterSourceCard({ supportRefFilter: noAnchor }, 'tn', tn.id)).toBe(false)
  })

  test('first visible row is the only focused card', () => {
    const rows = [
      { kind: 'tn', note: { id: tn.id } },
      { kind: 'twl', link: { id: twl.id } },
    ] as MergedRow[]
    const focused = firstVisibleHelpsSelection(rows)
    expect(isHelpsCardSelected(focused, 'tn', tn.id)).toBe(true)
    expect(isHelpsCardSelected(focused, 'twl', twl.id)).toBe(false)
  })
})
