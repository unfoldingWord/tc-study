import { describe, expect, test } from 'bun:test'
import { wrapVersioned } from '../cache/versionedEnvelope'
import { NOTES_PREPARE_VERSION, type NotesFullChapter } from '../notes/notesPreparer'
import { preparedUnitKey } from '../prepare/prepareKeys'
import {
  WORDS_LINKS_PREPARE_VERSION,
  type WordsLinksFullChapter,
} from '../wordsLinks/wordsLinksPreparer'
import {
  readPreparedNotesSpan,
  readPreparedWordsLinksSpan,
  resetPreparedHelpsHealingForTests,
} from './ensurePreparedHelpsChapter'
import {
  preparedLinkToTranslationWordsLink,
  preparedNoteToTranslationNote,
} from './preparedHelpsRows'

describe('ensurePreparedHelpsChapter', () => {
  test('readPreparedNotesSpan merges chapter rows', async () => {
    resetPreparedHelpsHealingForTests()
    const store = new Map<string, unknown>()
    const ch1: NotesFullChapter = {
      version: NOTES_PREPARE_VERSION,
      unit: 1,
      notes: [
        {
          id: 'a',
          reference: '1:1',
          quote: 'q',
          bodyHast: { type: 'root', children: [] },
          note: 'body',
          supportReference: '',
          tags: '',
          occurrence: '1',
        },
      ],
    }
    const ch2: NotesFullChapter = {
      version: NOTES_PREPARE_VERSION,
      unit: 2,
      notes: [
        {
          id: 'b',
          reference: '2:1',
          quote: '',
          bodyHast: { type: 'root', children: [] },
          note: 'two',
          supportReference: 'rc://*/ta/man/translate/figs',
          tags: 'kt',
          occurrence: '1',
        },
      ],
    }
    store.set(
      preparedUnitKey('notes', 'uw/en/tn', 'tit', 1, 'full'),
      wrapVersioned(ch1, NOTES_PREPARE_VERSION)
    )
    store.set(
      preparedUnitKey('notes', 'uw/en/tn', 'tit', 2, 'full'),
      wrapVersioned(ch2, NOTES_PREPARE_VERSION)
    )

    const cache = {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => {
        store.set(k, v)
      },
    }

    const rows = await readPreparedNotesSpan(cache, 'uw/en/tn', 'tit', 1, 2)
    expect(rows).toHaveLength(2)
    expect(rows![0]!.id).toBe('a')
    expect(rows![1]!.supportReference).toContain('ta/man')
  })

  test('readPreparedWordsLinksSpan returns null on total miss', async () => {
    const cache = {
      get: async () => undefined,
      set: async () => undefined,
    }
    const rows = await readPreparedWordsLinksSpan(cache, 'uw/en/twl', 'tit', 1, 1)
    expect(rows).toBeNull()
  })

  test('readPreparedWordsLinksSpan merges links', async () => {
    const store = new Map<string, unknown>()
    const ch1: WordsLinksFullChapter = {
      version: WORDS_LINKS_PREPARE_VERSION,
      unit: 1,
      links: [
        {
          id: 'l1',
          reference: '1:1',
          origWords: 'Παῦλος',
          occurrence: '1',
          twLink: 'rc://*/tw/dict/bible/names/paul',
          tags: 'names',
          articlePath: 'bible/names/paul',
          quoteFolded: 'paul',
        },
      ],
    }
    store.set(
      preparedUnitKey('words-links', 'uw/en/twl', 'tit', 1, 'full'),
      wrapVersioned(ch1, WORDS_LINKS_PREPARE_VERSION)
    )
    const cache = {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => {
        store.set(k, v)
      },
    }
    const rows = await readPreparedWordsLinksSpan(cache, 'uw/en/twl', 'tit', 1, 1)
    expect(rows).toHaveLength(1)
    expect(rows![0]!.articlePath).toBe('bible/names/paul')
  })
})

describe('preparedHelpsRows', () => {
  test('preparedNoteToTranslationNote carries bodyHast', () => {
    const note = preparedNoteToTranslationNote({
      id: 'n1',
      reference: '1:1',
      quote: 'q',
      bodyHast: { type: 'root', children: [] },
      note: '**hi**',
      supportReference: '',
      tags: '',
      occurrence: '1',
    })
    expect(note.note).toBe('**hi**')
    expect(note.bodyHast?.type).toBe('root')
  })

  test('preparedLinkToTranslationWordsLink carries articlePath', () => {
    const link = preparedLinkToTranslationWordsLink({
      id: 'l1',
      reference: '1:1',
      origWords: 'x',
      occurrence: '1',
      twLink: 'rc://*/tw/dict/bible/kt/god',
      tags: 'kt',
      articlePath: 'bible/kt/god',
    })
    expect(link.articlePath).toBe('bible/kt/god')
    expect(link.origWords).toBe('x')
  })
})
