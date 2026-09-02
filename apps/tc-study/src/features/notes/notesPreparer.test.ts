import { describe, expect, test } from 'bun:test'
import type { ProcessedNotes } from '@bt-synergy/resource-parsers'
import {
  buildNotesFull,
  buildNotesLight,
  notesPreparer,
  tnCacheKey,
} from './notesPreparer'
import { getRegisteredPreparerIds } from '../prepare/prepareRegistry'
import { ensurePreparersRegistered } from '../prepare/registerPreparers'

const sampleNotes: ProcessedNotes = {
  bookCode: 'tit',
  bookName: 'Titus',
  notes: [
    {
      reference: '1:1',
      id: 'abc1',
      tags: '',
      supportReference: '',
      quote: 'Παῦλος',
      occurrence: '1',
      note: 'Paul is an **apostle**. See [grace](rc://*/tw/dict/bible/kt/grace).',
    },
    {
      reference: '2:1',
      id: 'abc2',
      tags: '',
      supportReference: '',
      quote: '',
      occurrence: '1',
      note: 'Chapter two note',
    },
  ],
  notesByChapter: {
    '1': [
      {
        reference: '1:1',
        id: 'abc1',
        tags: '',
        supportReference: '',
        quote: 'Παῦλος',
        occurrence: '1',
        note: 'Paul is an **apostle**. See [grace](rc://*/tw/dict/bible/kt/grace).',
      },
    ],
    '2': [
      {
        reference: '2:1',
        id: 'abc2',
        tags: '',
        supportReference: '',
        quote: '',
        occurrence: '1',
        note: 'Chapter two note',
      },
    ],
  },
  metadata: {
    bookCode: 'tit',
    bookName: 'Titus',
    processingDate: new Date().toISOString(),
    totalNotes: 2,
    chaptersWithNotes: [1, 2],
    statistics: { totalNotes: 2, notesPerChapter: { '1': 1, '2': 1 } },
  },
}

describe('notesPreparer', () => {
  test('tnCacheKey matches TranslationNotesLoader format', () => {
    expect(tnCacheKey('unfoldingWord/en/tn', 'tit')).toBe('tn:unfoldingWord/en/tn:tit')
  })

  test('unitsFor uses notesByChapter keys', () => {
    const source = {
      resourceKey: 'unfoldingWord/en/tn',
      bookId: 'tit',
      notes: sampleNotes,
    }
    expect(notesPreparer.unitsFor(source)).toEqual([1, 2])
  })

  test('prepareLight strips markdown in body', () => {
    const source = {
      resourceKey: 'unfoldingWord/en/tn',
      bookId: 'tit',
      notes: sampleNotes,
    }
    const light = buildNotesLight(source, 1)
    expect(light.notes).toHaveLength(1)
    expect(light.notes[0]!.body).toContain('apostle')
    expect(light.notes[0]!.body).not.toContain('**')
    expect(light.notes[0]!.quote).toBe('Παῦλος')
  })

  test('prepareFull includes hast + folded quote', () => {
    const source = {
      resourceKey: 'unfoldingWord/en/tn',
      bookId: 'tit',
      notes: sampleNotes,
    }
    const full = buildNotesFull(source, 1)
    expect(full.notes).toHaveLength(1)
    expect(full.notes[0]!.bodyHast.type).toBe('root')
    expect(full.notes[0]!.quoteFolded).toBeTruthy()
  })

  test('readSource loads tn: cache', async () => {
    const store = new Map<string, unknown>()
    store.set('tn:unfoldingWord/en/tn:tit', sampleNotes)
    const source = await notesPreparer.readSource(
      {
        cacheAdapter: {
          get: async (k) => store.get(k),
          set: async (k, v) => {
            store.set(k, v)
          },
        },
      },
      'unfoldingWord/en/tn',
      'tit'
    )
    expect(source?.notes.notes).toHaveLength(2)
  })

  test('ensurePreparersRegistered includes notes', () => {
    const ids = ensurePreparersRegistered()
    expect(ids).toContain('notes')
    expect(ids).toContain('scripture')
    expect(getRegisteredPreparerIds()).toContain('notes')
  })
})
