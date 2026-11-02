import { describe, expect, test } from 'bun:test'
import { decodeUvarints } from '../codec/columns'
import { MAX_DEPTH } from '../codec/cbor'
import { readSegment, type Segment, writeSegment } from '../codec/container'
import { FormatError } from '../codec/errors'
import type { OrigModel } from '../model'
import { partsSource } from '../node/partsSource'
import { origView } from '../read/orig'
import type { ResourceRef, Row, RowSource } from '../source/rows'
import { extractOrig, OrigIndex, origSegment } from './orig'

// The data is a sample of real files (spec/tests/data/README.md): the UGNT Titus part is the original.
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const UHB = 'unfoldingWord/hbo/uhb'
const MACULA = 'Biblica/el-x-koine/macula'
const KNOWN = { words: [1], text: [1], macula: [1] }
/** U+2060, which `find` takes out of a text. Built from its code point so that an editor cannot strip it. */
const WORD_JOINER = String.fromCodePoint(0x2060)

const realSource = () => partsSource({ list: join(DATA, 'originals', 'list.json'), partsDir: join(DATA, 'parts') })

let cached: Promise<OrigModel> | undefined
/** UGNT Titus. Tests only read it. */
const titus = () => (cached ??= realSource().then((source) => extractOrig(source, 'tit')))

/** The same data as the rows the sample holds: every string of the document, attributes left out. */
function rawText(node: unknown): string {
  if (typeof node === 'string') return node
  const content = (node as { content?: unknown[] }).content ?? []
  return content.map(rawText).join('')
}

/** The chapter chunks of the sample, in chapter order, as the rows hold them: the independent side of the tests. */
async function rawChunks(): Promise<{ chapter: number; content: unknown[] }[]> {
  const chunks: { chapter: number; content: unknown[] }[] = []
  for await (const row of (await realSource()).rows({ lang: 'originals', book: 'tit', layer: 'sot' })) {
    const match = /:tit:(\d+)$/.exec(row.key)
    if (match) chunks.push({ chapter: Number(match[1]), content: (row.value as any).content.usj.content })
  }
  return chunks.sort((a, b) => a.chapter - b.chapter)
}

/** Every `\w` of the raw rows in document order with the verse id its chapter and verse nodes give (Titus is book 56). */
function rawWords(chunks: { content: unknown[] }[]): { form: string; verse: number }[] {
  const out: { form: string; verse: number }[] = []
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
      out.push({ form: rawText(n), verse: 56_000_000 + chapter * 1000 + verse })
      return
    }
    for (const child of n.content ?? []) walk(child)
  }
  for (const chunk of chunks) for (const node of chunk.content) walk(node)
  return out
}

// A source made by hand, for what the sample does not hold: another attribute of a word, MACULA, a broken book.

const ref = (key: string, stamp: string, books: string[], bookStamps?: Record<string, string>): ResourceRef => ({
  key,
  stamp,
  kind: 'Original',
  books,
  ...(bookStamps === undefined ? {} : { bookStamps }),
})

function fake(rows: Row[], resources: ResourceRef[]): RowSource {
  return {
    async *rows(f) {
      for (const row of rows) if (f.lang === 'originals' && (f.layer === undefined || row.layer === f.layer)) yield row
    },
    async resources(lang) {
      return lang === 'originals' ? resources : []
    },
  }
}

const chapterRow = (res: string, book: string, chapter: number, content: unknown[]): Row => ({
  layer: 'sot',
  key: `scripture-usj:${res}:${book}:${chapter}`,
  value: { bookId: book, chapter, content: { usj: { type: 'USJ', version: '3.1', content } }, resourceKey: res },
})
const bookRow = (res: string, book: string, chapterNumbers: number[]): Row => ({
  layer: 'sot',
  key: `scripture-usj:${res}:${book}`,
  value: { bookId: book, content: { book: book.toUpperCase(), bookCode: book, chapterNumbers }, resourceKey: res },
})

const w = (form: string, attrs: Record<string, string> = {}) => ({ type: 'char', marker: 'w', ...attrs, content: [form] })
const chapterNode = (n: string) => ({ type: 'chapter', marker: 'c', number: n, sid: `GEN ${n}` })
const verseNode = (n: string) => ({ type: 'verse', marker: 'v', number: n, sid: `GEN 1:${n}` })

/** A small book with words, a footnote, a milestone and an attribute outside the four. */
const GEN_ROWS: Row[] = [
  bookRow(UHB, 'gen', [1]),
  chapterRow(UHB, 'gen', 1, [
    chapterNode('1'),
    {
      type: 'para',
      marker: 'p',
      content: [
        verseNode('1'),
        w('בְּ/רֵאשִׁ֖ית', { lemma: 'b/rē’šît', strong: 'b:H7225', 'x-morph': 'He,R/Ncfsa', srcloc: 'gen1:1.1.1' }),
        ' ',
        w('בָּרָ֣א', { lemma: 'bārā’', strong: 'H1254a', 'x-morph': 'He,Vqp3ms' }),
        { type: 'ms', marker: 'ts' },
        { type: 'note', marker: 'f', caller: '+', content: ['See ', w('אֱלֹהִ֑ים', { lemma: 'ʼelōhîm' }), '.'] },
        verseNode('2'),
        w('וְ/הָאָ֗רֶץ', { 'x-morph': 'He,C/Td/Ncfsa', 'x-tw': 'rc://*/tw/dict/bible/other/earth' }),
        w('וְ/הָאָ֗רֶץ'),
        '.',
      ],
    },
  ]),
]
const GEN_REFS = [ref(UHB, 'v3.0.0#2026-08-14T18_44_01Z', ['gen'])]
const genModel = () => extractOrig(fake(GEN_ROWS, GEN_REFS), 'gen')

/** The file path: model -> segment -> bytes -> segment -> model. */
async function throughFile(m: OrigModel, known = KNOWN): Promise<{ model: OrigModel; id: string; size: number; skipped: string[] }> {
  const { bytes, id } = await writeSegment(origSegment(m))
  const read = await readSegment(bytes, { known, expectedId: id })
  return { model: origView(read.seg), id, size: bytes.length, skipped: read.skipped }
}

describe('UGNT Titus from the data folder', () => {
  test('has 659 words, from the first of Titus 1:1 to the last of 3:15', async () => {
    const m = await titus()
    expect(m.words.length).toBe(659)
    expect(m.pieces.filter(([, isWord]) => isWord).length).toBe(659)
    expect(m.words[0]).toEqual({ form: 'Παῦλος', lemma: 'Παῦλος', strong: 'G39720', morph: 'Gr,N,,,,,NMS,' })
    expect(m.words[658]).toEqual({ form: 'ὑμῶν', lemma: 'σύ', strong: 'G47710', morph: 'Gr,RP,,,2G,P,' })
  })

  test('names the book by its key, and the stamp is the blob of the book file as format 2.0 records it', async () => {
    const m = await titus()
    expect(m.book).toBe('tit')
    expect(m.key).toBe('unfoldingWord/el-x-koine/ugnt')
    // `g` and the first 10 digits of the blob in `bookBlobs.tit` of the originals list: the stamp the tN and tWL quote
    // keys name (`ugnt@g987ab2025a+2.3.0-usj`). The rows themselves do not carry it; the source's resources do.
    expect(m.stamp).toBe('g987ab2025a')
    expect(m.macula).toBeUndefined()
  })

  test('every word has its four attributes and none has another', async () => {
    const m = await titus()
    for (const word of m.words) {
      expect(Object.keys(word).sort()).toEqual(['form', 'lemma', 'morph', 'strong'])
      expect(word.form).not.toBe('')
      expect(word.strong).toMatch(/^G\d{5}$/)
    }
  })

  test('keeps the text of the document: its pieces joined are the strings of the rows', async () => {
    const m = await titus()
    const chunks = await rawChunks()
    expect(chunks.map((c) => c.chapter)).toEqual([0, 1, 2, 3])
    const expected = chunks.map((c) => c.content.map(rawText).join('')).join('')
    expect(expected.length).toBe(4638)
    expect(m.pieces.map(([text]) => text).join('')).toBe(expected)
    // A word piece is the word's form.
    const forms = m.words.map((word) => word.form)
    expect(m.pieces.filter(([, isWord]) => isWord).map(([text]) => text)).toEqual(forms)
  })

  test('has the structure of the document as events', async () => {
    const m = await titus()
    expect(m.pieces[0]).toEqual(['unfoldingWord® Greek New Testament', false])
    expect(m.pieces[7]).toEqual(['Παῦλος', true])
    expect(m.pieces[8]).toEqual([', ', false])
    // The front matter, then chapter 1 with its first paragraph and its first verse, all at piece 7: the first word.
    expect(m.events.slice(0, 17)).toEqual([
      [0, 'open', 'book:id'],
      [1, 'close', ''],
      [1, 'open', 'para:ide'],
      [2, 'close', ''],
      [2, 'open', 'para:h'],
      [3, 'close', ''],
      [3, 'open', 'para:toc1'],
      [4, 'close', ''],
      [4, 'open', 'para:toc2'],
      [5, 'close', ''],
      [5, 'open', 'para:toc3'],
      [6, 'close', ''],
      [6, 'open', 'para:mt1'],
      [7, 'close', ''],
      [7, 'chapter', '1'],
      [7, 'open', 'para:p'],
      [7, 'verse', '1'],
    ])
    const count = (kind: string) => m.events.filter((e) => e[1] === kind).length
    expect(count('chapter')).toBe(3)
    expect(count('verse')).toBe(46)
    expect(count('open')).toBe(7 + 13)
    expect(count('close')).toBe(count('open'))
    expect(m.events.filter((e) => e[1] === 'chapter').map((e) => e[2])).toEqual(['1', '2', '3'])
    for (let i = 1; i < m.events.length; i++) expect(m.events[i][0]).toBeGreaterThanOrEqual(m.events[i - 1][0])
    expect(m.events[m.events.length - 1]).toEqual([m.pieces.length, 'close', ''])
  })

  test('keeps the book code as an attribute, and the chapter and verse numbers only as arguments', async () => {
    const m = await titus()
    // `sid` of a chapter or a verse is its book, chapter and verse again: the event says it.
    expect(m.attrs).toEqual({ 0: { code: 'TIT' } })
  })

  test('origView(origSegment(m)) is m', async () => {
    const m = await titus()
    expect(origView(origSegment(m))).toEqual(m)
  })

  test('survives the file: writeSegment, readSegment, origView', async () => {
    const m = await titus()
    const { model, size, skipped } = await throughFile(m)
    expect(model).toEqual(m)
    expect(skipped).toEqual([])
    expect(size).toBeGreaterThan(0)
    const { bytes } = await writeSegment(origSegment(m))
    const { seg } = await readSegment(bytes, { known: KNOWN })
    expect(seg.h).toEqual({
      class: 'orig',
      v: 1,
      tables: { words: [1, true], text: [1, true] },
      book: 'tit',
      orig: ['unfoldingWord/el-x-koine/ugnt', 'g987ab2025a'],
    })
  })

  test('same model, same bytes', async () => {
    const m = await titus()
    const a = await writeSegment(origSegment(m))
    const b = await writeSegment(origSegment(m))
    expect(a.id).toBe(b.id)
    expect(a.body).toEqual(b.body)
    // And extracting twice gives the same model, so the same id.
    const again = await extractOrig(await realSource(), 'tit')
    expect((await writeSegment(origSegment(again))).id).toBe(a.id)
  })
})

describe('the stamp of the book', () => {
  const para = { type: 'para', marker: 'p', content: [w('a')] }
  const rows = [chapterRow(UGNT, 'tit', 1, [para])]
  const release = 'v0.34#2023-09-27T02_19_31Z'

  test('is the blob stamp the resource gives for the book', async () => {
    const m = await extractOrig(fake(rows, [ref(UGNT, release, ['tit'], { tit: 'g987ab2025a' })]), 'tit')
    expect(m.stamp).toBe('g987ab2025a')
    expect(origSegment(m).h.orig).toEqual([UGNT, 'g987ab2025a'])
  })

  test('is the release tag of the resource (no date) when the source records no blobs', async () => {
    const m = await extractOrig(fake(rows, [ref(UGNT, release, ['tit'])]), 'tit')
    expect(m.stamp).toBe('v0.34')
    expect(origSegment(m).h.orig).toEqual([UGNT, 'v0.34'])
  })

  test('is the release tag of the resource when the blobs it has are of other books', async () => {
    for (const bookStamps of [{ rom: 'gaaaaaaaaaa' }, {}]) {
      const m = await extractOrig(fake(rows, [ref(UGNT, release, ['tit'], bookStamps)]), 'tit')
      expect(m.stamp).toBe('v0.34')
    }
  })

  test('a name of the prototype is not a book with a stamp', async () => {
    const m = await extractOrig(fake([chapterRow(UGNT, 'toString', 1, [para])], [ref(UGNT, release, [], {})]), 'toString')
    expect(m.stamp).toBe('v0.34')
  })

  test('the stamp of MACULA is the release of its resource, whatever blobs the originals have', async () => {
    const macula = ref(MACULA, '3b8aa380e8#2026-10-15T02_19_35.000Z', ['tit'], { tit: 'gbbbbbbbbbb' })
    const treesRow: Row = { layer: 'sot', key: `${MACULA}/trees/TIT`, value: { sentences: [] } }
    const m = await extractOrig(fake([...rows, treesRow], [ref(UGNT, release, ['tit'], { tit: 'g987ab2025a' }), macula]), 'tit')
    expect(m.stamp).toBe('g987ab2025a')
    expect(m.macula!.release).toBe('3b8aa380e8#2026-10-15T02_19_35.000Z')
  })
})

describe('OrigIndex on Titus', () => {
  test('find(56001006, "ἀνέγκλητος", 1) is the word of that form', async () => {
    const m = await titus()
    const index = new OrigIndex(m)
    const position = index.find(56001006, 'ἀνέγκλητος', 1)
    expect(position).toBe(87)
    expect(m.words[position!].form).toBe('ἀνέγκλητος')
    expect(index.verseOf(position!)).toBe(56001006)
  })

  test('finds the same word from the text in NFD, or with "/" and U+2060 inserted', async () => {
    const m = await titus()
    const index = new OrigIndex(m)
    const text = 'ἀνέγκλητος'
    const nfd = text.normalize('NFD')
    expect(nfd).not.toBe(text)
    expect(index.find(56001006, nfd, 1)).toBe(87)
    expect(index.find(56001006, 'ἀνέ/γκλητος', 1)).toBe(87)
    expect(index.find(56001006, 'ἀνέ\u2060γκλητος', 1)).toBe(87)
    expect(index.find(56001006, `${nfd.slice(0, 3)}/\u2060${nfd.slice(3)}`, 1)).toBe(87)
  })

  test('counts occurrences inside the verse: Θεοῦ is the third and the eleventh word', async () => {
    const index = new OrigIndex(await titus())
    expect(index.find(56001001, 'Θεοῦ', 1)).toBe(2)
    expect(index.find(56001001, 'Θεοῦ', 2)).toBe(10)
    expect(index.find(56001001, 'Θεοῦ', 3)).toBeNull()
  })

  test('is null for a word the verse does not have, an occurrence it does not have, and a verse it does not have', async () => {
    const index = new OrigIndex(await titus())
    expect(index.find(56001006, 'Θεοῦ', 1)).toBeNull()
    expect(index.find(56001006, 'ἀνέγκλητος', 2)).toBeNull()
    expect(index.find(56001006, 'ἀνέγκλητος', 0)).toBeNull()
    expect(index.find(56001006, 'ἀνέγκλητος', 1.5)).toBeNull()
    expect(index.find(56001006, '', 1)).toBeNull()
    expect(index.find(56001007, 'ἀνέγκλητος', 1)).toBeNull()
    expect(index.find(56009999, 'ἀνέγκλητος', 1)).toBeNull()
  })

  test('verseOf: the verse of the first and of the last word', async () => {
    const index = new OrigIndex(await titus())
    expect(index.verseOf(0)).toBe(56001001)
    expect(index.verseOf(658)).toBe(56003015)
    expect(index.verseOf(16)).toBe(56001001)
    expect(index.verseOf(17)).toBe(56001002)
  })

  test('verseOf throws RangeError outside the book', async () => {
    const index = new OrigIndex(await titus())
    for (const position of [-1, 659, 1000, 1.5, Number.NaN]) expect(() => index.verseOf(position)).toThrow(RangeError)
  })

  test('all 659 words: the verse is the one of the raw rows, and its form is found again at its position', async () => {
    const m = await titus()
    const index = new OrigIndex(m)
    const raw = rawWords(await rawChunks())
    expect(raw.length).toBe(659)
    const seen = new Map<string, number>()
    raw.forEach(({ form, verse }, position) => {
      expect(form).toBe(m.words[position].form)
      expect(index.verseOf(position)).toBe(verse)
      // k is the form's number among the words of its verse with that form, counted here from the raw rows.
      const key = `${verse}|${form}`
      const k = (seen.get(key) ?? 0) + 1
      seen.set(key, k)
      expect(index.find(verse, form, k)).toBe(position)
      expect(index.find(verse, form.normalize('NFD'), k)).toBe(position)
    })
    // Some form repeats inside a verse (Θεοῦ in 1:1), so k is not always 1.
    expect([...seen.values()].some((k) => k > 1)).toBe(true)
    expect(new Set(raw.map((word) => word.verse)).size).toBe(46)
  })
})

describe('OrigIndex on a small model', () => {
  const word = (form: string) => ({ form, lemma: '', strong: '', morph: '' })
  const small = (events: OrigModel['events'], forms: string[]): OrigModel => ({
    book: 'tit',
    key: UGNT,
    stamp: 's',
    words: forms.map(word),
    pieces: forms.map((form): [string, boolean] => [form, true]),
    events,
  })

  test('a word before any chapter or verse is in the introduction of the book, then of the chapter', () => {
    const m = small(
      [
        [1, 'chapter', '2'],
        [2, 'verse', '1-2'],
        [3, 'verse', '3'],
      ],
      ['a', 'b', 'c', 'd'],
    )
    const index = new OrigIndex(m)
    expect(index.verseOf(0)).toBe(56000000)
    expect(index.verseOf(1)).toBe(56002000)
    expect(index.verseOf(2)).toBe(56002001) // "1-2" takes the id of its first number
    expect(index.verseOf(3)).toBe(56002003)
    expect(index.find(56002000, 'b', 1)).toBe(1)
    expect(index.find(56002001, 'c', 1)).toBe(2)
  })

  test('findInVerses counts the occurrences over the verses from the first to the last, exact form first', () => {
    const index = new OrigIndex(
      small(
        [
          [0, 'chapter', '1'],
          [0, 'verse', '1'],
          [2, 'verse', '2'],
          [4, 'verse', '3'],
        ],
        ['a', 'b', 'a', 'c/d', 'a'],
      ),
    )
    expect(index.findInVerses(56001001, 56001002, 'a', 2)).toBe(2)
    expect(index.findInVerses(56001001, 56001002, 'a', 3)).toBeNull() // the third a is in verse 3
    expect(index.findInVerses(56001001, 56001003, 'a', 3)).toBe(4)
    expect(index.findInVerses(56001002, 56001002, 'a', 1)).toBe(2)
    expect(index.findInVerses(56001001, 56001002, 'cd', 1)).toBe(3) // folded
    expect(index.findInVerses(56001001, 56001002, 'a', 0)).toBeNull()
    expect(index.findInVerses(56001003, 56001001, 'a', 1)).toBeNull() // from above to
    expect(index.findInVerses(56001001, 56001001, 'a', 1)).toBe(index.find(56001001, 'a', 1))
    expect(index.findInVerses(56001005, 56001009, 'a', 1)).toBeNull() // verses the book lacks
  })

  test('a text that folds to nothing names no word, even when a word has that very form', () => {
    const index = new OrigIndex(
      small(
        [
          [0, 'chapter', '1'],
          [0, 'verse', '1'],
        ],
        ['/', '', 'a'],
      ),
    )
    for (const text of ['', '/', '//', WORD_JOINER, `/${WORD_JOINER}`]) expect(index.find(56001001, text, 1)).toBeNull()
    expect(index.find(56001001, 'a', 1)).toBe(2)
  })

  test('a chapter or verse label that is not a number is refused', () => {
    expect(() => new OrigIndex(small([[0, 'chapter', 'x']], ['a']))).toThrow(RangeError)
    expect(() => new OrigIndex(small([[0, 'verse', '']], ['a']))).toThrow(RangeError)
    expect(() => new OrigIndex(small([[0, 'verse', '1000']], ['a']))).toThrow(RangeError)
  })

  test('refuses a model whose word pieces and words do not agree', () => {
    const m = small([], ['a', 'b'])
    m.words.pop()
    expect(() => new OrigIndex(m)).toThrow()
  })

  test('an event after the last piece does not belong to any word', () => {
    const index = new OrigIndex(small([[1, 'verse', '5']], ['a']))
    expect(index.verseOf(0)).toBe(56000000)
  })
})

describe('words that differ from the four attributes, by hand', () => {
  test('an attribute outside the four keeps its key in `other`', async () => {
    const m = await genModel()
    expect(m.words.map((word) => word.form)).toEqual(['בְּ/רֵאשִׁ֖ית', 'בָּרָ֣א', 'אֱלֹהִ֑ים', 'וְ/הָאָ֗רֶץ', 'וְ/הָאָ֗רֶץ'])
    expect(m.words[0]).toEqual({
      form: 'בְּ/רֵאשִׁ֖ית',
      lemma: 'b/rē’šît',
      strong: 'b:H7225',
      morph: 'He,R/Ncfsa',
      other: { srcloc: 'gen1:1.1.1' },
    })
    expect(m.words[3].other).toEqual({ 'x-tw': 'rc://*/tw/dict/bible/other/earth' })
  })

  test('a word without an attribute has the empty string there, and no `other` when it has nothing else', async () => {
    const m = await genModel()
    expect(m.words[2]).toEqual({ form: 'אֱלֹהִ֑ים', lemma: 'ʼelōhîm', strong: '', morph: '' })
    expect('other' in m.words[2]).toBe(false)
    expect(m.words[4]).toEqual({ form: 'וְ/הָאָ֗רֶץ', lemma: '', strong: '', morph: '' })
    expect('other' in m.words[1]).toBe(false)
  })

  test('words inside a footnote count, in document order, and the nodes around them are events', async () => {
    const m = await genModel()
    expect(m.pieces).toEqual([
      ['בְּ/רֵאשִׁ֖ית', true],
      [' ', false],
      ['בָּרָ֣א', true],
      ['See ', false],
      ['אֱלֹהִ֑ים', true],
      ['.', false],
      ['וְ/הָאָ֗רֶץ', true],
      ['וְ/הָאָ֗רֶץ', true],
      ['.', false],
    ])
    expect(m.events).toEqual([
      [0, 'chapter', '1'],
      [0, 'open', 'para:p'],
      [0, 'verse', '1'],
      [3, 'open', 'ms:ts'], // a milestone opens and closes at the same position
      [3, 'close', ''],
      [3, 'open', 'note:f'],
      [6, 'close', ''],
      [6, 'verse', '2'],
      [9, 'close', ''],
    ])
    expect(m.attrs).toEqual({ 5: { caller: '+' } })
    expect(m.macula).toBeUndefined()
  })

  test('everything survives the segment and the file', async () => {
    const m = await genModel()
    expect(origView(origSegment(m))).toEqual(m)
    expect((await throughFile(m)).model).toEqual(m)
    const seg = origSegment(m)
    const words = seg.t.words as any
    expect(words.other).toEqual([
      [0, { srcloc: 'gen1:1.1.1' }],
      [3, { 'x-tw': 'rc://*/tw/dict/bible/other/earth' }],
    ])
    expect((seg.t.text as any).attrs).toEqual([[5, { caller: '+' }]])
  })

  test('the folded lookup: "/" and U+2060 out, NFC; the exact form first', async () => {
    const m = await genModel()
    const index = new OrigIndex(m)
    const verse1 = 1001001
    const verse2 = 1001002
    expect(index.find(verse1, 'בְּ/רֵאשִׁ֖ית', 1)).toBe(0)
    expect(index.find(verse1, 'בְּרֵאשִׁ֖ית', 1)).toBe(0)
    expect(index.find(verse1, 'בְּ\u2060רֵאשִׁ֖ית', 1)).toBe(0)
    expect(index.find(verse1, 'אֱלֹהִ֑ים', 1)).toBe(2) // inside the footnote, still verse 1
    expect(index.find(verse2, 'וְהָאָ֗רֶץ', 1)).toBe(3)
    expect(index.find(verse2, 'וְהָאָ֗רֶץ', 2)).toBe(4)
    expect(index.find(verse2, 'וְ/הָאָ֗רֶץ', 3)).toBeNull()
  })

  test('a form whose marks are not in canonical order is found by either order', () => {
    // Published as dagesh (ccc 21) before sheva (ccc 10): NFC puts the sheva first.
    const published = '\u05D1\u05BC\u05B0'
    const canonical = '\u05D1\u05B0\u05BC'
    expect(published.normalize('NFC')).toBe(canonical)
    const m: OrigModel = {
      book: 'gen',
      key: UHB,
      stamp: 's',
      words: [{ form: published, lemma: '', strong: '', morph: '' }],
      pieces: [[published, true]],
      events: [
        [0, 'chapter', '1'],
        [0, 'verse', '1'],
      ],
    }
    const index = new OrigIndex(m)
    expect(index.find(1001001, published, 1)).toBe(0)
    expect(index.find(1001001, canonical, 1)).toBe(0)
  })

  test('the exact form wins over the folded one: the second of two occurrences', () => {
    const word = (form: string) => ({ form, lemma: '', strong: '', morph: '' })
    const m: OrigModel = {
      book: 'gen',
      key: UHB,
      stamp: 's',
      words: [word('ab'), word('a/b'), word('ab')],
      pieces: [
        ['ab', true],
        ['a/b', true],
        ['ab', true],
      ],
      events: [
        [0, 'chapter', '1'],
        [0, 'verse', '1'],
      ],
    }
    const index = new OrigIndex(m)
    expect(index.find(1001001, 'ab', 1)).toBe(0)
    expect(index.find(1001001, 'ab', 2)).toBe(2) // exact: the third word is the second "ab"
    expect(index.find(1001001, 'ab', 3)).toBe(2) // no third exact one: folded, where "a/b" is the second and "ab" the third
    expect(index.find(1001001, 'a/b', 1)).toBe(1)
    expect(index.find(1001001, 'ab', 4)).toBeNull()
  })
})

describe('the segment, byte by byte', () => {
  /** Three words, a separator after each but the last, a chapter, a paragraph, two verses. */
  const tiny: OrigModel = {
    book: 'tit',
    key: UGNT,
    stamp: 'g987ab2025a',
    words: [
      { form: 'α', lemma: 'λ', strong: 'G1', morph: 'M' },
      { form: 'β', lemma: 'λ', strong: '', morph: 'M', other: { b: '2', a: '1' } },
      { form: 'α', lemma: 'μ', strong: 'G1', morph: '' },
    ],
    pieces: [
      ['α', true],
      [' ', false],
      ['β', true],
      [', ', false],
      ['α', true],
      ['.', false],
    ],
    events: [
      [0, 'chapter', '1'],
      [0, 'open', 'para:p'],
      [0, 'verse', '1'],
      [4, 'verse', '2'],
      [6, 'close', ''],
    ],
    attrs: { 1: { style: 'x' } },
  }

  test('the header', () => {
    expect(origSegment(tiny).h).toEqual({
      class: 'orig',
      v: 1,
      tables: { words: [1, true], text: [1, true] },
      book: 'tit',
      orig: [UGNT, 'g987ab2025a'],
    })
  })

  test('words: the distinct values most used first, and each word by its number', () => {
    const { words } = origSegment(tiny).t as { words: any }
    expect(words.form).toEqual(['α', 'β'])
    expect(words.lemma).toEqual(['λ', 'μ'])
    expect(words.strong).toEqual(['G1', ''])
    expect(words.morph).toEqual(['M', ''])
    expect(decodeUvarints(words.cols.form)).toEqual([0, 1, 0])
    expect(decodeUvarints(words.cols.lemma)).toEqual([0, 0, 1])
    expect(decodeUvarints(words.cols.strong)).toEqual([0, 1, 0])
    expect(decodeUvarints(words.cols.morph)).toEqual([0, 0, 1])
    expect(Object.keys(words.cols).sort()).toEqual(['form', 'lemma', 'morph', 'strong'])
    expect(words.other).toEqual([[1, { a: '1', b: '2' }]])
  })

  test('text: separators and arguments in one table, 0 for the next word, n for separator n - 1', () => {
    const { text } = origSegment(tiny).t as { text: any }
    // Used: "1" twice (chapter 1, verse 1), then by code point " ", ", ", ".", "2", "para:p".
    expect(text.seps).toEqual(['1', ' ', ', ', '.', '2', 'para:p'])
    expect(decodeUvarints(text.tok)).toEqual([0, 2, 0, 3, 0, 4])
    // Per event: pieces since the previous event, the code (0 chapter, 1 verse, 2 open, 3 close), the argument.
    expect(decodeUvarints(text.ev)).toEqual([0, 0, 0, 0, 2, 5, 0, 1, 0, 4, 1, 4, 2, 3, 0])
    expect(text.attrs).toEqual([[1, { style: 'x' }]])
  })

  test('a model without `other`, `attrs` or `macula` has none of them', () => {
    const plain: OrigModel = { ...tiny, words: tiny.words.map(({ form, lemma, strong, morph }) => ({ form, lemma, strong, morph })) }
    delete plain.attrs
    const seg = origSegment(plain)
    expect('other' in (seg.t.words as object)).toBe(false)
    expect('attrs' in (seg.t.text as object)).toBe(false)
    expect(Object.keys(seg.t).sort()).toEqual(['text', 'words'])
    expect(origView(seg)).toEqual(plain)
    expect('attrs' in origView(seg)).toBe(false)
  })

  test('an empty `attrs` or `other` is kept as empty, so the model comes back as it was', () => {
    const m: OrigModel = { ...tiny, words: [{ ...tiny.words[0], other: {} }, tiny.words[1], tiny.words[2]], attrs: {} }
    const back = origView(origSegment(m))
    expect(back).toEqual(m)
    expect(back.attrs).toEqual({})
    expect(back.words[0].other).toEqual({})
  })

  test('attrs are listed by event number, not by the order of their text', () => {
    const events: OrigModel['events'] = []
    for (let i = 0; i < 12; i++) events.push([0, 'open', 'char:add'])
    const m: OrigModel = { ...tiny, words: [], pieces: [], events, attrs: { 10: { a: 'x' }, 2: { b: 'y' }, 11: {} } }
    const attrs = (origSegment(m).t.text as any).attrs
    expect(attrs.map((entry: [number, unknown]) => entry[0])).toEqual([2, 10, 11])
    expect(origView(origSegment(m))).toEqual(m)
  })

  test('same bytes and id whatever the order the keys of `other`, `attrs` and `trees` were added in', async () => {
    const reverseKeys = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reverseKeys)
        : value !== null && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]))
          : value
    const trees = { sentences: [['*', ['s', 1, 2]]], extra: { b: 1, a: [{ y: 'y', x: 'x' }] } }
    const referents = { words: [], verses: { '1:2': [], '1:1': [] } }
    const a: OrigModel = {
      ...tiny,
      words: [{ ...tiny.words[0], other: { c: '3', a: '1', b: '2' } }, tiny.words[1], tiny.words[2]],
      attrs: { 1: { z: '1', a: '2', m: '3' }, 3: { y: '1', b: '2' } },
      macula: { release: 'r', trees, referents },
    }
    const b: OrigModel = {
      ...a,
      words: a.words.map((word) => (word.other === undefined ? word : { ...word, other: reverseKeys(word.other) as Record<string, string> })),
      attrs: Object.fromEntries(Object.entries(a.attrs!).map(([event, attrs]) => [event, reverseKeys(attrs) as Record<string, string>])),
      macula: { release: 'r', trees: reverseKeys(trees), referents: reverseKeys(referents) },
    }
    // The two really differ in the order of their keys.
    expect(Object.keys(a.words[0].other!)).not.toEqual(Object.keys(b.words[0].other!))
    expect(Object.keys(a.words[1].other!)).not.toEqual(Object.keys(b.words[1].other!))
    expect(Object.keys(a.attrs![1])).not.toEqual(Object.keys(b.attrs![1]))
    expect(Object.keys(trees.extra)).not.toEqual(Object.keys((b.macula!.trees as typeof trees).extra))
    expect(Object.keys(referents.verses)).not.toEqual(Object.keys((b.macula!.referents as typeof referents).verses))
    const first = await writeSegment(origSegment(a))
    const second = await writeSegment(origSegment(b))
    expect(second.id).toBe(first.id)
    expect(second.body).toEqual(first.body)
    expect(second.bytes).toEqual(first.bytes)
    expect((await throughFile(b)).model).toEqual(a)
  })

  test('strings outside the BMP sort by code point in the tables', () => {
    const m: OrigModel = {
      book: 'tit',
      key: UGNT,
      stamp: 's',
      words: [],
      pieces: [
        ['\u{1D538}', false],
        ['\uFFFF', false],
      ],
      events: [],
    }
    expect((origSegment(m).t.text as any).seps).toEqual(['\uFFFF', '\u{1D538}'])
  })
})

describe('origSegment refuses a model the segment cannot hold', () => {
  const base = (): OrigModel => ({
    book: 'tit',
    key: UGNT,
    stamp: 's',
    words: [{ form: 'a', lemma: '', strong: '', morph: '' }],
    pieces: [
      ['a', true],
      [' ', false],
    ],
    events: [
      [0, 'open', 'para:p'],
      [2, 'close', ''],
    ],
  })
  const broken: [string, (m: OrigModel) => void][] = [
    ['a book that is not three lowercase letters or digits', (m) => void (m.book = 'TIT')],
    ['a word piece whose text is not the form of the word', (m) => void (m.pieces[0] = ['b', true])],
    ['a word piece too many', (m) => void m.pieces.push(['b', true])],
    ['a word with no piece', (m) => void m.words.push({ form: 'b', lemma: '', strong: '', morph: '' })],
    ['an event after the end of the pieces', (m) => void (m.events[1] = [3, 'close', ''])],
    ['events that go backwards', (m) => void m.events.unshift([1, 'verse', '1'])],
    ['an event at a negative position', (m) => void (m.events[0] = [-1, 'open', 'para:p'])],
    ['an event at a position that is not an integer', (m) => void (m.events[0] = [0.5, 'open', 'para:p'])],
    ['a close with an argument', (m) => void (m.events[1] = [2, 'close', 'para:p'])],
    ['a kind that is not one of the four', (m) => void (m.events[0] = [0, 'milestone' as 'open', 'ts'])],
    ['attributes of an event that does not exist', (m) => void (m.attrs = { 2: { a: 'b' } })],
    ['attributes of a negative event', (m) => void (m.attrs = { '-1': { a: 'b' } })],
    ['attributes of an event named by a string that is not a number', (m) => void (m.attrs = { x: { a: 'b' } } as never)],
  ]
  for (const [name, change] of broken) {
    test(name, () => {
      const m = base()
      change(m)
      expect(() => origSegment(m)).toThrow()
    })
  }
  test('the base model itself is fine', () => {
    expect(origView(origSegment(base()))).toEqual(base())
  })
})

describe('origView rejects a segment that is not an original', () => {
  const tiny: OrigModel = {
    book: 'tit',
    key: UGNT,
    stamp: 's',
    words: [
      { form: 'a', lemma: 'l', strong: 'G1', morph: 'M', other: { x: 'y' } },
      { form: 'b', lemma: 'l', strong: 'G1', morph: 'M' },
    ],
    pieces: [
      ['a', true],
      [' ', false],
      ['b', true],
    ],
    events: [
      [0, 'chapter', '1'],
      [0, 'verse', '1'],
      [1, 'open', 'char:add'],
      [3, 'close', ''],
    ],
    attrs: { 2: { z: 'w' } },
  }
  const fresh = (): Segment => structuredClone(origSegment(tiny))
  const text = (s: Segment) => s.t.text as any
  const words = (s: Segment) => s.t.words as any

  test('the untouched copy is fine', () => {
    expect(origView(fresh())).toEqual(tiny)
  })

  const broken: [string, (s: Segment) => void][] = [
    ['another class', (s) => void (s.h.class = 'book')],
    ['no book in the header', (s) => void delete s.h.book],
    ['no original in the header', (s) => void delete s.h.orig],
    ['no words table', (s) => void delete s.t.words],
    ['no text table', (s) => void delete s.t.text],
    ['a words table that is not a map', (s) => void (s.t.words = [])],
    ['a form table that has a number', (s) => void (words(s).form = ['a', 1])],
    ['a column that is not bytes', (s) => void (words(s).cols.lemma = [0, 0])],
    ['a column of another length', (s) => void (words(s).cols.lemma = new Uint8Array([0]))],
    ['a word with a value outside its table', (s) => void (words(s).cols.morph = new Uint8Array([0, 5]))],
    ['a varint that is cut short', (s) => void (words(s).cols.strong = new Uint8Array([0, 0x80]))],
    ['an `other` that names a word the book does not have', (s) => void (words(s).other = [[2, { x: 'y' }]])],
    [
      'an `other` that names a word twice',
      (s) =>
        void (words(s).other = [
          [0, { x: 'y' }],
          [0, { x: 'z' }],
        ]),
    ],
    ['an `other` value that is not text', (s) => void (words(s).other = [[0, { x: 1 }]])],
    ['a separator number outside seps', (s) => void (text(s).tok = new Uint8Array([0, 99, 0]))],
    ['a word piece too many', (s) => void (text(s).tok = new Uint8Array([0, 2, 0, 0]))],
    ['a word piece too few', (s) => void (text(s).tok = new Uint8Array([0, 2]))],
    ['events that are not triples', (s) => void (text(s).ev = new Uint8Array([0, 0, 0, 0]))],
    ['an event code that is not one of the four', (s) => void (text(s).ev = new Uint8Array([0, 4, 0]))],
    ['a close with an argument', (s) => void (text(s).ev = new Uint8Array([0, 3, 1]))],
    ['an argument outside seps', (s) => void (text(s).ev = new Uint8Array([0, 0, 99]))],
    ['an event after the last piece', (s) => void (text(s).ev = new Uint8Array([4, 3, 0]))],
    ['attributes of an event the text does not have', (s) => void (text(s).attrs = [[4, { z: 'w' }]])],
    [
      'attributes of an event twice',
      (s) =>
        void (text(s).attrs = [
          [2, { z: 'w' }],
          [2, { z: 'v' }],
        ]),
    ],
    ['a macula table without a release', (s) => void (s.t.macula = { trees: {} })],
  ]
  for (const [name, change] of broken) {
    test(name, () => {
      const s = fresh()
      change(s)
      let error: unknown
      try {
        origView(s)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(FormatError)
      expect((error as FormatError).code).toBe('E_BODY')
    })
  }
})

describe('MACULA', () => {
  // The real Titus MACULA part is not in the sample (its license is its own): these values have its shape.
  const trees = { sentences: [['*', ['s', 1001001, 1001002], ['adv', 1001003, ['&', 1001004]]]] }
  const referents = { verses: { '1:1': [['ουσ', 0, [['r', '', 1, 10, 17]]]] }, words: [['x', 'y']] }
  const release = '3b8aa380e8#2026-10-15T02_19_35.000Z'
  const macula = ref(MACULA, release, ['tit'])
  const treesRow: Row = { layer: 'sot', key: `${MACULA}/trees/TIT`, value: trees }
  const referentsRow: Row = { layer: 'sot', key: `${MACULA}/referents/TIT`, value: referents }
  const tit = (...rest: Row[]) => [bookRow(UGNT, 'tit', [1]), chapterRow(UGNT, 'tit', 1, [chapterNode('1'), { type: 'para', marker: 'p', content: [w('α'), '.'] }]), ...rest]
  const refs = [ref(UGNT, 'v0.34#2023-09-27T02_19_31Z', ['tit']), macula]

  test('the rows go to `macula` as they are, with the release of the resource', async () => {
    const m = await extractOrig(fake(tit(treesRow, referentsRow), refs), 'tit')
    expect(m.macula).toEqual({ release, trees, referents })
  })

  test('trees or referents alone are kept alone', async () => {
    expect((await extractOrig(fake(tit(treesRow), refs), 'tit')).macula).toEqual({ release, trees })
    expect((await extractOrig(fake(tit(referentsRow), refs), 'tit')).macula).toEqual({ release, referents })
    expect('referents' in (await extractOrig(fake(tit(treesRow), refs), 'tit')).macula!).toBe(false)
  })

  test('without MACULA rows there is no `macula`; the rows of another book are not this book', async () => {
    expect((await extractOrig(fake(tit(), refs), 'tit')).macula).toBeUndefined()
    const other: Row = { layer: 'sot', key: `${MACULA}/trees/ROM`, value: trees }
    expect((await extractOrig(fake(tit(other), refs), 'tit')).macula).toBeUndefined()
  })

  test('the table is written as orig.cddl says and read back', async () => {
    const m = await extractOrig(fake(tit(treesRow, referentsRow), refs), 'tit')
    const seg = origSegment(m)
    expect(seg.h.tables).toEqual({ words: [1, true], text: [1, true], macula: [1, false] })
    expect(seg.t.macula).toEqual({ release, trees, referents })
    expect(origView(seg)).toEqual(m)
    const { model, skipped } = await throughFile(m)
    expect(model).toEqual(m)
    expect(skipped).toEqual([])
  })

  test('a reader that does not know the table reads the original without it', async () => {
    const m = await extractOrig(fake(tit(treesRow, referentsRow), refs), 'tit')
    const { model, skipped } = await throughFile(m, { words: [1], text: [1] })
    expect(skipped).toEqual(['macula'])
    const { macula: _dropped, ...without } = m
    expect(model).toEqual(without)
  })

  test('only the release, with no trees and no referents', () => {
    const m: OrigModel = { book: 'tit', key: UGNT, stamp: 's', words: [], pieces: [], events: [], macula: { release: 'r' } }
    const seg = origSegment(m)
    expect(seg.t.macula).toEqual({ release: 'r' })
    expect(origView(seg)).toEqual(m)
  })

  test('the writer refuses a table nested past the MAX_DEPTH levels a reader accepts', async () => {
    // The body, `t` and `macula` take 3 levels, so `trees` may be MAX_DEPTH - 3 containers deep: the whole body is then
    // exactly MAX_DEPTH deep and is written. One container more is refused. The Titus trees of the phase 0 sample are
    // 14 deep ({sentences: ...} counts as one): they fit with room to spare.
    let deep: unknown = 1
    for (let i = 0; i < MAX_DEPTH - 2; i++) deep = [deep]
    const m: OrigModel = { book: 'tit', key: UGNT, stamp: 's', words: [], pieces: [], events: [], macula: { release: 'r', trees: deep } }
    await expect(writeSegment(origSegment(m))).rejects.toThrow()
    let fits: unknown = 1
    for (let i = 0; i < MAX_DEPTH - 3; i++) fits = [fits]
    const ok: OrigModel = { ...m, macula: { release: 'r', trees: fits } }
    expect((await throughFile(ok)).model).toEqual(ok)
  })

  test('trees as deep as the real Titus ones (14 containers) are written and read back', async () => {
    // With the body, `t` and `macula` that is 17 levels: over the old limit of 16, inside the limit of 64.
    let trees: unknown = 1
    for (let i = 0; i < 14; i++) trees = [trees]
    const m: OrigModel = { book: 'tit', key: UGNT, stamp: 's', words: [], pieces: [], events: [], macula: { release: 'r', trees } }
    expect((await throughFile(m)).model).toEqual(m)
  })

  test('MACULA rows of two resources, or a release the source does not list, are refused', async () => {
    const other: Row = { layer: 'sot', key: 'Other/el-x-koine/macula/referents/TIT', value: referents }
    await expect(extractOrig(fake(tit(treesRow, other), [...refs, ref('Other/el-x-koine/macula', 'x', [])]), 'tit')).rejects.toThrow()
    await expect(extractOrig(fake(tit(treesRow), [refs[0]]), 'tit')).rejects.toThrow()
    const twice = [treesRow, { ...treesRow, value: { sentences: [] } }]
    await expect(extractOrig(fake(tit(...twice), refs), 'tit')).rejects.toThrow()
  })
})

describe('extractOrig refuses a source that cannot give the book', () => {
  const refs = [ref(UGNT, 's', ['tit'])]
  const para = { type: 'para', marker: 'p', content: [w('α')] }

  test('a source with no text of the book', async () => {
    await expect(extractOrig(fake([], refs), 'tit')).rejects.toThrow()
    await expect(extractOrig(fake([chapterRow(UGNT, 'rom', 1, [para])], refs), 'tit')).rejects.toThrow()
    await expect(extractOrig(fake([bookRow(UGNT, 'tit', [1])], refs), 'tit')).rejects.toThrow()
  })

  test('a source that does not list the resource, so there is no stamp', async () => {
    await expect(extractOrig(fake([chapterRow(UGNT, 'tit', 1, [para])], []), 'tit')).rejects.toThrow()
  })

  test('a chapter of the book row that has no rows would move every later position', async () => {
    const rows = [bookRow(UGNT, 'tit', [1, 2]), chapterRow(UGNT, 'tit', 2, [para])]
    await expect(extractOrig(fake(rows, refs), 'tit')).rejects.toThrow()
    const extra = [bookRow(UGNT, 'tit', [1]), chapterRow(UGNT, 'tit', 1, [para]), chapterRow(UGNT, 'tit', 2, [para])]
    await expect(extractOrig(fake(extra, refs), 'tit')).rejects.toThrow()
    const whole = [bookRow(UGNT, 'tit', [2, 1]), chapterRow(UGNT, 'tit', 2, [para]), chapterRow(UGNT, 'tit', 1, [para])]
    expect((await extractOrig(fake(whole, refs), 'tit')).words.length).toBe(2)
  })

  test('chapters come in numeric order, not in the order of the rows or of their keys', async () => {
    const mk = (n: number) => chapterRow(UGNT, 'tit', n, [{ type: 'para', marker: 'p', content: [w(`w${n}`)] }])
    const m = await extractOrig(fake([mk(10), mk(2), mk(0), mk(1)], refs), 'tit')
    expect(m.words.map((word) => word.form)).toEqual(['w0', 'w1', 'w2', 'w10'])
  })

  test('two originals with the same book, or a chapter twice', async () => {
    const two = [chapterRow(UGNT, 'tit', 1, [para]), chapterRow('Other/el-x-koine/ugnt', 'tit', 2, [para])]
    await expect(extractOrig(fake(two, [...refs, ref('Other/el-x-koine/ugnt', 's', ['tit'])]), 'tit')).rejects.toThrow()
    await expect(extractOrig(fake([chapterRow(UGNT, 'tit', 1, [para]), chapterRow(UGNT, 'tit', 1, [para])], refs), 'tit')).rejects.toThrow()
  })

  test('a row without a USJ document, a node without a type, a number that is not text, an attribute that is not text', async () => {
    const bad = (content: unknown[]) => extractOrig(fake([chapterRow(UGNT, 'tit', 1, content)], refs), 'tit')
    await expect(extractOrig(fake([{ layer: 'sot', key: `scripture-usj:${UGNT}:tit:1`, value: { content: {} } }], refs), 'tit')).rejects.toThrow()
    await expect(bad([{ marker: 'p', content: [] }])).rejects.toThrow()
    await expect(bad([{ type: 'chapter', marker: 'c', number: 1 }])).rejects.toThrow()
    await expect(bad([{ type: 'para', marker: 'p', content: [w('α', { lemma: 1 as never })] }])).rejects.toThrow()
    await expect(bad([{ type: 'para', marker: 'p', align: 3, content: [] }])).rejects.toThrow()
    await expect(bad([{ type: 'para', marker: 'p', content: 'text' }])).rejects.toThrow()
    await expect(bad([{ type: 'para', marker: 'p', content: [7] }])).rejects.toThrow()
  })

  test('a node with no marker opens as its type; chapter and verse attributes other than the number are kept', async () => {
    const rows = [
      chapterRow(UGNT, 'tit', 1, [
        { type: 'chapter', marker: 'c', number: '1', sid: 'TIT 1', altnumber: 'I' },
        { type: 'para', marker: 'p', content: [{ type: 'verse', marker: 'v', number: '1', sid: 'TIT 1:1', eid: 'x', pubnumber: 'a' }, { type: 'optbreak' }, w('α')] },
      ]),
    ]
    const m = await extractOrig(fake(rows, refs), 'tit')
    expect(m.events).toEqual([
      [0, 'chapter', '1'],
      [0, 'open', 'para:p'],
      [0, 'verse', '1'],
      [0, 'open', 'optbreak'],
      [0, 'close', ''],
      [1, 'close', ''],
    ])
    expect(m.attrs).toEqual({ 0: { altnumber: 'I' }, 2: { pubnumber: 'a' } })
  })

  test('a word with markup inside takes the text of all of it as its form', async () => {
    const nested = { type: 'char', marker: 'w', lemma: 'l', content: ['a', { type: 'char', marker: 'nd', content: ['b'] }, 'c'] }
    const m = await extractOrig(fake([chapterRow(UGNT, 'tit', 1, [{ type: 'para', marker: 'p', content: [nested] }])], refs), 'tit')
    expect(m.words).toEqual([{ form: 'abc', lemma: 'l', strong: '', morph: '' }])
    expect(m.pieces).toEqual([['abc', true]])
  })

  test('an attribute named __proto__ is kept as any other', async () => {
    const attrs = JSON.parse('{"__proto__": "p", "srcloc": "s"}') as Record<string, string>
    const m = await extractOrig(fake([chapterRow(UGNT, 'tit', 1, [{ type: 'para', marker: 'p', content: [w('α', attrs)] }])], refs), 'tit')
    expect(Object.keys(m.words[0].other!).sort()).toEqual(['__proto__', 'srcloc'])
    const back = origView(origSegment(m))
    expect(Object.keys(back.words[0].other!).sort()).toEqual(['__proto__', 'srcloc'])
  })
})
