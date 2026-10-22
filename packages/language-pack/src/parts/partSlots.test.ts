import { describe, expect, test } from 'bun:test'
import { fnv1a32, slotId, slotOfRow } from './partSlots'

const ULT = { key: 'unfoldingWord/en/ult', type: 'scripture', subject: 'Aligned Bible' }
const TN = { key: 'unfoldingWord/en/tn', type: 'notes', subject: 'TSV Translation Notes' }
// tc-study's catalog says `unknown` for word links: the subject decides.
const TWL = { key: 'unfoldingWord/en/twl', type: 'unknown', subject: 'TSV Translation Words Links' }
const TQ = { key: 'unfoldingWord/en/tq', type: 'questions', subject: 'TSV Translation Questions' }
const UHB = { key: 'unfoldingWord/hbo/uhb', type: 'scripture', subject: 'Hebrew Old Testament' }
const MACULA = { key: 'Biblica/hbo/macula', type: 'original-syntax', subject: 'Original Language Syntax' }
const TW = { key: 'unfoldingWord/en/tw', type: 'words', subject: 'Translation Words' }
const TA = { key: 'unfoldingWord/en/ta', type: 'academy', subject: 'Translation Academy' }
const UHL = { key: 'test_org/en/uhl', type: 'lexicon', subject: 'Hebrew Lexicon' }
const OBS = { key: 'unfoldingWord/en/obs', type: 'obs', subject: 'Open Bible Stories' }
const OBS_TN = { key: 'unfoldingWord/en/obs-tn', type: 'obs-notes', subject: 'TSV OBS Translation Notes' }

const OL = 'unfoldingWord/hbo/uhb@gabcdef0123+2.3.0-usj'

describe('which part a row belongs to', () => {
  test('a literal text’s chapter of Ruth goes in its Ruth book part, with its prepared rows', () => {
    expect(slotOfRow({ layer: 'sot', key: 'scripture-usj:unfoldingWord/en/ult:rut:1' }, ULT)).toEqual({ kind: 'book', resource: ULT.key, book: 'rut' })
    expect(slotOfRow({ layer: 'sot', key: 'scripture-usj:unfoldingWord/en/ult:RUT' }, ULT)).toEqual({ kind: 'book', resource: ULT.key, book: 'rut' })
    expect(slotOfRow({ layer: 'prepared', key: 'prepared:scripture:unfoldingWord/en/ult:rut:1:full' }, ULT)).toEqual({ kind: 'book', resource: ULT.key, book: 'rut' })
  })

  test('a note of Ruth, its prepared row and its quote row share one book part', () => {
    const book = { kind: 'book', resource: TN.key, book: 'rut' }
    expect(slotOfRow({ layer: 'sot', key: 'tn:unfoldingWord/en/tn:rut:1' }, TN)).toEqual(book)
    expect(slotOfRow({ layer: 'sot', key: 'tn:unfoldingWord/en/tn:rut' }, TN)).toEqual(book)
    expect(slotOfRow({ layer: 'prepared', key: 'prepared:notes:unfoldingWord/en/tn:rut:1:full' }, TN)).toEqual(book)
    expect(slotOfRow({ layer: 'prepared', key: 'prepared:notes:unfoldingWord/en/tn:rut:nav' }, TN)).toEqual(book)
    expect(slotOfRow({ layer: 'quote', key: `helps-quote:unfoldingWord/en/tn@v80#2026-01-01:${OL}:rut:1` }, TN)).toEqual(book)
  })

  test('the aligned quotes of notes and word links of Ruth go in their own alignments part', () => {
    const align = `helps-align:unfoldingWord/en/tn@v80#2026-01-01:${OL}:unfoldingWord/en/ult@v80+6000230:rut:1`
    expect(slotOfRow({ layer: 'align', key: align }, TN)).toEqual({ kind: 'alignments', resource: TN.key, book: 'rut' })
    const twl = `helps-align:unfoldingWord/en/twl@v80#2026-01-01:${OL}:unfoldingWord/en/ult@v80+6000230:rut:2`
    expect(slotOfRow({ layer: 'align', key: twl }, TWL)).toEqual({ kind: 'alignments', resource: TWL.key, book: 'rut' })
    expect(slotOfRow({ layer: 'sot', key: 'twl:unfoldingWord/en/twl:rut:2' }, TWL)).toEqual({ kind: 'book', resource: TWL.key, book: 'rut' })
    expect(slotOfRow({ layer: 'sot', key: 'tq:unfoldingWord/en/tq:jon:1' }, TQ)).toEqual({ kind: 'book', resource: TQ.key, book: 'jon' })
  })

  test('an original’s book is a part of its own', () => {
    expect(slotOfRow({ layer: 'sot', key: 'scripture-usj:unfoldingWord/hbo/uhb:rut:1' }, UHB)).toEqual({ kind: 'original', resource: UHB.key, book: 'rut' })
    expect(slotOfRow({ layer: 'prepared', key: 'prepared:scripture:unfoldingWord/hbo/uhb:rut:1:light' }, UHB)).toEqual({ kind: 'original', resource: UHB.key, book: 'rut' })
  })

  test('MACULA’s trees and referents of a book are that book’s macula part', () => {
    expect(slotOfRow({ layer: 'sot', key: 'Biblica/hbo/macula/trees/RUT' }, MACULA)).toEqual({ kind: 'macula', resource: MACULA.key, book: 'rut' })
    expect(slotOfRow({ layer: 'sot', key: 'Biblica/hbo/macula/referents/RUT' }, MACULA)).toEqual({ kind: 'macula', resource: MACULA.key, book: 'rut' })
  })

  test('a TW article goes by folder and a fixed hash bucket of its file name', () => {
    const n = fnv1a32('kt/god.md') % 8
    // The loaders key articles without `.md`; a key with it lands in the same bucket.
    expect(slotOfRow({ layer: 'sot', key: 'unfoldingWord/en/tw/bible/kt/god' }, TW)).toEqual({ kind: 'tw', resource: TW.key, group: `kt:${n}` })
    expect(slotOfRow({ layer: 'sot', key: 'unfoldingWord/en/tw/bible/kt/god.md' }, TW)).toEqual({ kind: 'tw', resource: TW.key, group: `kt:${n}` })
    expect(slotOfRow({ layer: 'sot', key: 'unfoldingWord/en/tw/bible/names/ruth' }, TW)?.group).toBe(`names:${fnv1a32('names/ruth.md') % 8}`)
  })

  test('a TA article goes by manual, and translate also by a hash bucket of its article id', () => {
    const n = fnv1a32('figs-metaphor') % 4
    expect(slotOfRow({ layer: 'sot', key: 'unfoldingWord/en/ta/translate/figs-metaphor' }, TA)).toEqual({ kind: 'ta', resource: TA.key, group: `translate:${n}` })
    expect(slotOfRow({ layer: 'sot', key: 'unfoldingWord/en/ta/checking/vol2-backtranslation-who' }, TA)).toEqual({ kind: 'ta', resource: TA.key, group: 'checking' })
    expect(slotOfRow({ layer: 'sot', key: 'unfoldingWord/en/ta/intro/ta-intro' }, TA)?.group).toBe('intro')
    expect(slotOfRow({ layer: 'sot', key: 'unfoldingWord/en/ta/process/intro-publishing' }, TA)?.group).toBe('process')
  })

  test('TA and TW titles (and TW previews) go in one titles part each', () => {
    expect(slotOfRow({ layer: 'text', key: 'helps-text:ta-title:unfoldingWord/en/ta@v80#2026-01-01:translate/figs-metaphor' }, TA)).toEqual({ kind: 'titles', resource: TA.key })
    expect(slotOfRow({ layer: 'text', key: 'helps-text:tw-title:unfoldingWord/en/tw@v80#2026-01-01:bible/kt/god' }, TW)).toEqual({ kind: 'titles', resource: TW.key })
    expect(slotOfRow({ layer: 'text', key: 'helps-text:tw-preview:unfoldingWord/en/tw@v80#2026-01-01:bible/kt/god' }, TW)).toEqual({ kind: 'titles', resource: TW.key })
  })

  test('a lexicon entry goes by its Strong number, a thousand at a time', () => {
    expect(slotOfRow({ layer: 'sot', key: 'test_org/en/uhl/content/1234.json' }, UHL)).toEqual({ kind: 'lexicon', resource: UHL.key, group: '1' })
    expect(slotOfRow({ layer: 'sot', key: 'test_org/en/uhl/content/999.json' }, UHL)?.group).toBe('0')
    expect(slotOfRow({ layer: 'sot', key: 'test_org/en/uhl/content/8674.json' }, UHL)?.group).toBe('8')
    expect(slotOfRow({ layer: 'sot', key: 'test_org/en/uhl/domains/12.json' }, UHL)?.group).toBe('domains')
  })

  test('OBS and its helps go ten stories at a time', () => {
    expect(slotOfRow({ layer: 'sot', key: 'obs:unfoldingWord/en/obs:12' }, OBS)).toEqual({ kind: 'obs', resource: OBS.key, group: '11-20' })
    expect(slotOfRow({ layer: 'sot', key: 'obs:unfoldingWord/en/obs:01' }, OBS)?.group).toBe('1-10')
    expect(slotOfRow({ layer: 'sot', key: 'obs:unfoldingWord/en/obs:50' }, OBS)?.group).toBe('41-50')
    expect(slotOfRow({ layer: 'sot', key: 'tn:unfoldingWord/en/obs-tn:obs:12' }, OBS_TN)).toEqual({ kind: 'obs', resource: OBS_TN.key, group: '11-20' })
    expect(slotOfRow({ layer: 'prepared', key: 'prepared:notes:unfoldingWord/en/obs-tn:obs:20:full' }, OBS_TN)?.group).toBe('11-20')
    // The helps' row for the whole of OBS (which stories have notes) is about no one story.
    expect(slotOfRow({ layer: 'sot', key: 'tn:unfoldingWord/en/obs-tn:obs' }, OBS_TN)).toEqual({ kind: 'obs', resource: OBS_TN.key, group: 'index' })
  })

  test('receipts, coverage marks and other resources’ rows are in no part', () => {
    expect(slotOfRow({ layer: 'receipt', key: 'resource:unfoldingWord/en/tn' }, TN)).toBeNull()
    expect(slotOfRow({ layer: 'sot', key: 'warm-coverage:v1' }, TN)).toBeNull()
    expect(slotOfRow({ layer: 'prepared', key: 'prepared:notes:unfoldingWord/en/tn-extra:rut:1:full' }, TN)).toBeNull()
    expect(slotOfRow({ layer: 'text', key: 'helps-text:tw-title:unfoldingWord/en/tw@v80:bible/kt/god' }, TA)).toBeNull()
  })

  test('slotId names the slot, book and group only when they are there', () => {
    expect(slotId({ kind: 'book', resource: TN.key, book: 'rut' })).toBe('book:unfoldingWord/en/tn:rut')
    expect(slotId({ kind: 'tw', resource: TW.key, group: 'kt:3' })).toBe('tw:unfoldingWord/en/tw:kt:3')
    expect(slotId({ kind: 'titles', resource: TA.key })).toBe('titles:unfoldingWord/en/ta')
  })

  test('fnv1a32 is the standard 32-bit FNV-1a', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
    expect(fnv1a32('foobar')).toBe(0xbf9cf968)
  })
})
