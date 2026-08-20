import { describe, expect, test } from 'bun:test'
import {
  buildSortedMergedRows,
  filterLinksByReferenceRange,
  filterNotesByReferenceRange,
  filterRowsByKind,
  groupMergedRows,
  inheritedPositions,
  mergeNotesAndLinksToRows,
  sortMergedRows,
  type MergedRow,
  type NoteWithAlignments,
  type LinkWithAlignments,
} from './useCombinedHelpsMerge'

function makeNote(
  overrides: Partial<NoteWithAlignments> & { id: string; reference: string }
): NoteWithAlignments {
  return {
    tags: '',
    quote: 'word',
    occurrence: '1',
    note: 'note text',
    supportReference: '',
    ...overrides,
  } as NoteWithAlignments
}

function makeLink(
  overrides: Partial<LinkWithAlignments> & { id: string; reference: string }
): LinkWithAlignments {
  return {
    tags: '',
    origWords: 'word',
    occurrence: '1',
    twLink: 'rc://*/tw/dict/bible/kt/god',
    articlePath: 'bible/kt/god',
    ...overrides,
  } as LinkWithAlignments
}

describe('inheritedPositions', () => {
  test('uses first aligned token position when present', () => {
    expect(
      inheritedPositions([
        { alignedTokens: [{ position: 3 }] },
        { alignedTokens: [{ position: 7 }] },
      ])
    ).toEqual([3, 7])
  })

  test('chains +0.5 from previous when unaligned', () => {
    expect(
      inheritedPositions([
        { alignedTokens: [{ position: 2 }] },
        {},
        {},
      ])
    ).toEqual([2, 2.5, 3])
  })

  test('starts at -1 when first entry has no alignment', () => {
    expect(inheritedPositions([{}, { alignedTokens: [{ position: 5 }] }])).toEqual([-1, 5])
  })
})

describe('mergeNotesAndLinksToRows', () => {
  test('builds tn and twl rows with sort fields from references', () => {
    const notes = [makeNote({ id: 'n1', reference: '1:2' })]
    const links = [makeLink({ id: 'l1', reference: '1:3' })]
    const rows = mergeNotesAndLinksToRows(notes, links)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kind: 'tn', ref: '1:2', sortChapter: 1, sortVerse: 2 })
    expect(rows[1]).toMatchObject({ kind: 'twl', ref: '1:3', sortChapter: 1, sortVerse: 3 })
  })
})

describe('sortMergedRows', () => {
  test('orders by chapter, verse, then position', () => {
    const rows: MergedRow[] = [
      { kind: 'tn', ref: '2:1', sortChapter: 2, sortVerse: 1, sortPosition: 1, note: makeNote({ id: 'a', reference: '2:1' }) },
      { kind: 'twl', ref: '1:5', sortChapter: 1, sortVerse: 5, sortPosition: 9, link: makeLink({ id: 'b', reference: '1:5' }) },
      { kind: 'tn', ref: '1:5', sortChapter: 1, sortVerse: 5, sortPosition: 2, note: makeNote({ id: 'c', reference: '1:5' }) },
    ]
    const sorted = sortMergedRows(rows)
    expect(sorted.map((r) => (r.kind === 'tn' ? r.note.id : r.link.id))).toEqual(['c', 'b', 'a'])
  })

  test('prefers tn over twl when chapter/verse/position tie', () => {
    const rows: MergedRow[] = [
      { kind: 'twl', ref: '1:1', sortChapter: 1, sortVerse: 1, sortPosition: 1, link: makeLink({ id: 'l', reference: '1:1' }) },
      { kind: 'tn', ref: '1:1', sortChapter: 1, sortVerse: 1, sortPosition: 1, note: makeNote({ id: 'n', reference: '1:1' }) },
    ]
    const sorted = sortMergedRows(rows)
    expect(sorted[0]!.kind).toBe('tn')
    expect(sorted[1]!.kind).toBe('twl')
  })
})

describe('filterRowsByKind', () => {
  const rows: MergedRow[] = [
    { kind: 'tn', ref: '1:1', sortChapter: 1, sortVerse: 1, sortPosition: 0, note: makeNote({ id: 'n', reference: '1:1' }) },
    { kind: 'twl', ref: '1:1', sortChapter: 1, sortVerse: 1, sortPosition: 1, link: makeLink({ id: 'l', reference: '1:1' }) },
  ]

  test('all keeps both kinds', () => {
    expect(filterRowsByKind(rows, 'all')).toHaveLength(2)
  })

  test('notes keeps only tn', () => {
    const filtered = filterRowsByKind(rows, 'notes')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.kind).toBe('tn')
  })

  test('twl keeps only twl', () => {
    const filtered = filterRowsByKind(rows, 'twl')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.kind).toBe('twl')
  })
})

describe('buildSortedMergedRows', () => {
  test('applies kind filter before sorting', () => {
    const notes = [
      makeNote({ id: 'n1', reference: '1:2', alignedTokens: [{ position: 1 }] }),
      makeNote({ id: 'n2', reference: '1:1', alignedTokens: [{ position: 1 }] }),
    ]
    const links = [makeLink({ id: 'l1', reference: '1:1', alignedTokens: [{ position: 0 }] })]

    const all = buildSortedMergedRows(notes, links, 'all')
    expect(all.map((r) => (r.kind === 'tn' ? r.note.id : r.link.id))).toEqual(['l1', 'n2', 'n1'])

    const notesOnly = buildSortedMergedRows(notes, links, 'notes')
    expect(notesOnly.every((r) => r.kind === 'tn')).toBe(true)
    expect(notesOnly.map((r) => (r.kind === 'tn' ? r.note.id : r.link.id))).toEqual(['n2', 'n1'])

    const twlOnly = buildSortedMergedRows(notes, links, 'twl')
    expect(twlOnly).toHaveLength(1)
    expect(twlOnly[0]!.kind).toBe('twl')
  })
})

describe('Titus 1 CombinedHelps list (TN + TWL)', () => {
  test('kindFilter all keeps notes and word links for the same passage', () => {
    const notes = [
      makeNote({ id: 'tn-intro', reference: '1:intro', quote: '', note: 'Chapter outline' }),
      makeNote({ id: 'tn-paul', reference: '1:1', quote: 'Paul' }),
    ]
    const links = [
      makeLink({
        id: 'twl-faith',
        reference: '1:1',
        origWords: 'πίστιν',
        twLink: 'rc://*/tw/dict/bible/kt/faith',
        articlePath: 'bible/kt/faith',
      }),
      makeLink({
        id: 'twl-christ',
        reference: '1:1',
        origWords: 'Χριστοῦ',
        twLink: 'rc://*/tw/dict/bible/kt/christ',
        articlePath: 'bible/kt/christ',
      }),
    ]

    const rows = buildSortedMergedRows(notes, links, 'all')
    expect(rows.some((r) => r.kind === 'tn')).toBe(true)
    expect(rows.some((r) => r.kind === 'twl')).toBe(true)
    expect(rows.filter((r) => r.kind === 'twl').map((r) => (r.kind === 'twl' ? r.link.id : ''))).toEqual([
      'twl-faith',
      'twl-christ',
    ])

    const groups = groupMergedRows(rows)
    const verseOne = groups.find((g) => g.ref === '1:1')
    expect(verseOne).toBeDefined()
    expect(verseOne!.items.some((item) => item.kind === 'tn')).toBe(true)
    expect(verseOne!.items.some((item) => item.kind === 'twl')).toBe(true)
    expect(verseOne!.items.filter((item) => item.kind === 'twl')).toHaveLength(2)
  })
})

describe('groupMergedRows', () => {
  test('groups consecutive rows with the same ref', () => {
    const rows = buildSortedMergedRows(
      [makeNote({ id: 'n1', reference: '1:1' }), makeNote({ id: 'n2', reference: '1:2' })],
      [makeLink({ id: 'l1', reference: '1:1' })],
      'all'
    )
    const groups = groupMergedRows(rows)
    expect(groups.map((g) => g.ref)).toEqual(['1:1', '1:2'])
    expect(groups[0]!.items).toHaveLength(2)
    expect(groups[1]!.items).toHaveLength(1)
  })
})

describe('filterNotesByReferenceRange', () => {
  const notes = [
    makeNote({ id: 'a', reference: '1:1' }),
    makeNote({ id: 'b', reference: '1:3-5' }),
    makeNote({ id: 'c', reference: '2:1' }),
  ]

  test('keeps notes overlapping verse range in a single chapter', () => {
    const filtered = filterNotesByReferenceRange(notes, {
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 4,
    })
    expect(filtered.map((n) => n.id)).toEqual(['b'])
  })

  test('includes spanning notes across chapter end', () => {
    const filtered = filterNotesByReferenceRange(notes, {
      startChapter: 1,
      startVerse: 5,
      endChapter: 2,
      endVerse: 1,
    })
    expect(filtered.map((n) => n.id)).toEqual(['b', 'c'])
  })
})

describe('filterLinksByReferenceRange', () => {
  const links = [
    makeLink({ id: 'a', reference: '1:1' }),
    makeLink({ id: 'b', reference: '1:3' }),
    makeLink({ id: 'c', reference: '2:1' }),
  ]

  test('filters single-chapter verse window', () => {
    const filtered = filterLinksByReferenceRange(links, {
      startChapter: 1,
      startVerse: 2,
      endChapter: 1,
      endVerse: 3,
    })
    expect(filtered.map((l) => l.id)).toEqual(['b'])
  })

  test('filters multi-chapter range', () => {
    const filtered = filterLinksByReferenceRange(links, {
      startChapter: 1,
      startVerse: 3,
      endChapter: 2,
      endVerse: 1,
    })
    expect(filtered.map((l) => l.id)).toEqual(['b', 'c'])
  })
})
