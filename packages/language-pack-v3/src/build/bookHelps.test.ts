import { describe, expect, test } from 'bun:test'
import { compareCodePoints, decodeBits, decodeDeltas, decodeTexts, decodeUvarints } from '../codec/columns'
import { readSegment, writeSegment } from '../codec/container'
import { verseId } from '../ids'
import { type BookModel, type Event, type HelpRow, LONG_TEXT_COLUMNS, type OrigModel, type OrigWord, type Piece } from '../model'
import { partsSource } from '../node/partsSource'
import { BOOK_TABLES, bookView } from '../read/book'
import type { ResourceRef, Row, RowSource } from '../source/rows'
import { bookSegment } from './book'
import { extractBook, extractHelps } from './bookHelps'
import { extractOrig, OrigIndex } from './orig'

// The data is a sample of real files (spec/tests/data/README.md): es-419 Titus, the GLT and the GST, the tN, tQ and tWL, and the UGNT.
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const GLT = 'es-419_gl/es-419/glt'
const GST = 'es-419_gl/es-419/gst'
const TN = 'es-419_gl/es-419/tn'
const TQ = 'es-419_gl/es-419/tq'
const TWL = 'es-419_gl/es-419/twl'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const TIT = 56_000_000
/** The size the brief allows for the book segment of Titus (phase 0 measured 35.4 KB with zlib). */
const SEGMENT_LIMIT = 40 * 1024

const source = () =>
  partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })

async function collect(rows: AsyncIterable<Row>): Promise<Row[]> {
  const out: Row[] = []
  for await (const row of rows) out.push(row)
  return out
}

type Sample = {
  src: RowSource
  orig: OrigModel
  index: OrigIndex
  issues: string[]
  model: BookModel
  /** The first position of each verse of the UGNT, counted from the raw rows. */
  verseStart: Map<number, number>
}
let cached: Promise<Sample> | undefined
/** The Titus of the data folder, built once. Tests only read it. */
const titus = () =>
  (cached ??= (async (): Promise<Sample> => {
    const src = await source()
    const orig = await extractOrig(src, 'tit')
    const issues: string[] = []
    const model = await extractBook(src, 'es-419', 'tit', orig, issues)
    const raw = await collect(src.rows({ lang: 'originals', book: 'tit', resource: UGNT, layer: 'sot' }))
    return { src, orig, index: new OrigIndex(orig), issues, model, verseStart: rawVerseStarts(raw) }
  })())

// The independent side of the tests: the raw rows, read in the plainest way.

/** The index of the first `\w` of each verse of the UGNT, from the chapter chunks of the raw rows. */
function rawVerseStarts(rows: Row[]): Map<number, number> {
  const chunks = rows
    .filter((row) => /^scripture-usj:[^:]+:tit:\d+$/.test(row.key))
    .map((row) => ({ chapter: Number(row.key.split(':').pop()), content: (row.value as any).content.usj.content as unknown[] }))
    .sort((a, b) => a.chapter - b.chapter)
  const starts = new Map<number, number>()
  let count = 0
  let chapter = 0
  let verse = 0
  const walk = (node: unknown): void => {
    if (typeof node === 'string') return
    const n = node as { type: string; marker?: string; number?: string; content?: unknown[] }
    if (n.type === 'chapter') {
      chapter = Number(n.number)
      verse = 0
    } else if (n.type === 'verse') {
      verse = Number(n.number)
    } else if (n.type === 'char' && n.marker === 'w') {
      const id = TIT + chapter * 1000 + verse
      if (!starts.has(id)) starts.set(id, count)
      count++
      return
    }
    for (const child of n.content ?? []) walk(child)
  }
  for (const chunk of chunks) for (const node of chunk.content) walk(node)
  return starts
}

/** The raw rows of a resource, in file order: the chapter chunks of `tn`/`tq` (`content[field]`) or the book row of `twl`. */
function rawRows(rows: Row[], res: string, prefix: string, field: string): Record<string, any>[] {
  const book = `${prefix}:${res}:tit`
  const chunks = rows
    .filter((row) => row.layer === 'sot' && /^[^:]+:[^:]+:tit:\d+$/.test(row.key) && row.key.startsWith(`${book}:`))
    .sort((a, b) => Number(a.key.split(':').pop()) - Number(b.key.split(':').pop()))
  if (chunks.length > 0) return chunks.flatMap((row) => (row.value as any).content[field])
  return rows.filter((row) => row.key === book).flatMap((row) => (row.value as any)[field])
}

/** The raw quote layer of a resource: for each row id, its tokens. */
function rawQuotes(rows: Row[], res: string): Record<string, any[]> {
  const out: Record<string, any[]> = {}
  for (const row of rows) if (row.layer === 'quote' && row.key.startsWith(`helps-quote:${res}@`)) Object.assign(out, (row.value as any).content)
  return out
}

/** Every string the segment's string table has to hold, one entry per use, counted from the model. */
function usesOf(m: BookModel): string[] {
  const uses: string[] = []
  for (const text of m.texts) {
    for (const [piece] of text.pieces) uses.push(piece)
    for (const [, kind, arg] of text.events) if (kind !== 'close') uses.push(arg)
  }
  for (const table of [m.notes, m.questions, m.links]) {
    if (table === undefined) continue
    if (!table.rows.every((row) => /^[\x00-\x7f]{4}$/.test(row.id))) uses.push(...table.rows.map((row) => row.id))
    for (const row of table.rows) {
      if (row.concept !== undefined) uses.push(row.concept)
      for (const [name, value] of Object.entries(row.cols)) if (typeof value === 'string' && !LONG_TEXT_COLUMNS.includes(name)) uses.push(value)
    }
  }
  return uses
}

// A synthetic original and synthetic rows, for what the sample does not hold.

/** An original of Titus 1: each string of `verses` is a verse, its words separated by blanks. Verse 1 is positions 0.., verse 2 follows. */
function miniOrig(...verses: string[][]): OrigModel {
  const words: OrigWord[] = []
  const pieces: Piece[] = []
  const events: Event[] = [[0, 'chapter', '1']]
  verses.forEach((forms, v) => {
    events.push([pieces.length, 'verse', String(v + 1)])
    forms.forEach((form, i) => {
      if (i > 0) pieces.push([' ', false])
      words.push({ form, lemma: '', strong: '', morph: '' })
      pieces.push([form, true])
    })
    pieces.push([' ', false])
  })
  return { book: 'tit', key: UGNT, stamp: 'g987ab2025a', words, pieces, events }
}
/** Verse 1 = positions 0, 1, 2 (α β α); verse 2 = positions 3, 4 (γ δ). */
const mini = () => miniOrig(['α', 'β', 'α'], ['γ', 'δ'])
const V1 = TIT + 1001
const V2 = TIT + 1002
const V3 = TIT + 1003

const sotRow = (prefix: string, res: string, chapter: number | undefined, content: unknown): Row => ({
  layer: 'sot',
  key: chapter === undefined ? `${prefix}:${res}:tit` : `${prefix}:${res}:tit:${chapter}`,
  value: content,
})
const noteRow = (id: string, reference: string, extra: Record<string, unknown> = {}) => ({
  id,
  isIntro: false,
  note: `Note ${id}`,
  occurrence: '1',
  quote: '',
  reference,
  supportReference: '',
  tags: '',
  ...extra,
})
const tnChunk = (chapter: number, notes: unknown[]): Row => sotRow('tn', TN, chapter, { content: { notes } })
const quoteLayer = (chapter: number, content: Record<string, unknown[]>, res = TN): Row => ({
  layer: 'quote',
  key: `helps-quote:${res}@gbb0c56a52f:${UGNT}@g987ab2025a+2.3.0-usj:tit:${chapter}`,
  value: { content, version: 9 },
})
const token = (content: string, verse: 1 | 2 | 3, occurrence = 1, extra: Record<string, unknown> = {}) => ({
  id: 1,
  text: content,
  type: 'word',
  occurrence,
  content,
  chapter: 1,
  verse,
  ...extra,
})
const notesOf = (rows: Row[], issues: string[] = [], orig: OrigModel = mini()) => extractHelps(rows, 'tit', TN, 'notes', new OrigIndex(orig), issues)

describe('es-419 Titus from the data folder', () => {
  test('has 216 notes (212 with a quote), 36 questions and 223 links (223 with a quote)', async () => {
    const { model } = await titus()
    expect(model.notes!.rows.length).toBe(216)
    expect(model.questions!.rows.length).toBe(36)
    expect(model.links!.rows.length).toBe(223)
    // "With a quote": the row has the text of a quote. Of the 212, 203 have words in the quote layer; the 9 other quotes are
    // "Connecting Statement:" and "General Information:", which are not in the original.
    const withText = (rows: HelpRow[]) => rows.filter((row) => row.cols.quote !== '' && row.cols.origWords !== '')
    expect(model.notes!.rows.filter((row) => row.cols.quote !== '').length).toBe(212)
    expect(model.links!.rows.filter((row) => row.cols.origWords !== '').length).toBe(223)
    expect(withText(model.links!.rows).length).toBe(223)
    expect(model.notes!.rows.filter((row) => row.quote!.length > 0).length).toBe(203)
    expect(model.links!.rows.filter((row) => row.quote!.length > 0).length).toBe(223)
    const lost = model.notes!.rows.filter((row) => row.cols.quote !== '' && row.quote!.length === 0)
    expect(lost.map((row) => row.cols.quote)).toEqual([...Array(8).fill('Connecting Statement:'), 'General Information:'])
    // The questions have a `quote` field (empty), and no positions.
    expect(model.questions!.rows.every((row) => row.quote === undefined)).toBe(true)
  })

  test('the header names the five resources and the original, in the order of their keys', async () => {
    const { model, orig } = await titus()
    expect(model.res).toEqual([[GLT, 'v42'], [GST, 'v40'], [TN, 'v66'], [TQ, 'v38'], [TWL, 'v18']])
    expect(model.orig).toEqual([UGNT, 'g987ab2025a'])
    expect(model.orig).toEqual([orig.key, orig.stamp])
    expect(model.texts.map((text) => text.res)).toEqual([GLT, GST])
    expect([model.notes!.res, model.questions!.res, model.links!.res]).toEqual([TN, TQ, TWL])
  })

  test('the rows are the rows of the source, in file order, with the ids of the TSV', async () => {
    const { src, model } = await titus()
    const rows = await collect(src.rows({ lang: 'es-419', book: 'tit' }))
    expect(model.notes!.rows.map((row) => row.id)).toEqual(rawRows(rows, TN, 'tn', 'notes').map((row) => row.id))
    expect(model.questions!.rows.map((row) => row.id)).toEqual(rawRows(rows, TQ, 'tq', 'questions').map((row) => row.id))
    expect(model.links!.rows.map((row) => row.id)).toEqual(rawRows(rows, TWL, 'twl', 'links').map((row) => row.id))
    // 216 of 216 ids are unique in Tito, so none was renamed.
    expect(model.notes!.rows.some((row) => row.id.includes('~'))).toBe(false)
  })

  test('every link has a concept that starts with tw:, and none keeps twLink in cols', async () => {
    const { src, model } = await titus()
    const raw = rawRows(await collect(src.rows({ lang: 'es-419', book: 'tit' })), TWL, 'twl', 'links')
    for (const [i, row] of model.links!.rows.entries()) {
      expect(row.concept!.startsWith('tw:')).toBe(true)
      // The independent reading: the address without its prefix.
      expect(row.concept).toBe(`tw:${raw[i].twLink.replace('rc://*/tw/dict/bible/', '')}`)
      expect('twLink' in row.cols).toBe(false)
      // The other fields stay as the row has them.
      expect(row.cols).toEqual({ articlePath: raw[i].articlePath, occurrence: raw[i].occurrence, origWords: raw[i].origWords, tags: raw[i].tags })
    }
  })

  test('the concept of a note is its SupportReference as ta:..., and a note without one has no concept and no column', async () => {
    const { src, model } = await titus()
    const raw = rawRows(await collect(src.rows({ lang: 'es-419', book: 'tit' })), TN, 'tn', 'notes')
    let withConcept = 0
    for (const [i, row] of model.notes!.rows.entries()) {
      const support: string = raw[i].supportReference
      expect('supportReference' in row.cols).toBe(false)
      if (support === '') expect(row.concept).toBeUndefined()
      else {
        withConcept++
        expect(row.concept).toBe(`ta:${support.replace('rc://*/ta/man/', '')}`)
      }
    }
    expect(withConcept).toBe(112)
    expect(model.notes!.rows.length - withConcept).toBe(104)
  })

  test('the note m2jl: reference 1:1, a note without a literal \\n, its links rewritten to ta:', async () => {
    const { src, model } = await titus()
    const note = model.notes!.rows.find((row) => row.id === 'm2jl')!
    expect([note.ref, note.from, note.to]).toEqual(['1:1', 56_001_001, 56_001_001])
    const text = note.cols.note as string
    expect(text.includes('\\n')).toBe(false)
    expect(text.includes('<br>')).toBe(false)
    expect(text.startsWith('# Introducción a Tito\n\n## Parte 1: Introducción general\n\n')).toBe(true)
    expect(text.match(/\[\[[^\]]*\]\]/g)).toEqual(['[[ta:translate/translate-names]]', '[[ta:translate/figs-exclusive]]', '[[ta:translate/figs-you]]'])
    expect(text.includes('rc://')).toBe(false)
    expect(note.cols.isIntro).toBe(true)
    expect(note.concept).toBeUndefined()
    expect(note.quote).toEqual([])
    // The same note in the raw row: the literal \n is there, and so are the three addresses (with the language of the note).
    const raw = rawRows(await collect(src.rows({ lang: 'es-419', book: 'tit' })), TN, 'tn', 'notes').find((row) => row.id === 'm2jl')!
    expect(raw.note.includes('\\n')).toBe(true)
    expect(raw.note.match(/rc:\/\/es-419\/ta\/man\/[a-z-]+\/[a-z-]+/g)!.length).toBe(3)
  })

  test('every [[rc://es-419/ta/man/...]] link of the notes (104) is a [[ta:...]] link, and no [[rc:// is left', async () => {
    const { src, model } = await titus()
    const raw = rawRows(await collect(src.rows({ lang: 'es-419', book: 'tit' })), TN, 'tn', 'notes')
    const rawLinks = raw.flatMap((row) => row.note.match(/\[\[rc:\/\/es-419\/ta\/man\/([a-z0-9-]+\/[a-z0-9-]+)\]\]/g) ?? [])
    const links = model.notes!.rows.flatMap((row) => (row.cols.note as string).match(/\[\[[^\]]*\]\]/g) ?? [])
    expect(rawLinks.length).toBe(104)
    expect(links).toEqual(rawLinks.map((link) => link.replace('rc://es-419/ta/man/', 'ta:')))
    expect(model.notes!.rows.some((row) => (row.cols.note as string).includes('[[rc://'))).toBe(false)
  })

  test('no note, question or response keeps a literal \\n or <br>', async () => {
    const { model } = await titus()
    for (const table of [model.notes!, model.questions!]) {
      for (const row of table.rows) {
        for (const name of LONG_TEXT_COLUMNS) {
          const value = row.cols[name]
          if (value === undefined) continue
          expect((value as string).includes('\\n')).toBe(false)
          expect((value as string).includes('<br>')).toBe(false)
        }
      }
    }
    // The questions have both a question and a response.
    expect(model.questions!.rows.every((row) => typeof row.cols.question === 'string' && typeof row.cols.response === 'string')).toBe(true)
  })

  test('a quote is the positions of its words in the original: the id of the layer is the word of the verse', async () => {
    const { src, model, orig, verseStart } = await titus()
    const rows = await collect(src.rows({ lang: 'es-419', book: 'tit' }))
    for (const [table, res, raw] of [[model.notes!, TN, rawQuotes(rows, TN)], [model.links!, TWL, rawQuotes(rows, TWL)]] as const) {
      expect(table.res).toBe(res)
      let pieces = 0
      for (const row of table.rows) {
        const tokens = raw[row.id] ?? []
        // The expected positions come from the raw layer alone: the first word of the verse, plus the word's number in it.
        const expected = tokens.map((t) => verseStart.get(verseId('tit', t.chapter, t.verse))! + t.id - 1)
        expect(row.quote).toEqual(expected)
        expected.forEach((position, k) => expect(orig.words[position].form).toBe(tokens[k].content))
        expect(row.quoteKinds).toBeUndefined()
        expect(row.quoteMissing).toBeUndefined()
        pieces += expected.length
      }
      // 528 pieces in the notes, 227 in the links.
      expect(pieces).toBe(table === model.notes ? 528 : 227)
    }
    // The first note with a quote: "κατὰ πίστιν" in 1:1 is the words 7 and 8.
    expect(model.notes!.rows.find((row) => row.id === 'rtc9')!.quote).toEqual([7, 8])
    expect(orig.words[7].form + ' ' + orig.words[8].form).toBe('κατὰ πίστιν')
  })

  test('the quote text of a row with several quotes ("a & b") has the pieces of all of them', async () => {
    const { model, orig } = await titus()
    const note = model.notes!.rows.find((row) => row.id === 'swi9')!
    expect(note.cols.quote).toBe('ἐφανέρωσεν & τὸν λόγον αὐτοῦ')
    expect(note.quote!.map((position) => orig.words[position].form)).toEqual(['ἐφανέρωσεν', 'τὸν', 'λόγον', 'αὐτοῦ'])
  })

  test('the book row of the build has no repeated id, no unreadable reference and no missing quote word', async () => {
    const { issues } = await titus()
    expect(issues.filter((line) => /is in the source twice|names no verse|not one range|is not in verse|resources of/.test(line))).toEqual([])
  })

  test('the issues of Titus are the links that the format does not rewrite: 9 relative links and the addresses outside links', async () => {
    const { issues } = await titus()
    expect(issues.every((line) => line.startsWith(`${TN} `) && line.includes('links in a form that is kept as it is'))).toBe(true)
    expect(issues.length).toBe(17)
    expect(issues.filter((line) => line.includes('](../')).length).toBe(5)
    expect(issues.filter((line) => line.includes(': rc://es-419/ta/man/')).length).toBe(12)
  })

  test('bookView(bookSegment(m)) is m, and so is the model read back from the file', async () => {
    const { model } = await titus()
    expect(bookView(bookSegment(model))).toEqual(model)
    const { bytes } = await writeSegment(bookSegment(model))
    const { seg, skipped } = await readSegment(bytes, { known: BOOK_TABLES })
    expect(skipped).toEqual([])
    expect(bookView(seg)).toEqual(model)
  })

  test('the header lists the tables as optional, and quotes only for the notes and the links', async () => {
    const { model } = await titus()
    const seg = bookSegment(model)
    expect(seg.h.tables).toEqual({
      strings: [1, true],
      texts: [1, true],
      align: [1, false],
      notes: [1, false],
      questions: [1, false],
      links: [1, false],
      quotes: [1, false],
    })
    expect(Object.keys(seg.t).sort()).toEqual(['align', 'links', 'notes', 'questions', 'quotes', 'strings', 'texts'])
    const quotes = seg.t.quotes as Record<string, any>
    expect(Object.keys(quotes).sort()).toEqual(['links', 'notes'])
    // Nothing is missing or not a word in Titus: no kinds, no missing.
    expect(Object.keys(quotes.notes).sort()).toEqual(['n', 'pos'])
    expect(Object.keys(quotes.links).sort()).toEqual(['n', 'pos'])
    const n = decodeUvarints(quotes.notes.n)
    expect(n.length).toBe(216)
    expect(n.reduce((a, b) => a + b, 0)).toBe(528)
    expect(decodeDeltas(quotes.notes.pos).length).toBe(528)
  })

  test('the tables follow book.cddl: ascii4 ids, ranges, the concept column, and the columns by name', async () => {
    const { model } = await titus()
    const t = bookSegment(model).t as Record<string, any>
    for (const [name, rows] of [['notes', 216], ['questions', 36], ['links', 223]] as const) {
      expect(t[name].n).toBe(rows)
      expect(t[name].id.ascii4.length).toBe(4 * rows)
      expect(decodeUvarints(t[name].ref.span).every((span: number) => span === 0)).toBe(true)
      expect(t[name].refText).toBeUndefined()
    }
    expect(Object.keys(t.notes.cols).sort()).toEqual(['isIntro', 'note', 'occurrence', 'quote', 'tags'])
    expect(Object.keys(t.questions.cols).sort()).toEqual(['occurrence', 'question', 'quote', 'response', 'tags'])
    expect(Object.keys(t.links.cols).sort()).toEqual(['articlePath', 'occurrence', 'origWords', 'tags'])
    // Long text is texts, a boolean is flags, the rest strings.
    expect(Object.keys(t.notes.cols.note)).toEqual(['texts'])
    expect(decodeTexts(t.notes.cols.note.texts).length).toBe(216)
    expect(Object.keys(t.notes.cols.isIntro)).toEqual(['flags'])
    expect(decodeBits(t.notes.cols.isIntro.flags, 216).filter(Boolean).length).toBe(model.notes!.rows.filter((row) => row.cols.isIntro).length)
    expect(Object.keys(t.notes.cols.tags)).toEqual(['strings'])
    // 104 notes have no SupportReference: the concept column has `has`, and lists the other 112.
    expect(decodeBits(t.notes.concept.has, 216).filter(Boolean).length).toBe(112)
    expect(decodeUvarints(t.notes.concept.strings).length).toBe(112)
    // Every link has a concept: no `has`.
    expect(t.links.concept.has).toBeUndefined()
    expect(decodeUvarints(t.links.concept.strings).length).toBe(223)
  })

  test('the string table is ordered by count, then by code point, and holds the short values of the helps', async () => {
    const { model } = await titus()
    const strings = bookSegment(model).t.strings as string[]
    const counts = new Map<string, number>()
    for (const use of usesOf(model)) counts.set(use, (counts.get(use) ?? 0) + 1)
    expect(strings.length).toBe(counts.size)
    expect(new Set(strings).size).toBe(strings.length)
    for (let i = 1; i < strings.length; i++) {
      const [a, b] = [counts.get(strings[i - 1])!, counts.get(strings[i])!]
      expect(a > b || (a === b && compareCodePoints(strings[i - 1], strings[i]) < 0)).toBe(true)
    }
    // The concepts and the tags are in it; the long text is not.
    for (const value of ['ta:translate/figs-metaphor', 'tw:kt/god', 'keyterm', 'name', 'bible/kt/god']) expect(strings).toContain(value)
    expect(strings.some((value) => value.startsWith('# Introducción a Tito'))).toBe(false)
  })

  test('the same model gives the same segment, and extracting twice gives the same model', async () => {
    const { src, orig, model } = await titus()
    const again = await extractBook(src, 'es-419', 'tit', orig)
    expect(again).toEqual(model)
    const [a, b] = [await writeSegment(bookSegment(model)), await writeSegment(bookSegment(again))]
    expect(b.id).toBe(a.id)
    expect(b.bytes).toEqual(a.bytes)
  })

  test(`the whole book segment of Titus (GLT, GST, tN, tQ, tWL) is at most ${SEGMENT_LIMIT} bytes`, async () => {
    const { model } = await titus()
    const { bytes } = await writeSegment(bookSegment(model))
    // Phase 0 measured 35.4 KB for the book with zlib.
    console.log(`book segment of es-419 Titus: ${bytes.length} bytes (${(bytes.length / 1024).toFixed(1)} KB)`)
    expect(bytes.length).toBeLessThanOrEqual(SEGMENT_LIMIT)
  })

  test('a reader that does not know quotes, or the notes, drops what depends on them instead of half reading it', async () => {
    const { model } = await titus()
    const { bytes } = await writeSegment(bookSegment(model))

    const noQuotes = { ...BOOK_TABLES }
    delete noQuotes.quotes
    const withoutQuotes = bookView((await readSegment(bytes, { known: noQuotes })).seg)
    expect(withoutQuotes.notes!.rows.length).toBe(216)
    expect(withoutQuotes.notes!.rows.every((row) => row.quote === undefined)).toBe(true)
    expect(withoutQuotes.links!.rows.every((row) => row.quote === undefined)).toBe(true)

    const noNotes = { ...BOOK_TABLES }
    delete noNotes.notes
    const withoutNotes = bookView((await readSegment(bytes, { known: noNotes })).seg)
    expect(withoutNotes.notes).toBeUndefined()
    expect(withoutNotes.links!.rows.every((row) => row.quote !== undefined)).toBe(true)
    expect(withoutNotes.links).toEqual(model.links)
    expect(withoutNotes.questions).toEqual(model.questions)
  })
})

describe('a book with notes and no text (Review Focus 4)', () => {
  /** The sample's source without its bridge texts: a language that has the notes of a book and no text of it. */
  const withoutTexts = async (): Promise<RowSource> => {
    const src = await source()
    return {
      rows: (filter) => src.rows(filter),
      resources: async (lang) => (await src.resources(lang)).filter((resource) => resource.kind !== 'Aligned Bible'),
    }
  }

  test('extractBook gives texts: [] and the helps, and the resources of the helps only', async () => {
    const { orig } = await titus()
    const model = await extractBook(await withoutTexts(), 'es-419', 'tit', orig)
    expect(model.texts).toEqual([])
    expect(model.res.map(([key]) => key)).toEqual([TN, TQ, TWL])
    expect(model.notes!.rows.length).toBe(216)
  })

  test('it builds, with texts as a required empty table and no align, and reads back with its quotes', async () => {
    const { orig, model: full } = await titus()
    const model = await extractBook(await withoutTexts(), 'es-419', 'tit', orig)
    const seg = bookSegment(model)
    expect(seg.t.texts).toEqual([])
    expect(seg.h.tables.texts).toEqual([1, true])
    expect(seg.t.align).toBeUndefined()
    expect('align' in seg.h.tables).toBe(false)
    const { bytes } = await writeSegment(seg)
    const view = bookView((await readSegment(bytes, { known: BOOK_TABLES })).seg)
    expect(view).toEqual(model)
    expect(view.texts).toEqual([])
    // The quotes are the ones of the full book: the same positions.
    expect(view.notes!.rows.map((row) => row.quote)).toEqual(full.notes!.rows.map((row) => row.quote))
    expect(view.notes!.rows.filter((row) => row.quote!.length > 0).length).toBe(203)
    expect(view.links!.rows.filter((row) => row.quote!.length > 0).length).toBe(223)
  })

  test('a model built by hand with notes and texts: [] also round trips', async () => {
    const m: BookModel = {
      lang: 'es-419',
      book: 'tit',
      orig: [UGNT, 'g987ab2025a'],
      res: [[TN, 'v66']],
      texts: [],
      notes: { res: TN, rows: [{ id: 'a1b2', ref: '1:1', from: V1, to: V1, cols: { note: 'x' }, quote: [0, 2] }] },
    }
    const { bytes } = await writeSegment(bookSegment(m))
    expect(bookView((await readSegment(bytes, { known: BOOK_TABLES })).seg)).toEqual(m)
  })
})

describe('extractBook', () => {
  const resource = (key: string, kind: string, stamp = 'v1#2024-01-01T00_00_00Z', books = ['tit']): ResourceRef => ({ key, kind, stamp, books })
  /** A source with these resources and rows, whatever the filter. */
  const fake = (resources: ResourceRef[], rows: Row[] = []): RowSource => ({
    async *rows(filter) {
      for (const row of rows) if (filter.resource === undefined || row.key.includes(filter.resource)) yield row
    },
    resources: async () => resources,
  })

  test('two resources of the same helps: the first by key is used, and a line says so', async () => {
    const issues: string[] = []
    const rows = [tnChunk(1, [noteRow('a1b2', '1:1')])]
    const src = fake([resource('z/es-419/tn', 'TSV Translation Notes'), resource(TN, 'TSV Translation Notes', 'v66#x')], rows)
    const model = await extractBook(src, 'es-419', 'tit', mini(), issues)
    expect(model.notes!.res).toBe(TN)
    expect(model.res).toEqual([[TN, 'v66']])
    expect(issues).toEqual([`2 resources of TSV Translation Notes have the book tit (${TN}, z/es-419/tn); ${TN} is used`])
  })

  test('a resource that does not have the book is not used', async () => {
    const src = fake([resource(TN, 'TSV Translation Notes', 'v1#x', ['rut']), resource(TQ, 'TSV Translation Questions')], [sotRow('tq', TQ, 1, { content: { questions: [{ id: 'q1q1', reference: '1:1', question: 'Q?', response: 'R.' }] } })])
    const model = await extractBook(src, 'es-419', 'tit', mini())
    expect(model.notes).toBeUndefined()
    expect(model.questions!.rows.length).toBe(1)
    expect(model.res).toEqual([[TQ, 'v1']])
  })

  test('res is in the order of the keys, compared by code point, and the release tag is the stamp before the #', async () => {
    const src = fake(
      [resource('b/es-419/tq', 'TSV Translation Questions', 'v9#2'), resource('a/es-419/tn', 'TSV Translation Notes', 'v8')],
      [
        sotRow('tq', 'b/es-419/tq', 1, { content: { questions: [{ id: 'q1q1', reference: '1:1', question: 'Q?', response: 'R.' }] } }),
        sotRow('tn', 'a/es-419/tn', 1, { content: { notes: [noteRow('a1b2', '1:1')] } }),
      ],
    )
    const model = await extractBook(src, 'es-419', 'tit', mini())
    expect(model.res).toEqual([['a/es-419/tn', 'v8'], ['b/es-419/tq', 'v9']])
  })

  test('a source with nothing of the book throws', async () => {
    await expect(extractBook(fake([resource(TN, 'TSV Translation Notes', 'v1', ['rut'])]), 'es-419', 'tit', mini())).rejects.toThrow()
  })
})

describe('extractHelps: ids', () => {
  test('a repeated id keeps the first as it is and gets ~2, ~3 in the order of the file, with a line each', () => {
    const issues: string[] = []
    const table = notesOf([tnChunk(1, [noteRow('abcd', '1:1'), noteRow('zzzz', '1:1'), noteRow('abcd', '1:2'), noteRow('abcd', '1:3')])], issues)
    expect(table.rows.map((row) => row.id)).toEqual(['abcd', 'zzzz', 'abcd~2', 'abcd~3'])
    expect(issues.length).toBe(2)
    expect(issues[0]).toContain('"abcd" is in the source twice')
    expect(issues[0]).toContain('"abcd~2"')
    expect(issues[1]).toContain('"abcd~3"')
  })

  test('the quote layer is read by the id as published: the rows of a repeated id look up the same entry', () => {
    const table = notesOf([tnChunk(1, [noteRow('abcd', '1:1', { quote: 'β' }), noteRow('abcd', '1:1', { quote: 'β' })]), quoteLayer(1, { abcd: [token('β', 1)] })])
    expect(table.rows.map((row) => row.quote)).toEqual([[1], [1]])
  })

  test('a published id that is already taken by a renamed one is renamed too', () => {
    const table = notesOf([tnChunk(1, [noteRow('abcd', '1:1'), noteRow('abcd', '1:1'), noteRow('abcd~2', '1:1')])])
    expect(table.rows.map((row) => row.id)).toEqual(['abcd', 'abcd~2', 'abcd~2~2'])
    expect(new Set(table.rows.map((row) => row.id)).size).toBe(3)
  })

  test('a row without an id is an error, not a dropped row', () => {
    expect(() => notesOf([tnChunk(1, [noteRow('', '1:1')])])).toThrow()
    expect(() => notesOf([tnChunk(1, [{ ...noteRow('a1b2', '1:1'), id: 7 }])])).toThrow()
  })
})

describe('extractHelps: references', () => {
  const ref = (reference: string, issues: string[] = []) => {
    const [row] = notesOf([tnChunk(1, [noteRow('a1b2', reference)])], issues).rows
    return row
  }

  test('a verse, a range of verses, a range across chapters and the introductions', () => {
    expect(ref('1:1')).toMatchObject({ ref: '1:1', from: 56_001_001, to: 56_001_001 })
    expect(ref('1:2-4')).toMatchObject({ ref: '1:2-4', from: 56_001_002, to: 56_001_004 })
    expect(ref('1:12-2:3')).toMatchObject({ from: 56_001_012, to: 56_002_003 })
    expect(ref('2:intro')).toMatchObject({ from: 56_002_000, to: 56_002_000 })
    expect(ref('front:intro')).toMatchObject({ from: 56_000_000, to: 56_000_000 })
  })

  // Real data: the TWL and the TN of Psalms (en) have 78 rows with a reference like "3:front", the title of the psalm.
  test('C:front is the introduction of chapter C (the title of a psalm), keeps its text and adds a line', () => {
    const issues: string[] = []
    expect(ref('3:front', issues)).toMatchObject({ ref: '3:front', from: 56_003_000, to: 56_003_000 })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('"3:front"')
    expect(issues[0]).toContain('introduction of chapter 3')
    // Not a chapter: front alone, 0:front and front:front still name no verse and go to the book introduction.
    for (const text of ['front', '0:front', 'front:front', '3:fronts']) expect(ref(text)).toMatchObject({ from: 56_000_000, to: 56_000_000 })
  })

  test('a list (1:1,3) covers the lowest to the highest verse it names, keeps its text and adds a line', () => {
    const issues: string[] = []
    expect(ref('1:1,3', issues)).toMatchObject({ ref: '1:1,3', from: 56_001_001, to: 56_001_003 })
    expect(issues.length).toBe(1)
    expect(issues[0]).toContain('"1:1,3"')
    expect(issues[0]).toContain('1:1-3')
    expect(ref('5:1,3,8,12')).toMatchObject({ from: 56_005_001, to: 56_005_012 })
    expect(ref('1:5-7,2:1')).toMatchObject({ from: 56_001_005, to: 56_002_001 })
    // a part that cannot be read is skipped
    expect(ref('1:4,x,1:2')).toMatchObject({ from: 56_001_002, to: 56_001_004 })
  })

  test('leading zeros and spaces are read; the text stays as published, with a line', () => {
    const issues: string[] = []
    expect(ref('01:02', issues)).toMatchObject({ ref: '01:02', from: 56_001_002, to: 56_001_002 })
    expect(ref(' 1:2 - 4 ', issues)).toMatchObject({ ref: ' 1:2 - 4 ', from: 56_001_002, to: 56_001_004 })
    expect(issues.length).toBe(2)
  })

  test('a reference that names no verse puts the row at the book introduction, and keeps its text', () => {
    const issues: string[] = []
    for (const text of ['hello', '', '0:0', '1:1000']) {
      expect(ref(text, issues)).toMatchObject({ ref: text, from: 56_000_000, to: 56_000_000 })
    }
    expect(issues.length).toBe(4)
    expect(issues[0]).toContain('book introduction')
  })

  test('a row with no reference field at all is kept at the book introduction', () => {
    const issues: string[] = []
    const [row] = notesOf([tnChunk(1, [{ id: 'a1b2', note: 'x' }])], issues).rows
    expect(row).toMatchObject({ ref: '', from: 56_000_000, to: 56_000_000 })
    expect(issues.length).toBe(1)
  })

  test('the reference text is kept in the segment only when it is not the canonical one of its range', () => {
    const table = notesOf([
      tnChunk(1, [noteRow('aaaa', '1:1'), noteRow('bbbb', '1:1,3'), noteRow('cccc', '01:02'), noteRow('dddd', '1:2-2'), noteRow('eeee', 'hello'), noteRow('ffff', '2:1-2:3'), noteRow('gggg', '1:2-4')]),
    ])
    const m: BookModel = { lang: 'es-419', book: 'tit', orig: [UGNT, 'g'], res: [[TN, 'v1']], texts: [], notes: table }
    const t = bookSegment(m).t as Record<string, any>
    // rows 1 (list), 2 (zeros), 3 (1:2-2), 4 (nothing readable) and 5 (2:1-2:3): not 1:1 or 1:2-4
    expect(t.notes.refText).toEqual([[1, '1:1,3'], [2, '01:02'], [3, '1:2-2'], [4, 'hello'], [5, '2:1-2:3']])
    expect(bookView(bookSegment(m))).toEqual(m)
  })

  test('the ranges are the first verses as deltas and the spans', () => {
    const table = notesOf([tnChunk(1, [noteRow('aaaa', '1:2-4'), noteRow('bbbb', '1:1'), noteRow('cccc', '2:1-2:3')])])
    const m: BookModel = { lang: 'es-419', book: 'tit', orig: [UGNT, 'g'], res: [[TN, 'v1']], texts: [], notes: table }
    const t = bookSegment(m).t as Record<string, any>
    expect(decodeDeltas(t.notes.ref.from)).toEqual([56_001_002, 56_001_001, 56_002_001])
    expect(decodeUvarints(t.notes.ref.span)).toEqual([2, 0, 2])
  })
})

describe('extractHelps: concepts and columns', () => {
  test('a SupportReference in the short form stays in cols, with no concept and a line; an empty one is left out', () => {
    const issues: string[] = []
    const table = notesOf(
      [
        tnChunk(1, [
          noteRow('aaaa', '1:1', { supportReference: 'rc://*/ta/man/translate/figs-metaphor' }),
          noteRow('bbbb', '1:1', { supportReference: 'translate/figs-metaphor' }),
          noteRow('cccc', '1:1', { supportReference: '' }),
          noteRow('dddd', '1:1', { supportReference: 'rc://es-419/ta/man/translate/figs-metonymy' }),
          noteRow('eeee', '1:1', { supportReference: 'rc://*/ta/man/translate' }),
        ]),
      ],
      issues,
    )
    const [a, b, c, d, e] = table.rows
    expect(a.concept).toBe('ta:translate/figs-metaphor')
    expect('supportReference' in a.cols).toBe(false)
    expect(b.concept).toBeUndefined()
    expect(b.cols.supportReference).toBe('translate/figs-metaphor')
    expect(c.concept).toBeUndefined()
    expect('supportReference' in c.cols).toBe(false)
    // the language of the note in place of the *: the same address
    expect(d.concept).toBe('ta:translate/figs-metonymy')
    expect(e.concept).toBeUndefined()
    expect(e.cols.supportReference).toBe('rc://*/ta/man/translate')
    expect(issues.length).toBe(2)
    expect(issues[0]).toContain('translate/figs-metaphor')
  })

  const twl = (links: unknown[]) => extractHelps([sotRow('twl', TWL, undefined, { links })], 'tit', TWL, 'links', new OrigIndex(mini()))
  const link = (id: string, twLink: string) => ({ articlePath: 'bible/kt/grace', id, occurrence: '1', origWords: 'α', reference: '1:1', tags: '', twLink })

  test('a TWLink that does not have the form keeps twLink in cols and has no concept', () => {
    const issues: string[] = []
    const table = extractHelps(
      [sotRow('twl', TWL, undefined, { links: [link('aaaa', 'rc://*/tw/dict/bible/kt/grace'), link('bbbb', 'kt/grace'), link('cccc', 'rc://*/tw/dict/bible/other2/grace'), link('dddd', '')] })],
      'tit',
      TWL,
      'links',
      new OrigIndex(mini()),
      issues,
    )
    expect(table.rows.map((row) => row.concept)).toEqual(['tw:kt/grace', undefined, undefined, undefined])
    expect(table.rows.map((row) => row.cols.twLink)).toEqual([undefined, 'kt/grace', 'rc://*/tw/dict/bible/other2/grace', undefined])
    expect(issues.length).toBe(2)
  })

  test('the links come from the book row; the questions have no concept and keep every field', () => {
    expect(twl([link('aaaa', 'rc://*/tw/dict/bible/kt/grace')]).rows.length).toBe(1)
    const [row] = extractHelps(
      [sotRow('tq', TQ, 1, { content: { questions: [{ id: 'q1q1', reference: '1:1', question: 'Q?\\nQ2', response: 'R<br>R2', quote: '', occurrence: '', tags: '', supportReference: 'rc://*/ta/man/translate/figs-metaphor' }] } })],
      'tit',
      TQ,
      'questions',
      new OrigIndex(mini()),
    ).rows
    expect(row.concept).toBeUndefined()
    expect(row.cols).toEqual({ question: 'Q?\nQ2', response: 'R\nR2', quote: '', occurrence: '', tags: '', supportReference: 'rc://*/ta/man/translate/figs-metaphor' })
  })

  test('the text of a note: the escapes undone and the four forms of link rewritten, the other text and links as they are', () => {
    const note =
      'A\\nB<br>C [[rc://*/ta/man/translate/figs-metaphor]] [[rc://es-419/tw/dict/bible/kt/grace]] [t](rc://*/tn/help/tit/02/03) [u](../02/04.md) [v](https://example.com/a)'
    const [row] = notesOf([tnChunk(1, [noteRow('a1b2', '1:1', { note })])]).rows
    expect(row.cols.note).toBe('A\nB\nC [[ta:translate/figs-metaphor]] [[tw:kt/grace]] [t](ref:tit 2:3) [u](ref:tit 2:4) [v](https://example.com/a)')
    // `quote` is not text of the note: no escapes, no links.
    const [other] = notesOf([tnChunk(1, [noteRow('a1b2', '1:1', { quote: 'a\\nb' })])]).rows
    expect(other.cols.quote).toBe('a\\nb')
  })

  test('links in a form the format does not rewrite stay as they are and each note with one has a line', () => {
    const issues: string[] = []
    const text = 'x [Tito 2:11](../02/11/gp2z) y (ver: rc://es-419/ta/man/translate/figs-ellipsis) z [w](https://example.com)'
    const [row] = notesOf([tnChunk(1, [noteRow('a1b2', '1:1', { note: text }), noteRow('c3d4', '1:1', { note: 'plain' })])], issues).rows
    expect(row.cols.note).toBe(text)
    expect(issues.length).toBe(1)
    expect(issues[0]).toContain('a1b2')
    expect(issues[0]).toContain('[Tito 2:11](../02/11/gp2z)')
    expect(issues[0]).toContain('rc://es-419/ta/man/translate/figs-ellipsis')
    expect(issues[0]).not.toContain('example.com')
  })

  test('a field that is true or false stays as a boolean; a field some rows lack is only in the rows that have it', () => {
    const table = notesOf([tnChunk(1, [noteRow('aaaa', '1:1', { isIntro: true }), { id: 'bbbb', reference: '1:1', note: 'x' }, noteRow('cccc', '1:1', { extra: 'e' })])])
    expect(table.rows[0].cols.isIntro).toBe(true)
    expect('isIntro' in table.rows[1].cols).toBe(false)
    expect(table.rows.map((row) => row.cols.extra)).toEqual([undefined, undefined, 'e'])
    const m: BookModel = { lang: 'es-419', book: 'tit', orig: [UGNT, 'g'], res: [[TN, 'v1']], texts: [], notes: table }
    const t = bookSegment(m).t as Record<string, any>
    expect(decodeBits(t.notes.cols.extra.has, 3)).toEqual([false, false, true])
    expect(decodeBits(t.notes.cols.isIntro.has, 3)).toEqual([true, false, true])
    expect(bookView(bookSegment(m))).toEqual(m)
  })

  test('a field named __proto__ is a column like the others', () => {
    const row = JSON.parse('{"id":"a1b2","reference":"1:1","__proto__":"x"}')
    const table = notesOf([tnChunk(1, [row])])
    expect(Object.keys(table.rows[0].cols)).toEqual(['__proto__'])
    const m: BookModel = { lang: 'es-419', book: 'tit', orig: [UGNT, 'g'], res: [[TN, 'v1']], texts: [], notes: table }
    expect(Object.keys(bookView(bookSegment(m)).notes!.rows[0].cols)).toEqual(['__proto__'])
  })

  test('a field that is not text or true and false is an error', () => {
    for (const bad of [7, [], {}]) expect(() => notesOf([tnChunk(1, [noteRow('a1b2', '1:1', { extra: bad })])])).toThrow()
  })

  test('ids with a repeat (~2) are not 4 characters: the ids go in the string table', () => {
    const table = notesOf([tnChunk(1, [noteRow('abcd', '1:1'), noteRow('abcd', '1:1')])])
    const m: BookModel = { lang: 'es-419', book: 'tit', orig: [UGNT, 'g'], res: [[TN, 'v1']], texts: [], notes: table }
    const t = bookSegment(m).t as Record<string, any>
    expect(t.notes.id.ascii4).toBeUndefined()
    expect(decodeUvarints(t.notes.id.strings).map((n) => (t.strings as string[])[n])).toEqual(['abcd', 'abcd~2'])
    expect(bookView(bookSegment(m))).toEqual(m)
  })
})

describe('extractHelps: rows of the source', () => {
  test('the chapters come in chapter order whatever the order of the rows', () => {
    const table = notesOf([tnChunk(3, [noteRow('ccc3', '3:1')]), tnChunk(1, [noteRow('aaa1', '1:1'), noteRow('bbb1', '1:2')]), tnChunk(2, [noteRow('ddd2', '2:1')])])
    expect(table.rows.map((row) => row.id)).toEqual(['aaa1', 'bbb1', 'ddd2', 'ccc3'])
  })

  test('the book row of a chunked resource (an empty list) is not a chunk; a resource with no chunk is read from its book row', () => {
    const book = sotRow('tn', TN, undefined, { _chunkedBook: true, content: {}, notes: [] })
    expect(notesOf([book, tnChunk(1, [noteRow('aaa1', '1:1')])]).rows.length).toBe(1)
    const whole = sotRow('tn', TN, undefined, { notes: [noteRow('aaa1', '1:1'), noteRow('bbb1', '1:2')] })
    expect(notesOf([whole]).rows.map((row) => row.id)).toEqual(['aaa1', 'bbb1'])
  })

  test('rows of other resources, books and layers are ignored', () => {
    const other: Row[] = [
      sotRow('tn', 'x/es-419/tn', 1, { content: { notes: [noteRow('zzzz', '1:1')] } }),
      { layer: 'sot', key: `tn:${TN}:rut:1`, value: { content: { notes: [noteRow('zzzz', '1:1')] } } },
      { layer: 'prepared', key: `prepared:notes:${TN}:tit:1:full`, value: { content: { notes: [noteRow('zzzz', '1:1')] } } },
    ]
    expect(notesOf([...other, tnChunk(1, [noteRow('aaa1', '1:1')])]).rows.map((row) => row.id)).toEqual(['aaa1'])
  })

  test('no row of the resource, a chapter twice, and a chunk without a list are errors', () => {
    expect(() => notesOf([])).toThrow()
    expect(() => notesOf([tnChunk(1, []), tnChunk(1, [])])).toThrow()
    expect(() => notesOf([sotRow('tn', TN, 1, { content: {} })])).toThrow()
    expect(() => notesOf([tnChunk(1, ['x'])])).toThrow()
  })

  test('a resource with no rows is an empty table, which builds and reads back', () => {
    const table = notesOf([tnChunk(1, [])])
    expect(table).toEqual({ res: TN, rows: [] })
    const m: BookModel = { lang: 'es-419', book: 'tit', orig: [UGNT, 'g'], res: [[TN, 'v1']], texts: [], notes: table }
    expect(bookView(bookSegment(m))).toEqual(m)
  })
})

describe('extractHelps: quotes', () => {
  // The original: verse 1 = α β α (positions 0 1 2), verse 2 = γ δ (3 4).
  test('each word of the layer is the position of find(verse, word, occurrence)', () => {
    const table = notesOf([
      tnChunk(1, [noteRow('aaaa', '1:1', { quote: 'β α' }), noteRow('bbbb', '1:1-2', { quote: 'α & γ' })]),
      quoteLayer(1, { aaaa: [token('β', 1), token('α', 1, 2)], bbbb: [token('α', 1, 1), token('γ', 2)] }),
    ])
    expect(table.rows.map((row) => row.quote)).toEqual([[1, 2], [0, 3]])
    expect(table.rows.map((row) => [row.quoteKinds, row.quoteMissing])).toEqual([[undefined, undefined], [undefined, undefined]])
  })

  test('a piece without chapter and verse is looked up in the first verse of the row', () => {
    const plain = { content: 'δ', text: 'δ', type: 'word', occurrence: 1, id: 2 }
    const table = notesOf([tnChunk(1, [noteRow('aaaa', '1:2')]), quoteLayer(1, { aaaa: [plain] })])
    expect(table.rows[0].quote).toEqual([4])
  })

  test('a word the original does not have is -1, listed in quoteMissing as [piece, verse, word, occurrence], with a line', () => {
    const issues: string[] = []
    const table = notesOf(
      [
        tnChunk(1, [noteRow('aaaa', '1:1', { quote: 'β x α' })]),
        // x is not in verse 1, the third α is not either, and δ is in verse 2: not in 1.
        quoteLayer(1, { aaaa: [token('β', 1), token('x', 1), token('α', 1, 3), token('δ', 1), token('α', 1, 2)] }),
      ],
      issues,
    )
    const [row] = table.rows
    expect(row.quote).toEqual([1, -1, -1, -1, 2])
    expect(row.quoteMissing).toEqual([[1, V1, 'x', 1], [2, V1, 'α', 3], [3, V1, 'δ', 1]])
    expect(row.quoteKinds).toBeUndefined()
    expect(issues.length).toBe(3)
    expect(issues[0]).toContain('"x"')
  })

  // Real data: the quote layer of Psalms (en) says verse 1 for the words of a psalm title, which the original writes before \v 1 (verse 0),
  // and counts the occurrences over the title and the verse together ("id" 5 of 3:1 is the fifth word of the title).
  test('verse 1 of a chapter whose original has an introduction: the words of the introduction come first, with the occurrences counted over both', () => {
    // Chapter 1: introduction τ σ (positions 0 1), verse 1 α τ β (2 3 4), verse 2 γ τ (5 6).
    const titled: OrigModel = {
      book: 'tit',
      key: UGNT,
      stamp: 'g987ab2025a',
      words: ['τ', 'σ', 'α', 'τ', 'β', 'γ', 'τ'].map((form) => ({ form, lemma: '', strong: '', morph: '' })),
      pieces: ['τ', ' ', 'σ', ' ', 'α', ' ', 'τ', ' ', 'β', ' ', 'γ', ' ', 'τ'].map((s): [string, boolean] => [s, s !== ' ']),
      events: [[0, 'chapter', '1'], [4, 'verse', '1'], [10, 'verse', '2']],
    }
    const issues: string[] = []
    const table = notesOf(
      [
        tnChunk(1, [noteRow('aaaa', '1:1'), noteRow('bbbb', '1:2')]),
        quoteLayer(1, {
          // σ is in the title; the first τ of 1:1 is the title's, the second is the verse's own; α is the verse's; a third τ is nowhere in 1:1.
          aaaa: [token('σ', 1), token('τ', 1, 1), token('τ', 1, 2), token('α', 1), token('τ', 1, 3)],
          // Verse 2 does not look in the introduction.
          bbbb: [token('τ', 2), token('σ', 2)],
        }),
      ],
      issues,
      titled,
    )
    expect(table.rows.map((row) => row.quote)).toEqual([[1, 0, 3, 2, -1], [6, -1]])
    expect(table.rows[0].quoteMissing).toEqual([[4, TIT + 1001, 'τ', 3]])
    expect(table.rows[1].quoteMissing).toEqual([[1, TIT + 1002, 'σ', 1]])
    expect(issues).toHaveLength(2)
  })

  test('a chapter with no introduction is looked up in the verse alone', () => {
    // mini() has no words before verse 1: τ is not in verse 1, whatever the introduction of other chapters holds.
    const table = notesOf([tnChunk(1, [noteRow('aaaa', '1:1')]), quoteLayer(1, { aaaa: [token('α', 1, 2), token('γ', 1)] })])
    expect(table.rows[0].quote).toEqual([2, -1])
  })

  test('a piece that is not a word (an ellipsis) is -1, listed in quoteKinds as [piece, kind]', () => {
    const table = notesOf([
      tnChunk(1, [noteRow('aaaa', '1:1', { quote: 'α … β' })]),
      quoteLayer(1, {
        aaaa: [token('α', 1), { id: 0, text: '…', type: 'ellipsis', occurrence: 1, content: '…', chapter: 1, verse: 1 }, token('β', 1), token('…', 1), { type: 'gap', content: ' ' }],
      }),
    ])
    const [row] = table.rows
    expect(row.quote).toEqual([0, -1, 1, -1, -1])
    // a type that is not word is the kind as the layer names it; a word-typed ellipsis is an ellipsis
    expect(row.quoteKinds).toEqual([[1, 'ellipsis'], [3, 'ellipsis'], [4, 'gap']])
    expect(row.quoteMissing).toBeUndefined()
  })

  test('a ketiv is also looked up by its qere', () => {
    const table = notesOf([
      tnChunk(1, [noteRow('aaaa', '1:2')]),
      quoteLayer(1, { aaaa: [token('x', 2, 1, { qere: 'δ', qereOccurrence: 1 })] }),
    ])
    expect(table.rows[0].quote).toEqual([4])
  })

  test('no quote and quote not found both have an empty quote; the text of the quote tells them apart', () => {
    const table = notesOf([
      tnChunk(1, [noteRow('aaaa', '1:1', { quote: 'β' }), noteRow('bbbb', '1:1', { quote: '' }), noteRow('cccc', '1:1', { quote: 'Connecting Statement:' }), noteRow('dddd', '1:1', { quote: 'x' })]),
      // aaaa found, bbbb has no entry, cccc has an entry with no piece (the layer looked and found none), dddd has no entry
      quoteLayer(1, { aaaa: [token('β', 1)], cccc: [] }),
    ])
    expect(table.rows.map((row) => row.quote)).toEqual([[1], [], [], []])
    expect(table.rows.map((row) => row.cols.quote)).toEqual(['β', '', 'Connecting Statement:', 'x'])
  })

  test('when no row has a piece, no row has quote, and the segment has no quotes table', () => {
    const table = notesOf([tnChunk(1, [noteRow('aaaa', '1:1', { quote: 'x' })]), quoteLayer(1, { aaaa: [] })])
    expect(table.rows[0].quote).toBeUndefined()
    const m: BookModel = { lang: 'es-419', book: 'tit', orig: [UGNT, 'g'], res: [[TN, 'v1']], texts: [], notes: table }
    const seg = bookSegment(m)
    expect(seg.t.quotes).toBeUndefined()
    expect('quotes' in seg.h.tables).toBe(false)
    expect(bookView(seg)).toEqual(m)
  })

  test('the quote layer is read from the chapter chunks of the same resource and book, and the last row wins for an id it has twice', () => {
    const issues: string[] = []
    const rows = [
      tnChunk(1, [noteRow('aaaa', '1:1'), noteRow('bbbb', '1:2')]),
      quoteLayer(1, { aaaa: [token('α', 1)] }),
      quoteLayer(2, { bbbb: [token('γ', 2)] }),
      quoteLayer(1, { bbbb: [token('δ', 2)] }, 'x/es-419/tn'),
      { layer: 'quote', key: `helps-quote:${TN}@g1:${UGNT}@g2+3:rut:1`, value: { content: { aaaa: [token('β', 1)] } } } as Row,
    ]
    const table = notesOf(rows, issues)
    expect(table.rows.map((row) => row.quote)).toEqual([[0], [3]])
    expect(issues).toEqual([])
    const again = notesOf([...rows, quoteLayer(1, { aaaa: [token('β', 1)] })], issues)
    expect(again.rows[0].quote).toEqual([1])
    expect(issues.length).toBe(1)
  })

  test('the questions have no quote layer: quote is never set', () => {
    const rows: Row[] = [
      sotRow('tq', TQ, 1, { content: { questions: [{ id: 'q1q1', reference: '1:1', question: 'Q?', response: 'R.', quote: 'α', occurrence: '1' }] } }),
      quoteLayer(1, { q1q1: [token('α', 1)] }, TQ),
    ]
    const [row] = extractHelps(rows, 'tit', TQ, 'questions', new OrigIndex(mini())).rows
    expect(row.quote).toBeUndefined()
  })

  test('a quote of a multi-verse note: each piece is in its own verse', () => {
    const table = notesOf([
      tnChunk(1, [noteRow('aaaa', '1:1-2')]),
      quoteLayer(1, { aaaa: [token('α', 1, 2), token('γ', 2)] }),
    ])
    expect(table.rows[0].quote).toEqual([2, 3])
  })

  test('a quote entry that is not a list or a piece that is not an object is an error', () => {
    expect(() => notesOf([tnChunk(1, [noteRow('aaaa', '1:1')]), quoteLayer(1, { aaaa: 'x' as never })])).toThrow()
    expect(() => notesOf([tnChunk(1, [noteRow('aaaa', '1:1')]), quoteLayer(1, { aaaa: ['x'] })])).toThrow()
  })

  test('positions, kinds and missing words round trip through the segment and the file', async () => {
    const table = notesOf([
      tnChunk(1, [noteRow('aaaa', '1:1'), noteRow('bbbb', '1:1'), noteRow('cccc', '1:1')]),
      quoteLayer(1, {
        aaaa: [token('β', 1), { type: 'ellipsis', content: '…' }, token('x', 1), token('α', 1, 2)],
        cccc: [token('γ', 2)],
      }),
    ])
    expect(table.rows.map((row) => row.quote)).toEqual([[1, -1, -1, 2], [], [3]])
    const m: BookModel = { lang: 'es-419', book: 'tit', orig: [UGNT, 'g987ab2025a'], res: [[TN, 'v1']], texts: [], notes: table }
    const t = bookSegment(m).t as Record<string, any>
    expect(decodeUvarints(t.quotes.notes.n)).toEqual([4, 0, 1])
    // positions + 1 as deltas: 2, 0, 0, 3, then 4
    expect(decodeDeltas(t.quotes.notes.pos)).toEqual([2, 0, 0, 3, 4])
    expect(t.quotes.notes.kinds).toEqual([[0, 1, 'ellipsis']])
    expect(t.quotes.notes.missing).toEqual([[0, 2, V1, 'x', 1]])
    const { bytes } = await writeSegment(bookSegment(m))
    expect(bookView((await readSegment(bytes, { known: BOOK_TABLES })).seg)).toEqual(m)
  })
})

describe('bookSegment refuses a helps model the segment cannot hold', () => {
  const base = (): BookModel => ({
    lang: 'es-419',
    book: 'tit',
    orig: [UGNT, 'g987ab2025a'],
    res: [[TN, 'v66'], [TWL, 'v18']],
    texts: [],
    notes: {
      res: TN,
      rows: [
        { id: 'a1b2', ref: '1:1', from: V1, to: V1, concept: 'ta:translate/figs-metaphor', cols: { note: 'x', tags: '' }, quote: [0, -1, -1], quoteKinds: [[1, 'ellipsis']], quoteMissing: [[2, V1, 'x', 1]] },
        { id: 'c3d4', ref: '1:2-3', from: V2, to: V3, cols: { note: 'y' }, quote: [] },
      ],
    },
    links: { res: TWL, rows: [{ id: 'e5f6', ref: '1:1', from: V1, to: V1, concept: 'tw:kt/god', cols: { origWords: 'α' }, quote: [1] }] },
  })
  const rowOf = (m: BookModel, i = 0) => m.notes!.rows[i]
  const broken: [string, (m: BookModel) => void][] = [
    ['a table of a resource the header does not list', (m) => void (m.notes!.res = TQ)],
    ['a row without id', (m) => void (rowOf(m).id = '')],
    ['an id twice', (m) => void (rowOf(m, 1).id = 'a1b2')],
    ['a reference that is not text', (m) => void (rowOf(m).ref = 7 as never)],
    ['from after to', (m) => void (rowOf(m, 1).from = V3 + 1)],
    ['a negative verse id', (m) => void (rowOf(m).from = -1)],
    ['a verse id that is not an integer', (m) => void (rowOf(m).to = 0.5)],
    ['a verse id above 2^53 - 1', (m) => void (rowOf(m).to = 2 ** 53)],
    ['an empty concept', (m) => void (rowOf(m).concept = '')],
    ['a column of numbers', (m) => void (rowOf(m).cols.n = 7 as never)],
    ['a column of text and true and false', (m) => void (rowOf(m, 1).cols.tags = true)],
    ['a table with no cols', (m) => void delete (rowOf(m) as Partial<HelpRow>).cols],
    ['quote on some rows only', (m) => void delete rowOf(m, 1).quote],
    ['quote on every row but no piece anywhere', (m) => {
      rowOf(m).quote = []
      delete rowOf(m).quoteKinds
      delete rowOf(m).quoteMissing
    }],
    ['a piece that is not an integer', (m) => void (rowOf(m).quote![0] = 0.5)],
    ['a piece below -1', (m) => void (rowOf(m).quote![0] = -2)],
    ['a piece without a position that is in neither list', (m) => void delete rowOf(m).quoteMissing],
    ['a piece in kinds that has a position', (m) => void (rowOf(m).quoteKinds = [[0, 'ellipsis']])],
    ['a piece in kinds that the quote does not have', (m) => void (rowOf(m).quoteKinds = [[3, 'ellipsis']])],
    ['a piece in kinds and in missing', (m) => void (rowOf(m).quoteMissing = [[1, V1, 'x', 1], [2, V1, 'x', 1]])],
    ['a kind that is not text', (m) => void (rowOf(m).quoteKinds = [[1, 7 as never]])],
    ['an empty quoteKinds', (m) => void (rowOf(m).quoteKinds = [])],
    ['an empty quoteMissing', (m) => void (rowOf(m).quoteMissing = [])],
    ['a missing word that is not text', (m) => void (rowOf(m).quoteMissing = [[2, V1, 7 as never, 1]])],
    ['a missing verse below 0', (m) => void (rowOf(m).quoteMissing = [[2, -1, 'x', 1]])],
    ['a missing occurrence that is not an integer', (m) => void (rowOf(m).quoteMissing = [[2, V1, 'x', 1.5]])],
    ['kinds without quote', (m) => {
      for (const row of m.notes!.rows) {
        delete row.quote
        delete row.quoteMissing
      }
    }],
  ]
  for (const [name, change] of broken) {
    test(name, () => {
      const m = base()
      change(m)
      expect(() => bookSegment(m)).toThrow()
    })
  }

  test('questions with quote positions', () => {
    const m = base()
    m.res.push([TQ, 'v38'])
    m.questions = { res: TQ, rows: [{ id: 'q1q1', ref: '1:1', from: V1, to: V1, cols: { question: 'Q?' }, quote: [] }] }
    expect(() => bookSegment(m)).toThrow()
    delete m.questions.rows[0].quote
    expect(bookView(bookSegment(m)).questions).toEqual(m.questions)
  })

  test('the base model itself is fine, and has the tables it should', () => {
    const m = base()
    const seg = bookSegment(m)
    expect(Object.keys(seg.h.tables).sort()).toEqual(['links', 'notes', 'quotes', 'strings', 'texts'])
    expect(bookView(seg)).toEqual(m)
  })

  test('a row whose range has no canonical text (another book) keeps its text and reads back', () => {
    const m = base()
    rowOf(m).from = 55_001_001
    rowOf(m).to = 55_001_001
    rowOf(m).ref = 'x'
    expect(bookView(bookSegment(m)).notes!.rows[0].ref).toBe('x')
  })

  test('the quote kinds and missing words are written in the order of their rows and pieces', () => {
    const m = base()
    rowOf(m).quote = [-1, -1, -1, -1]
    rowOf(m).quoteKinds = [[3, 'b'], [0, 'a']]
    rowOf(m).quoteMissing = [[2, V1, 'x', 1], [1, V1, 'y', 1]]
    const t = bookSegment(m).t as Record<string, any>
    expect(t.quotes.notes.kinds).toEqual([[0, 0, 'a'], [0, 3, 'b']])
    expect(t.quotes.notes.missing.map((item: unknown[]) => item[1])).toEqual([1, 2])
  })

  test('a lone surrogate in a short value is not valid UTF-8, so the file is not written', async () => {
    const m = base()
    rowOf(m).cols.tags = '\ud800'
    await expect(writeSegment(bookSegment(m))).rejects.toThrow()
  })
})
