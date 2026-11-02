import { describe, expect, test } from 'bun:test'
import { decodeUvarints } from '../codec/columns'
import { readSegment, writeSegment } from '../codec/container'
import type { BookModel, Event, OrigModel, OrigWord, Piece, TextModel } from '../model'
import { partsSource } from '../node/partsSource'
import { bookView } from '../read/book'
import type { Row } from '../source/rows'
import { bookSegment } from './book'
import { extractText } from './bookTexts'
import { extractOrig, OrigIndex } from './orig'

// The data is a sample of real files (spec/tests/data/README.md): es-419 Titus, the GLT and the GST, and the UGNT.
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const GLT = 'es-419_gl/es-419/glt'
const GST = 'es-419_gl/es-419/gst'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const KNOWN = { strings: [1], texts: [1], align: [1] }
const TIT = 56_000_000
/** U+2060, which `find` takes out of a text. Built from its code point so that an editor cannot strip it. */
const WORD_JOINER = String.fromCodePoint(0x2060)

const source = () =>
  partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })

async function collect(rows: AsyncIterable<Row>): Promise<Row[]> {
  const out: Row[] = []
  for await (const row of rows) out.push(row)
  return out
}

type Sample = { orig: OrigModel; index: OrigIndex; glt: Row[]; gst: Row[]; glt1: TextModel; gst1: TextModel }
let cached: Promise<Sample> | undefined
/** The Titus of the data folder: the original, the `sot` rows of GLT and GST, and the two texts. Tests only read them. */
const titus = () =>
  (cached ??= (async (): Promise<Sample> => {
    const src = await source()
    const orig = await extractOrig(src, 'tit')
    const index = new OrigIndex(orig)
    const rowsOf = (resource: string) => collect(src.rows({ lang: 'es-419', book: 'tit', resource, layer: 'sot' }))
    const [glt, gst] = [await rowsOf(GLT), await rowsOf(GST)]
    return { orig, index, glt, gst, glt1: extractText(glt, 'tit', GLT, index), gst1: extractText(gst, 'tit', GST, index) }
  })())

const bookOf = (s: Sample, ...texts: TextModel[]): BookModel => ({
  lang: 'es-419',
  book: 'tit',
  orig: [s.orig.key, s.orig.stamp],
  res: texts.map((t): [string, string] => [t.res, 'v42']),
  texts,
})

const wordsOf = (t: TextModel) => t.pieces.filter(([, isWord]) => isWord).length
const alignedOf = (t: TextModel) => (t.align ?? []).filter((positions) => positions.length > 0).length

// The independent side of the tests: the raw rows, read in the plainest way.

function rawText(node: unknown): string {
  if (typeof node === 'string') return node
  const content = (node as { content?: unknown[] }).content ?? []
  return content.map(rawText).join('')
}

/** The chapter chunks of `res` Titus, by chapter number (chunk 0 first), as the rows hold them. */
function rawChunks(rows: Row[], res: string): unknown[][] {
  const prefix = `scripture-usj:${res}:tit:`
  return rows
    .filter((row) => row.key.startsWith(prefix))
    .map((row) => ({ chapter: Number(row.key.slice(prefix.length)), content: (row.value as any).content.usj.content as unknown[] }))
    .sort((a, b) => a.chapter - b.chapter)
    .map((chunk) => chunk.content)
}

/** Every `\w`, in document order: its form, its verse id and the `x-content` of the milestones open around it, outer first. */
function rawWords(chunks: unknown[][]): { form: string; verse: number; stack: string[] }[] {
  const out: { form: string; verse: number; stack: string[] }[] = []
  const stack: string[] = []
  let chapter = 0
  let verse = 0
  const walk = (node: unknown): void => {
    if (typeof node === 'string') return
    const n = node as { type: string; marker?: string; number?: string; content?: unknown[]; [k: string]: unknown }
    if (n.type === 'chapter') {
      chapter = Number(n.number)
      verse = 0
    } else if (n.type === 'verse') {
      verse = Number(n.number)
    } else if (n.type === 'ms' && n.marker === 'zaln-s') {
      stack.push(n['x-content'] as string)
    } else if (n.type === 'ms' && n.marker === 'zaln-e') {
      stack.pop()
    } else if (n.type === 'char' && n.marker === 'w') {
      out.push({ form: rawText(n), verse: TIT + chapter * 1000 + verse, stack: [...stack] })
      return
    }
    for (const child of n.content ?? []) walk(child)
  }
  for (const chunk of chunks) for (const node of chunk) walk(node)
  return out
}

/**
 * The pieces of the raw rows in document order, with the one blank the builder adds (unless `blank` is false): a `" "` between
 * two word pieces that follow each other with nothing between them. The text nodes are pieces, a `w` is a word piece, nodes are walked into.
 */
function rawPieces(chunks: unknown[][], blank = true): [string, boolean][] {
  const out: [string, boolean][] = []
  const push = (text: string, isWord: boolean) => {
    if (blank && isWord && out.length > 0 && out[out.length - 1][1]) out.push([' ', false])
    out.push([text, isWord])
  }
  const walk = (node: unknown): void => {
    if (typeof node === 'string') return push(node, false)
    const n = node as { type: string; marker?: string; content?: unknown[] }
    if (n.type === 'char' && n.marker === 'w') return push(rawText(n), true)
    for (const child of n.content ?? []) walk(child)
  }
  for (const chunk of chunks) for (const node of chunk) walk(node)
  return out
}

/** The verse id of each word piece of a text, from its events alone. */
function wordVerses(t: TextModel): number[] {
  const out: number[] = []
  let event = 0
  let chapter = 0
  let verse = 0
  t.pieces.forEach(([, isWord], at) => {
    for (; event < t.events.length && t.events[event][0] <= at; event++) {
      const [, kind, arg] = t.events[event]
      if (kind === 'chapter') {
        chapter = parseInt(arg, 10)
        verse = 0
      } else if (kind === 'verse') verse = parseInt(arg, 10)
    }
    if (isWord) out.push(TIT + chapter * 1000 + verse)
  })
  return out
}

// A synthetic original and synthetic rows, for what the sample does not hold.

/** An original of Titus with the words you give, by chapter and verse label: `['1', '1', ['Παῦλος', 'δοῦλος']]`. */
function origIndex(verses: [chapter: string, verse: string, forms: string[]][]): OrigIndex {
  const words: OrigWord[] = []
  const pieces: Piece[] = []
  const events: Event[] = []
  let chapter = ''
  for (const [c, v, forms] of verses) {
    if (c !== chapter) {
      events.push([pieces.length, 'chapter', c])
      chapter = c
    }
    events.push([pieces.length, 'verse', v])
    for (const form of forms) {
      words.push({ form, lemma: '', strong: '', morph: '' })
      pieces.push([form, true])
    }
  }
  return new OrigIndex({ book: 'tit', key: UGNT, stamp: 'g987ab2025a', words, pieces, events })
}

const chapterRow = (res: string, chapter: number, content: unknown[], book = 'tit'): Row => ({
  layer: 'sot',
  key: `scripture-usj:${res}:${book}:${chapter}`,
  value: { bookId: book, chapter, content: { usj: { type: 'USJ', version: '3.1', content } }, resourceKey: res },
})
const bookRow = (res: string, book = 'tit'): Row => ({
  layer: 'sot',
  key: `scripture-usj:${res}:${book}`,
  value: { bookId: book, content: { book: book.toUpperCase(), bookCode: book, chapterNumbers: [1] }, resourceKey: res },
})

const chapterNode = (n: string) => ({ type: 'chapter', marker: 'c', number: n, sid: `TIT ${n}` })
const verseNode = (n: string) => ({ type: 'verse', marker: 'v', number: n, sid: `TIT 1:${n}` })
const para = (...content: unknown[]) => ({ type: 'para', marker: 'p', content })
const zs = (content: string, occurrence = '1') => ({
  type: 'ms',
  marker: 'zaln-s',
  'x-content': content,
  'x-lemma': 'λ',
  'x-occurrence': occurrence,
  'x-occurrences': '1',
  'x-strong': 'G1',
})
const ze = { type: 'ms', marker: 'zaln-e' }
const wd = (form: string) => ({ type: 'char', marker: 'w', 'x-occurrence': '1', 'x-occurrences': '1', content: [form] })

/** The text of chapter 1 with this content, against this original. */
const textOf = (index: OrigIndex, ...content: unknown[]) => extractText([chapterRow(GLT, 1, content)], 'tit', GLT, index)

describe('es-419 Titus from the data folder', () => {
  test('GLT has 1 913 pieces (1 416 and the 497 blanks between words), 953 words, 953 aligned, 69 events', async () => {
    const { glt1 } = await titus()
    expect(glt1.res).toBe(GLT)
    expect(glt1.pieces.length).toBe(1913)
    expect(wordsOf(glt1)).toBe(953)
    expect(glt1.align?.length).toBe(953)
    expect(alignedOf(glt1)).toBe(953)
    expect(glt1.events.length).toBe(69)
  })

  test('GST has 3 471 pieces (3 075 and the 396 blanks between words), 1 732 words, 1 732 aligned, 69 events', async () => {
    const { gst1 } = await titus()
    expect(gst1.res).toBe(GST)
    expect(gst1.pieces.length).toBe(3471)
    expect(wordsOf(gst1)).toBe(1732)
    expect(gst1.align?.length).toBe(1732)
    expect(alignedOf(gst1)).toBe(1732)
    expect(gst1.events.length).toBe(69)
  })

  test('nothing is missing: every milestone of the sample finds its word in this original', async () => {
    const { glt1, gst1 } = await titus()
    expect(glt1.alignMissing).toBeUndefined()
    expect(gst1.alignMissing).toBeUndefined()
  })

  test('joining the pieces of verse 1:1 of GLT starts with "Pablo, siervo de Dios"', async () => {
    const { glt1 } = await titus()
    const verses = glt1.events.filter((event) => event[1] === 'verse')
    const first = verses.findIndex((event) => event[2] === '1')
    const pieces = glt1.pieces.slice(verses[first][0], verses[first + 1][0])
    expect(pieces.map(([text]) => text).join('').startsWith('Pablo, siervo de Dios')).toBe(true)
    expect(pieces.slice(0, 7)).toEqual([['Pablo', true], [', ', false], ['siervo', true], [' ', false], ['de', true], [' ', false], ['Dios', true]])
  })

  test('no word piece follows a word piece: the 497 and 396 words of the rows that followed another word have a blank before them', async () => {
    const { glt, glt1, gst, gst1 } = await titus()
    for (const [rows, res, text, plain, blanks] of [[glt, GLT, glt1, 1416, 497], [gst, GST, gst1, 3075, 396]] as const) {
      text.pieces.forEach(([, isWord], i) => expect(isWord && i > 0 && text.pieces[i - 1][1]).toBe(false))
      // The pieces of the rows are the 1 416 and 3 075 of the spec before this rule; the rule adds one piece per pair.
      expect(rawPieces(rawChunks(rows, res), false).length).toBe(plain)
      expect(text.pieces.length).toBe(plain + blanks)
    }
  })

  test('joining all the pieces gives the text of the rows, in order, chunk 0 included, and one blank between words that follow each other', async () => {
    const { glt, glt1, gst, gst1 } = await titus()
    for (const [rows, res, text] of [[glt, GLT, glt1], [gst, GST, gst1]] as const) {
      const raw = rawChunks(rows, res)
      expect(raw.length).toBe(4)
      expect(text.pieces).toEqual(rawPieces(raw))
    }
  })

  test('the text of every verse of GLT is the text of the prepared row of format 2.0, but for a blank after « that only 2.0 adds', async () => {
    const { glt1 } = await titus()
    const prepared = await collect((await source()).rows({ lang: 'es-419', book: 'tit', resource: GLT, layer: 'prepared' }))
    // The text of each verse in the prepared rows, by "chapter:verse".
    const expected = new Map<string, string>()
    for (const chapter of [1, 2, 3]) {
      const row = prepared.find((r) => r.key.endsWith(`:tit:${chapter}:light`))!
      let key = ''
      for (const block of (row.value as any).content.blocks) {
        for (const item of block.inline as { kind: string; verseNumber?: number; text?: string }[]) {
          if (item.kind === 'verse') key = `${chapter}:${item.verseNumber}`
          else if (item.kind === 'text') expected.set(key, (expected.get(key) ?? '') + item.text)
        }
      }
    }
    // The text of each verse here: the pieces from its verse event to the next one.
    const actual = new Map<string, string>()
    const verses = glt1.events.filter((event) => event[1] === 'verse' || event[1] === 'chapter')
    let chapter = ''
    verses.forEach(([position, kind, arg], i) => {
      if (kind === 'chapter') return void (chapter = arg)
      const next = verses.slice(i + 1).find((event) => event[1] === 'verse')
      actual.set(`${chapter}:${arg}`, glt1.pieces.slice(position, next?.[0] ?? glt1.pieces.length).map(([text]) => text).join(''))
    })
    expect([...actual.keys()]).toEqual([...expected.keys()])
    expect(actual.size).toBe(46)
    // 2.0 trims nothing but puts its own blank at the start of a verse: compare without the blanks at both ends.
    const differ = [...actual.keys()].filter((key) => actual.get(key)!.trim() !== expected.get(key)!.trim())
    // One verse differs: the rows have "dijo: «Los cretenses" (no blank, as the USFM) and the prepared text "« Los".
    expect(differ).toEqual([...actual.keys()].filter((key) => expected.get(key)!.includes('« ')))
    expect(differ.length).toBe(1)
    for (const key of differ) expect(actual.get(key)!.trim()).toBe(expected.get(key)!.trim().replace(/« /g, '«'))
  })

  test('chunk 0 is the start of the text: the book code, its identification and the titles', async () => {
    const { glt1 } = await titus()
    expect(glt1.events.slice(0, 4)).toEqual([
      [0, 'open', 'book:id'],
      [1, 'close', ''],
      [1, 'open', 'para:ide'],
      [2, 'close', ''],
    ])
    expect(glt1.pieces[0][0].startsWith('EN_TPL es-419')).toBe(true)
    expect(glt1.pieces[1]).toEqual(['UTF-8', false])
    expect(glt1.attrs).toEqual({ 0: { code: 'TIT' } })
  })

  test('has the 3 chapters, the 46 verses and the 10 nodes of Titus as events, in order', async () => {
    const { glt1, gst1 } = await titus()
    for (const t of [glt1, gst1]) {
      const kinds = (kind: string) => t.events.filter((event) => event[1] === kind)
      expect(kinds('chapter').map((event) => event[2])).toEqual(['1', '2', '3'])
      expect(kinds('verse').length).toBe(46)
      expect(kinds('open').length).toBe(10)
      expect(kinds('close').length).toBe(10)
      expect(t.events.map((event) => event[0])).toEqual([...t.events.map((event) => event[0])].sort((a, b) => a - b))
    }
  })

  test('the word pieces are the \\w of the raw rows, in order', async () => {
    const { glt, glt1, gst, gst1 } = await titus()
    for (const [rows, res, text] of [[glt, GLT, glt1], [gst, GST, gst1]] as const) {
      const raw = rawWords(rawChunks(rows, res))
      expect(text.pieces.filter(([, isWord]) => isWord).map(([piece]) => piece)).toEqual(raw.map((word) => word.form))
    }
  })

  test('the positions of each word are the words of the original named by the milestones around it, outer first', async () => {
    const { glt, glt1, gst, gst1, orig } = await titus()
    for (const [rows, res, text] of [[glt, GLT, glt1], [gst, GST, gst1]] as const) {
      const raw = rawWords(rawChunks(rows, res))
      expect(text.align!.length).toBe(raw.length)
      text.align!.forEach((positions, i) => {
        expect(positions.map((position) => orig.words[position].form)).toEqual(raw[i].stack)
      })
    }
  })

  test('every position is a word of the same verse as the word that has it', async () => {
    const { glt1, gst1, index } = await titus()
    for (const t of [glt1, gst1]) {
      const verses = wordVerses(t)
      t.align!.forEach((positions, i) => {
        for (const position of positions) expect(index.verseOf(position)).toBe(verses[i])
      })
    }
  })

  test('the words of Titus 1:1 are aligned to Παῦλος, δοῦλος, Θεοῦ, Θεοῦ, δὲ, ἀπόστολος, then two for "de Jesucristo"', async () => {
    const { glt1, orig } = await titus()
    expect(orig.words.slice(0, 7).map((word) => word.form)).toEqual(['Παῦλος', 'δοῦλος', 'Θεοῦ', 'ἀπόστολος', 'δὲ', 'Ἰησοῦ', 'Χριστοῦ'])
    // Pablo, siervo, de, Dios, y, apóstol, de, Jesucristo. "y" (4) comes before "apóstol" (3): the lists are not sorted.
    expect(glt1.align!.slice(0, 8)).toEqual([[0], [1], [2], [2], [4], [3], [5, 6], [5, 6]])
  })

  test('only the rows of its own resource are read: the rows of GLT and GST together, the book row and other layers are not text', async () => {
    const { glt, gst, glt1, gst1, index } = await titus()
    const mixed: Row[] = [...gst, { layer: 'prepared', key: `scripture-usj:${GLT}:tit:9`, value: {} }, ...glt]
    expect(mixed.some((row) => row.key === `scripture-usj:${GLT}:tit`)).toBe(true)
    expect(extractText(mixed, 'tit', GLT, index)).toEqual(glt1)
    expect(extractText(mixed, 'tit', GST, index)).toEqual(gst1)
  })

  test('bookView(bookSegment(m)) is m (texts only)', async () => {
    const s = await titus()
    const m = bookOf(s, s.glt1)
    expect(bookView(bookSegment(m))).toEqual(m)
  })

  test('GLT and GST in one book segment survive the file: writeSegment, readSegment, bookView', async () => {
    const s = await titus()
    const m = bookOf(s, s.glt1, s.gst1)
    const { bytes, id } = await writeSegment(bookSegment(m))
    const read = await readSegment(bytes, { known: KNOWN, expectedId: id })
    expect(read.skipped).toEqual([])
    expect(read.seg.h.tables).toEqual({ strings: [1, true], texts: [1, true], align: [1, false] })
    expect(bookView(read.seg)).toEqual(m)
    expect(bookView(read.seg).texts.map((t) => t.res)).toEqual([GLT, GST])
    // 10 496 bytes when measured: the two texts with their alignment and the blanks, without the helps (phase 0: 35.4 KB with them).
    expect(bytes.length).toBeLessThan(12_000)
  })

  test('same model, same id', async () => {
    const s = await titus()
    const m = bookOf(s, s.glt1, s.gst1)
    const again = bookOf(s, extractText(s.glt, 'tit', GLT, s.index), extractText(s.gst, 'tit', GST, s.index))
    const [a, b] = [await writeSegment(bookSegment(m)), await writeSegment(bookSegment(again))]
    expect(b.id).toBe(a.id)
    expect(b.body).toEqual(a.body)
  })

  test('a reader that does not know `align` reads the texts without it', async () => {
    const s = await titus()
    const m = bookOf(s, s.glt1)
    const { bytes } = await writeSegment(bookSegment(m))
    const read = await readSegment(bytes, { known: { strings: [1], texts: [1] } })
    expect(read.skipped).toEqual(['align'])
    const view = bookView(read.seg)
    expect(view.texts[0].pieces).toEqual(m.texts[0].pieces)
    expect(view.texts[0].events).toEqual(m.texts[0].events)
    expect(view.texts[0].align).toBeUndefined()
    expect(view.texts[0].alignMissing).toBeUndefined()
  })
})

describe('a verse bridge', () => {
  // `verse 13-14`: the milestone's x-occurrence counts over the whole bridge, in order, so a word of the second verse is found.
  const index = origIndex([
    ['1', '13', ['α', 'β']],
    ['1', '14', ['γ', 'β', 'δ']],
    ['1', '15', ['γ']],
  ])
  const BRIDGE = 56_001_013
  const inBridge = (...content: unknown[]) => textOf(index, chapterNode('1'), para(verseNode('13-14'), ...content))

  test('a word of the second verse of the bridge is placed', () => {
    const t = inBridge(zs('δ'), wd('x'), ze, zs('α'), wd('y'), ze)
    expect(t.align).toEqual([[4], [0]])
    expect('alignMissing' in t).toBe(false)
  })

  test('the occurrence counts over the whole bridge: the same form in both verses', () => {
    const t = inBridge(zs('β', '1'), wd('uno'), ze, zs('β', '2'), wd('dos'), ze, zs('β', '3'), wd('tres'), ze)
    expect(t.align).toEqual([[1], [3], []])
    expect(t.alignMissing).toEqual([[2, BRIDGE, 'β', 3]])
  })

  test('a word the bridge lacks is in alignMissing under the first verse of the bridge, and the next verse is not searched', () => {
    // γ is in verse 14 (once) and in verse 15: the second γ of "13-14" does not exist, the one of verse 15 is not in the bridge.
    const t = inBridge(zs('γ', '2'), wd('x'), ze)
    expect(t.align).toEqual([[]])
    expect(t.alignMissing).toEqual([[0, BRIDGE, 'γ', 2]])
  })

  test('the folded form is tried over the bridge too, after the exact one', () => {
    const folded = origIndex([
      ['1', '13', ['a/b']],
      ['1', '14', ['ab', 'c/d']],
    ])
    const t = textOf(folded, chapterNode('1'), para(verseNode('13-14'), zs('cd'), wd('x'), ze, zs('ab', '1'), wd('y'), ze, zs('ab', '2'), wd('z'), ze))
    // "ab" exact is the word 1 (verse 14); "ab" occurrence 2 is not exact, so the folded forms are counted: a/b (0), ab (1).
    expect(t.align).toEqual([[2], [1], [1]])
  })

  test('a label that is not a range is one verse, as before', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('13'), zs('δ'), wd('x'), ze))
    expect(t.align).toEqual([[]])
    expect(t.alignMissing).toEqual([[0, BRIDGE, 'δ', 1]])
    // A label with a second number that is not above the first, or a letter after it, is one verse too.
    for (const label of ['13-13', '13-12', '13a', '13-', '13-1000']) {
      expect(textOf(index, chapterNode('1'), para(verseNode(label), zs('δ'), wd('x'), ze)).align).toEqual([[]])
    }
  })

  test('the verse after the bridge is a verse again', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('13-14'), zs('δ'), wd('x'), ze, verseNode('15'), zs('δ'), wd('y'), ze))
    expect(t.align).toEqual([[4], []])
    expect(t.alignMissing).toEqual([[1, 56_001_015, 'δ', 1]])
  })

  test('a bridge does not carry over a chapter', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('13-14')), chapterNode('2'), para(zs('δ'), wd('x'), ze))
    expect(t.alignMissing).toEqual([[0, 56_002_000, 'δ', 1]])
  })
})

describe('what the milestones give a word', () => {
  const index = origIndex([
    ['1', '1', ['Παῦλος', 'δοῦλος', 'Θεοῦ', 'δὲ', 'Θεοῦ']],
    ['1', '2', ['Παῦλος']],
  ])

  test('a word with nothing open has no positions, and a text with no milestone has no alignment at all', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), wd('Pablo'), ' ', wd('siervo'), '.'))
    expect(t.pieces).toEqual([['Pablo', true], [' ', false], ['siervo', true], ['.', false]])
    expect('align' in t).toBe(false)
    expect('alignMissing' in t).toBe(false)
  })

  test('a milestone that spans several words gives each of them its position; a word outside it has none', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), zs('Θεοῦ'), wd('de'), ' ', wd('Dios'), ze, ' ', wd('y')))
    expect(t.align).toEqual([[2], [2], []])
    expect('alignMissing' in t).toBe(false)
  })

  test('milestones one inside the other give their positions from the outer to the inner one, not sorted', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), zs('Θεοῦ'), zs('Παῦλος'), wd('Pablo'), ze, wd('de'), ze, wd('x')))
    // Θεοῦ is the word 2 and Παῦλος the word 0: [2, 0] for "Pablo", [2] for "de".
    expect(t.align).toEqual([[2, 0], [2], []])
  })

  test('the occurrence picks the n-th word of the verse with that form', () => {
    const t = textOf(
      index,
      chapterNode('1'),
      para(verseNode('1'), zs('Θεοῦ', '1'), wd('uno'), ze, zs('Θεοῦ', '2'), wd('dos'), ze, zs('Θεοῦ', '3'), wd('tres'), ze),
    )
    expect(t.align).toEqual([[2], [4], []])
    expect(t.alignMissing).toEqual([[2, TIT + 1001, 'Θεοῦ', 3]])
  })

  test('the word is looked for in the verse that is open, so the same form in verse 2 is another position', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), zs('Παῦλος'), wd('Pablo'), ze, verseNode('2'), zs('Παῦλος'), wd('Pablo'), ze))
    expect(t.align).toEqual([[0], [5]])
  })

  test('a milestone whose x-content the original lacks puts that word in alignMissing, with no position', () => {
    const t = textOf(
      index,
      chapterNode('1'),
      para(verseNode('1'), zs('Παῦλος'), wd('Pablo'), ze, ' ', zs('Ἰησοῦ'), wd('Jesús'), ze, '.'),
    )
    expect(t.align).toEqual([[0], []])
    expect(t.alignMissing).toEqual([[1, 56_001_001, 'Ἰησοῦ', 1]])
  })

  test('a word with one milestone found and one not keeps the position, and has the other in alignMissing', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), zs('Ἰησοῦ'), zs('δοῦλος'), wd('de'), ze, wd('Jesús'), ze))
    expect(t.align).toEqual([[1], []])
    expect(t.alignMissing).toEqual([
      [0, 56_001_001, 'Ἰησοῦ', 1],
      [1, 56_001_001, 'Ἰησοῦ', 1],
    ])
  })

  test('a text whose milestones are all missing is still an aligned text: align is there, every list empty', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), zs('Ἰησοῦ'), wd('Jesús'), ze))
    expect(t.align).toEqual([[]])
    expect(t.alignMissing).toEqual([[0, 56_001_001, 'Ἰησοῦ', 1]])
  })

  test('a milestone in a verse the original does not have is missing, with the id of that verse', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('5'), zs('Παῦλος'), wd('Pablo'), ze))
    expect(t.alignMissing).toEqual([[0, 56_001_005, 'Παῦλος', 1]])
  })

  test('before the first chapter and the first verse the id is the introduction of the book, then of the chapter', () => {
    const t = extractText(
      [
        chapterRow(GLT, 0, [{ type: 'para', marker: 'mt', content: [zs('Παῦλος'), wd('Tito'), ze] }]),
        chapterRow(GLT, 1, [chapterNode('1'), para(zs('Παῦλος'), wd('Pablo'), ze, verseNode('1'))]),
      ],
      'tit',
      GLT,
      index,
    )
    expect(t.alignMissing).toEqual([
      [0, TIT, 'Παῦλος', 1],
      [1, TIT + 1000, 'Παῦλος', 1],
    ])
  })

  test('a milestone that closes with nothing open, and one that never closes, are tolerated', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), ze, wd('a'), zs('Παῦλος'), wd('Pablo')))
    expect(t.align).toEqual([[], [0]])
  })

  test('a milestone without x-content is refused', () => {
    const noContent = { type: 'ms', marker: 'zaln-s', 'x-occurrence': '1' }
    expect(() => textOf(index, chapterNode('1'), para(verseNode('1'), noContent, wd('a'), ze))).toThrow(/x-content/)
    expect(() => textOf(index, chapterNode('1'), para(verseNode('1'), { ...noContent, 'x-content': 7 }, wd('a'), ze))).toThrow(/x-content/)
  })

  test('an x-occurrence of 0, or one above 2^53 - 1, is not usable either: not placed, occurrence 0, one line each', () => {
    const issues: string[] = []
    const rows = [
      chapterRow(GLT, 1, [
        chapterNode('1'),
        para(verseNode('1'), zs('Παῦλος', '0'), wd('a'), ze, zs('Παῦλος', '9007199254740993'), wd('b'), ze, zs('Παῦλος', '00'), wd('c'), ze, zs('Παῦλος', '007'), wd('d'), ze, zs('Παῦλος', '9007199254740991'), wd('e'), ze, zs('Παῦλος', '01'), wd('f'), ze),
      ]),
    ]
    const t = extractText(rows, 'tit', GLT, index, issues)
    // 0, 2^53 + 1 and 00 are not usable (occurrence 0, a line each). 007 is the seventh and 2^53 - 1 the 9007199254740991st: usable, and the verse
    // has one Παῦλος, so they find nothing. 01 is the first one.
    expect(t.align).toEqual([[], [], [], [], [], [0]])
    expect(t.alignMissing).toEqual([
      [0, 56_001_001, 'Παῦλος', 0],
      [1, 56_001_001, 'Παῦλος', 0],
      [2, 56_001_001, 'Παῦλος', 0],
      [3, 56_001_001, 'Παῦλος', 7],
      [4, 56_001_001, 'Παῦλος', 9007199254740991],
    ])
    expect(issues).toHaveLength(3)
    expect(issues[0]).toContain('"0"')
    expect(issues[1]).toContain('"9007199254740993"')
  })

  // Real data: the GST of Ruth (es-419, chapter 4) has a zaln-s of "שֵׁ֖ם" without x-occurrence, which went into x-morph ("x-occurrence1").
  test('a milestone without a usable x-occurrence does not stop the build: its words are in alignMissing with occurrence 0, and a line says so', async () => {
    const broken = { type: 'ms', marker: 'zaln-s', 'x-content': 'Παῦλος', 'x-lemma': 'λ', 'x-morph': 'x-occurrence1', 'x-occurrences': '1', 'x-strong': 'G1' }
    const issues: string[] = []
    const rows = [
      chapterRow(GLT, 1, [
        chapterNode('1'),
        para(verseNode('1'), broken, wd('Pablo'), ze, { ...zs('Παῦλος'), 'x-occurrence': 'uno' }, wd('es'), ze, { ...zs('δοῦλος'), 'x-occurrence': '' }, wd('siervo'), ze, zs('Παῦλος'), wd('ok'), ze),
      ]),
    ]
    const t = extractText(rows, 'tit', GLT, index, issues)
    expect(t.align).toEqual([[], [], [], [0]])
    expect(t.alignMissing).toEqual([
      [0, 56_001_001, 'Παῦλος', 0],
      [1, 56_001_001, 'Παῦλος', 0],
      [2, 56_001_001, 'δοῦλος', 0],
    ])
    expect(issues).toHaveLength(3)
    expect(issues[0]).toContain(`scripture-usj:${GLT}:tit:1`)
    expect(issues[0]).toContain('Παῦλος')
    expect(issues[0]).toContain('x-occurrence')
    expect(issues[1]).toContain('"uno"')
    // The text still goes through the whole way: the segment holds the missing words and a reader gives them back.
    const { bytes } = await writeSegment(bookSegment({ lang: 'es-419', book: 'tit', orig: ['o', 'v1'], res: [[GLT, 'v42']], texts: [t] }))
    const view = bookView((await readSegment(bytes, { known: KNOWN })).seg)
    expect(view.texts[0].alignMissing).toEqual(t.alignMissing)
  })

  test('a broken Hebrew form still finds its word: the original has "/" and U+2060, the text NFD', () => {
    const first = 'בְּ/רֵאשִׁ֖ית'
    const second = `ב${WORD_JOINER}ָּרָ֣א`
    const hebrew = origIndex([['1', '1', [first, second]]])
    const decomposed = (s: string) => s.replace(/[/\u2060]/g, '').normalize('NFD')
    const t = textOf(
      hebrew,
      chapterNode('1'),
      para(verseNode('1'), zs(decomposed(first)), wd('Principio'), ze, zs(second.replace(WORD_JOINER, '')), wd('creó'), ze, zs('לא'), wd('no'), ze),
    )
    expect(t.align).toEqual([[0], [1], []])
    expect(t.alignMissing).toEqual([[2, 56_001_001, 'לא', 1]])
  })
})

describe('the document, node by node', () => {
  const index = origIndex([['1', '1', ['Παῦλος']]])

  test('a verse published as 1-2 keeps its label, takes the id of its first number, and the next verse is 3', () => {
    const t = textOf(
      index,
      chapterNode('1'),
      para(verseNode('1-2'), zs('Παῦλος'), wd('Pablo'), ze, verseNode('3'), zs('Παῦλος'), wd('Pablo'), ze),
    )
    expect(t.events.filter((event) => event[1] === 'verse')).toEqual([
      [0, 'verse', '1-2'],
      [1, 'verse', '3'],
    ])
    expect(t.align).toEqual([[0], []])
    expect(t.alignMissing).toEqual([[1, 56_001_003, 'Παῦλος', 1]])
  })

  test('a chapter and a verse that are not numbers are refused', () => {
    expect(() => textOf(index, chapterNode('uno'), para(wd('a')))).toThrow()
    expect(() => textOf(index, chapterNode('1'), para(verseNode('x'), wd('a')))).toThrow()
  })

  test('x-occurrence and x-occurrences of \\w, and every other attribute of it, are not kept; sid is not either', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), { ...wd('Pablo'), lemma: 'l', strong: 's' }, ' ', wd('y')))
    expect(t.pieces).toEqual([['Pablo', true], [' ', false], ['y', true]])
    expect(t.events).toEqual([
      [0, 'chapter', '1'],
      [0, 'open', 'para:p'],
      [0, 'verse', '1'],
      [3, 'close', ''],
    ])
    expect(t.attrs).toBeUndefined()
  })

  test('attributes of other nodes go to attrs by the index of their event, and sid and eid do not', () => {
    const t = textOf(
      index,
      chapterNode('1'),
      { type: 'para', marker: 'q1', style: 'poetry', content: [verseNode('1'), { type: 'note', marker: 'f', caller: '+', content: ['See ', wd('Pablo'), '.'] }] },
      { type: 'ms', marker: 'qt-s', sid: 'qt_1', who: 'Dios' },
      { type: 'ms', marker: 'qt-e', eid: 'qt_1' },
    )
    expect(t.events).toEqual([
      [0, 'chapter', '1'],
      [0, 'open', 'para:q1'],
      [0, 'verse', '1'],
      [0, 'open', 'note:f'],
      [3, 'close', ''],
      [3, 'close', ''],
      [3, 'open', 'ms:qt-s'],
      [3, 'close', ''],
      [3, 'open', 'ms:qt-e'],
      [3, 'close', ''],
    ])
    expect(t.attrs).toEqual({ 1: { style: 'poetry' }, 3: { caller: '+' }, 6: { who: 'Dios' } })
    expect(t.pieces).toEqual([['See ', false], ['Pablo', true], ['.', false]])
  })

  test('a milestone that is not an alignment one opens and closes at the same position', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), wd('Pablo'), { type: 'ms', marker: 'ts' }, ' ', wd('y')))
    expect(t.events.slice(3)).toEqual([
      [1, 'open', 'ms:ts'],
      [1, 'close', ''],
      [3, 'close', ''],
    ])
  })

  test('the alignment milestones are not events, and a node without a marker opens as its type', () => {
    const t = textOf(index, chapterNode('1'), { type: 'table', content: [verseNode('1'), zs('Παῦλος'), wd('Pablo'), ze] })
    expect(t.events).toEqual([
      [0, 'chapter', '1'],
      [0, 'open', 'table'],
      [0, 'verse', '1'],
      [1, 'close', ''],
    ])
  })

  test('a word inside a footnote is a word of the text and takes its milestones', () => {
    const t = textOf(
      index,
      chapterNode('1'),
      para(verseNode('1'), { type: 'note', marker: 'f', content: ['See ', zs('Παῦλος'), wd('Pablo'), ze] }),
    )
    expect(t.pieces).toEqual([['See ', false], ['Pablo', true]])
    expect(t.align).toEqual([[0]])
  })

  test('the text of a word is all the text inside it', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), { type: 'char', marker: 'w', content: ['Pa', { type: 'char', marker: 'nd', content: ['blo'] }] }))
    expect(t.pieces).toEqual([['Pablo', true]])
  })

  test('text is kept as published: no trimming, no normalization, empty strings stay', () => {
    const odd = ' é́ '
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), odd, '', wd(odd)))
    expect(t.pieces).toEqual([[odd, false], ['', false], [odd, true]])
  })

  test('chapters are read in numeric order whatever the order of the rows, and the book row is not text', () => {
    const rows = [
      chapterRow(GLT, 10, [chapterNode('10')]),
      bookRow(GLT),
      chapterRow(GLT, 2, [chapterNode('2')]),
      chapterRow(GLT, 0, [{ type: 'para', marker: 'h', content: ['Tito'] }]),
    ]
    const t = extractText(rows, 'tit', GLT, index)
    expect(t.events.filter((event) => event[1] === 'chapter').map((event) => event[2])).toEqual(['2', '10'])
    expect(t.pieces).toEqual([['Tito', false]])
  })

  test('refuses rows with no text of the book in that resource, a chapter twice, and a row without a USJ document', () => {
    expect(() => extractText([bookRow(GLT)], 'tit', GLT, index)).toThrow(/no text/)
    expect(() => extractText([chapterRow(GST, 1, [chapterNode('1')])], 'tit', GLT, index)).toThrow(/no text/)
    expect(() => extractText([chapterRow(GLT, 1, [chapterNode('1')], 'gen')], 'tit', GLT, index)).toThrow(/no text/)
    expect(() => extractText([chapterRow(GLT, 1, [chapterNode('1')]), chapterRow(GLT, 1, [chapterNode('1')])], 'tit', GLT, index)).toThrow(/twice/)
    expect(() => extractText([{ layer: 'sot', key: `scripture-usj:${GLT}:tit:1`, value: { content: {} } }], 'tit', GLT, index)).toThrow(/USJ/)
    expect(() => extractText([chapterRow(GLT, 1, [{ marker: 'p' }])], 'tit', GLT, index)).toThrow(/type/)
    expect(() => extractText([chapterRow(GLT, 1, [{ type: 'para', marker: 'p', style: 1, content: [] }])], 'tit', GLT, index)).toThrow(/style/)
  })
})

describe('the blank between two words that follow each other', () => {
  const index = origIndex([['1', '1', ['Παῦλος', 'δοῦλος', 'Θεοῦ']]])
  const blank: Piece = [' ', false]

  test('two words with only alignment milestones between them get a blank piece, which is not a word', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), zs('Παῦλος'), wd('Pablo'), ze, zs('δοῦλος'), wd('siervo'), ze))
    expect(t.pieces).toEqual([['Pablo', true], blank, ['siervo', true]])
    // The words are counted as before: the blank is not a word, and the alignment goes by words.
    expect(t.align).toEqual([[0], [1]])
  })

  test('three in a row, a word that opens two milestones, and words that are not aligned', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), zs('Θεοῦ'), zs('Παῦλος'), wd('a'), ze, wd('b'), ze, wd('c')))
    expect(t.pieces).toEqual([['a', true], blank, ['b', true], blank, ['c', true]])
    expect(t.align).toEqual([[2, 0], [2], []])
  })

  test('a word followed by punctuation or by text gets no extra blank, and the blank is not doubled where one is already', () => {
    const t = textOf(
      index,
      chapterNode('1'),
      para(verseNode('1'), wd('a'), ', ', wd('b'), ' ', wd('c'), wd('d'), '.', wd('e'), ' ', wd('f')),
    )
    expect(t.pieces).toEqual([
      ['a', true],
      [', ', false],
      ['b', true],
      [' ', false],
      ['c', true],
      blank,
      ['d', true],
      ['.', false],
      ['e', true],
      [' ', false],
      ['f', true],
    ])
  })

  test('a word followed by a note that begins with text gets no blank; the last word of the note and the word after it, one', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), wd('a'), { type: 'note', marker: 'f', content: ['See ', wd('x')] }, wd('b')))
    expect(t.pieces).toEqual([['a', true], ['See ', false], ['x', true], blank, ['b', true]])
    expect(t.events.filter((event) => event[1] !== 'chapter' && event[1] !== 'verse')).toEqual([
      [0, 'open', 'para:p'],
      [1, 'open', 'note:f'],
      // The note closes before the blank, which is outside it.
      [3, 'close', ''],
      [5, 'close', ''],
    ])
  })

  test('the events keep their meaning, pieces before them, and shift past the blanks', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), wd('a'), wd('b'), { type: 'ms', marker: 'ts' }, wd('c')))
    expect(t.pieces).toEqual([['a', true], blank, ['b', true], blank, ['c', true]])
    expect(t.events).toEqual([
      [0, 'chapter', '1'],
      [0, 'open', 'para:p'],
      [0, 'verse', '1'],
      // The milestone is between "b" and the blank before "c": it is after 3 pieces.
      [3, 'open', 'ms:ts'],
      [3, 'close', ''],
      [5, 'close', ''],
    ])
  })

  test('an event between two words comes before the blank: a verse that starts with a word after a word starts with the blank', () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), wd('a'), verseNode('2'), wd('b')))
    expect(t.pieces).toEqual([['a', true], blank, ['b', true]])
    expect(t.events.filter((event) => event[1] === 'verse')).toEqual([
      [0, 'verse', '1'],
      [1, 'verse', '2'],
    ])
  })

  test('across the chunks of a chapter, and across paragraphs: a word piece after a word piece gets the blank wherever it is', () => {
    const t = extractText(
      [chapterRow(GLT, 1, [chapterNode('1'), para(verseNode('1'), wd('a'))]), chapterRow(GLT, 2, [chapterNode('2'), para(verseNode('1'), wd('b'))])],
      'tit',
      GLT,
      index,
    )
    expect(t.pieces).toEqual([['a', true], blank, ['b', true]])
    const p = textOf(index, chapterNode('1'), para(verseNode('1'), wd('a')), para(wd('b')))
    expect(p.pieces).toEqual([['a', true], blank, ['b', true]])
  })

  test('the blank is a piece like any other in the segment: it round-trips, and counts as one use of the string " "', async () => {
    const t = textOf(index, chapterNode('1'), para(verseNode('1'), zs('Παῦλος'), wd('Pablo'), ze, zs('δοῦλος'), wd('siervo'), ze))
    const m: BookModel = { lang: 'es-419', book: 'tit', orig: [UGNT, 'g987ab2025a'], res: [[GLT, 'v42']], texts: [t] }
    expect(bookView(bookSegment(m))).toEqual(m)
    expect(bookSegment(m).t.strings).toContain(' ')
  })
})

describe('the segment, byte by byte', () => {
  const tiny: BookModel = {
    lang: 'es-419',
    book: 'tit',
    orig: [UGNT, 'g987ab2025a'],
    res: [[GLT, 'v42']],
    texts: [
      {
        res: GLT,
        pieces: [['Pablo', true], [', ', false], ['siervo', true], [' ', false], ['de', true], ['.', false]],
        events: [
          [0, 'chapter', '1'],
          [0, 'open', 'para:p'],
          [0, 'verse', '1'],
          [6, 'close', ''],
        ],
        attrs: { 1: { style: 'x' } },
        align: [[5], [], [3, 9]],
      },
    ],
  }

  test('the header', () => {
    expect(bookSegment(tiny).h).toEqual({
      class: 'book',
      v: 1,
      tables: { strings: [1, true], texts: [1, true], align: [1, false] },
      lang: 'es-419',
      book: 'tit',
      orig: [UGNT, 'g987ab2025a'],
      res: [[GLT, 'v42']],
    })
  })

  test('strings: every piece, word or not, and every argument, most used first, ties by code point', () => {
    const { strings } = bookSegment(tiny).t as { strings: string[] }
    // "1" is used twice (the chapter and the verse), the rest once.
    expect(strings).toEqual(['1', ' ', ', ', '.', 'Pablo', 'de', 'para:p', 'siervo'])
  })

  test('texts: tok is the string number times 2, plus 1 for a word; ev is three numbers per event; attrs by event', () => {
    const [text] = (bookSegment(tiny).t as { texts: any[] }).texts
    expect(text.res).toBe(0)
    expect(decodeUvarints(text.tok)).toEqual([9, 4, 15, 2, 11, 6])
    // Per event: pieces since the previous event, the code (0 chapter, 1 verse, 2 open, 3 close), the argument.
    expect(decodeUvarints(text.ev)).toEqual([0, 0, 0, 0, 2, 6, 0, 1, 0, 6, 3, 0])
    expect(text.attrs).toEqual([[1, { style: 'x' }]])
  })

  test('align: per word, k and then k positions as zigzag deltas of the previous position written, across words', () => {
    const [entry] = (bookSegment(tiny).t as { align: any[] }).align
    // Word 0: k = 1, 5 - 0 = 5 (zigzag 10). Word 1: k = 0. Word 2: k = 2, 3 - 5 = -2 (zigzag 3), 9 - 3 = 6 (zigzag 12).
    expect(decodeUvarints(entry.words)).toEqual([1, 10, 0, 2, 3, 12])
    expect('missing' in entry).toBe(false)
  })

  test('align: the first position of a word is the difference to the last one written, even after words without any', () => {
    const m: BookModel = {
      ...tiny,
      texts: [
        {
          res: GLT,
          pieces: [['a', true], ['b', true], ['c', true], ['d', true]],
          events: [],
          align: [[2], [], [], [1, 0]],
        },
      ],
    }
    const [entry] = (bookSegment(m).t as { align: any[] }).align
    // 2 (zigzag 4); nothing; nothing; k = 2: 1 - 2 = -1 (zigzag 1), 0 - 1 = -1 (zigzag 1).
    expect(decodeUvarints(entry.words)).toEqual([1, 4, 0, 0, 2, 1, 1])
    expect(bookView(bookSegment(m))).toEqual(m)
  })

  test('align: missing is a list of [word, verse, original, occurrence], and the file keeps it', async () => {
    const m: BookModel = {
      ...tiny,
      texts: [{ ...tiny.texts[0], align: [[5], [], []], alignMissing: [[2, 56_001_001, 'Ἰησοῦ', 1], [2, 56_001_001, 'Χριστοῦ', 2]] }],
    }
    const [entry] = (bookSegment(m).t as { align: any[] }).align
    expect(entry.missing).toEqual([[2, 56_001_001, 'Ἰησοῦ', 1], [2, 56_001_001, 'Χριστοῦ', 2]])
    const { bytes } = await writeSegment(bookSegment(m))
    expect(bookView((await readSegment(bytes, { known: KNOWN })).seg)).toEqual(m)
  })

  test('texts without alignment have no align table, in the header or in the tables, and come back as they were', async () => {
    const plain: BookModel = { ...tiny, texts: [{ ...tiny.texts[0] }] }
    delete plain.texts[0].align
    const seg = bookSegment(plain)
    expect(seg.h.tables).toEqual({ strings: [1, true], texts: [1, true] })
    expect(Object.keys(seg.t).sort()).toEqual(['strings', 'texts'])
    const { bytes } = await writeSegment(seg)
    const view = bookView((await readSegment(bytes, { known: KNOWN })).seg)
    expect(view).toEqual(plain)
    expect('align' in view.texts[0]).toBe(false)
  })

  test('one text with alignment and one without: the table has an entry for each, and each comes back as it was', async () => {
    const second: TextModel = { res: GST, pieces: [['Pablo', true]], events: [] }
    const m: BookModel = { ...tiny, res: [[GLT, 'v42'], [GST, 'v7']], texts: [tiny.texts[0], second] }
    const seg = bookSegment(m)
    const align = seg.t.align as any[]
    expect(align.length).toBe(2)
    expect(decodeUvarints(align[1].words)).toEqual([0])
    const { bytes } = await writeSegment(seg)
    const view = bookView((await readSegment(bytes, { known: KNOWN })).seg)
    expect(view).toEqual(m)
    expect('align' in view.texts[1]).toBe(false)
  })

  test('a text names its resource by the index in the header', () => {
    const second: TextModel = { res: GST, pieces: [['a', true]], events: [] }
    const m: BookModel = { ...tiny, res: [[GLT, 'v42'], [GST, 'v7']], texts: [second, tiny.texts[0]] }
    expect((bookSegment(m).t.texts as any[]).map((t) => t.res)).toEqual([1, 0])
  })

  test('strings outside the BMP sort by code point in the string table', () => {
    const m: BookModel = {
      ...tiny,
      texts: [{ res: GLT, pieces: [['\u{1D538}', false], ['￿', false], ['\u{1D538}￿', true]], events: [] }],
    }
    // UTF-16 order would put "\u{1D538}" before "￿".
    expect(bookSegment(m).t.strings).toEqual(['￿', '\u{1D538}', '\u{1D538}￿'])
  })

  test('the words of every text share one table: a string used by two texts counts twice', () => {
    const m: BookModel = {
      ...tiny,
      res: [[GLT, 'v42'], [GST, 'v7']],
      texts: [
        { res: GLT, pieces: [['b', true], ['a', true]], events: [] },
        { res: GST, pieces: [['b', true], ['c', true]], events: [] },
      ],
    }
    expect(bookSegment(m).t.strings).toEqual(['b', 'a', 'c'])
  })

  test('same bytes and id whatever the order the keys of attrs were added in', async () => {
    const a: BookModel = { ...tiny, texts: [{ ...tiny.texts[0], attrs: { 1: { z: '1', a: '2' }, 3: { b: '1' } } }] }
    const b: BookModel = { ...tiny, texts: [{ ...tiny.texts[0], attrs: { 3: { b: '1' }, 1: { a: '2', z: '1' } } }] }
    const [x, y] = [await writeSegment(bookSegment(a)), await writeSegment(bookSegment(b))]
    expect(y.id).toBe(x.id)
    expect(y.bytes).toEqual(x.bytes)
  })

  test('positions and verse ids above 2^31 are written and read exactly', async () => {
    const m: BookModel = {
      ...tiny,
      texts: [{ res: GLT, pieces: [['a', true], ['b', true]], events: [], align: [[2 ** 40], [2 ** 41, 0]], alignMissing: [[0, 2 ** 40, 'x', 1]] }],
    }
    const { bytes } = await writeSegment(bookSegment(m))
    expect(bookView((await readSegment(bytes, { known: KNOWN })).seg)).toEqual(m)
  })

  test('a text with no word at all: no align table, and the nodes and the pieces come back', async () => {
    const m: BookModel = { ...tiny, texts: [{ res: GLT, pieces: [['Tito', false]], events: [[0, 'open', 'para:h'], [1, 'close', '']] }] }
    const { bytes } = await writeSegment(bookSegment(m))
    expect(bookView((await readSegment(bytes, { known: KNOWN })).seg)).toEqual(m)
  })
})

describe('a book as long as Psalms', () => {
  // 30 000 words (60 000 pieces with the blanks), one aligned position each, a verse every 20 words. Every step has to be linear in the
  // words and the pieces: a pass over all the pieces for each word takes 30 000 x 60 000 steps, and the bound below is far from it.
  const WORDS = 30_000
  const BOUND_MS = 3_000
  const model = (): BookModel => {
    const pieces: Piece[] = []
    const events: Event[] = [[0, 'chapter', '1']]
    const align: number[][] = []
    for (let i = 0; i < WORDS; i++) {
      if (i % 20 === 0) events.push([pieces.length, 'verse', String(i / 20 + 1)])
      if (i > 0) pieces.push([' ', false])
      pieces.push([`w${i % 3000}`, true])
      align.push([i])
    }
    return { lang: 'es-419', book: 'psa', orig: [UGNT, 'g987ab2025a'], res: [[GLT, 'v42']], texts: [{ res: GLT, pieces, events, align }] }
  }
  const time = async <T>(step: () => T | Promise<T>): Promise<[T, number]> => {
    const start = performance.now()
    const result = await step()
    return [result, performance.now() - start]
  }

  test('bookSegment, writeSegment, readSegment and bookView take well under three seconds on 30 000 words, and nothing is lost', async () => {
    const m = model()
    const [seg, building] = await time(() => bookSegment(m))
    const [written, writing] = await time(() => writeSegment(seg))
    const [read, reading] = await time(() => readSegment(written.bytes, { known: KNOWN }))
    const [view, viewing] = await time(() => bookView(read.seg))
    for (const ms of [building, writing, reading, viewing]) expect(ms).toBeLessThan(BOUND_MS)
    expect(view).toEqual(m)
  })
})

describe('bookSegment refuses a model the segment cannot hold', () => {
  const base = (): BookModel => ({
    lang: 'es-419',
    book: 'tit',
    orig: [UGNT, 'g987ab2025a'],
    res: [[GLT, 'v42']],
    texts: [
      {
        res: GLT,
        pieces: [['a', true], [' ', false], ['b', true]],
        events: [
          [0, 'open', 'para:p'],
          [3, 'close', ''],
        ],
        align: [[0], [1]],
        alignMissing: [[1, 56_001_001, 'x', 1]],
      },
    ],
  })
  const broken: [string, (m: BookModel) => void][] = [
    ['a book that is not three lowercase letters or digits', (m) => void (m.book = 'TIT')],
    ['a header with no resource', (m) => void (m.res = [])],
    ['a resource twice', (m) => void m.res.push([GLT, 'v43'])],
    ['a text of a resource the header does not list', (m) => void (m.texts[0].res = GST)],
    ['an align list too short', (m) => void (m.texts[0].align = [[0]])],
    ['an align list too long', (m) => void m.texts[0].align!.push([2])],
    ['a negative position', (m) => void (m.texts[0].align![0] = [-1])],
    ['a position that is not an integer', (m) => void (m.texts[0].align![0] = [0.5])],
    ['a position above 2^53 - 1', (m) => void (m.texts[0].align![0] = [2 ** 53])],
    [
      'an align that aligns nothing and misses nothing',
      (m) => {
        m.texts[0].align = [[], []]
        delete m.texts[0].alignMissing
      },
    ],
    ['alignMissing without align', (m) => void delete m.texts[0].align],
    ['an empty alignMissing', (m) => void (m.texts[0].alignMissing = [])],
    ['a missing word that is not a word of the text', (m) => void (m.texts[0].alignMissing = [[2, 56_001_001, 'x', 1]])],
    ['a missing verse that is negative', (m) => void (m.texts[0].alignMissing = [[0, -1, 'x', 1]])],
    ['a missing occurrence that is not an integer', (m) => void (m.texts[0].alignMissing = [[0, 56_001_001, 'x', 1.5]])],
    ['a missing original that is not text', (m) => void (m.texts[0].alignMissing = [[0, 56_001_001, 7 as never, 1]])],
    ['an event after the end of the pieces', (m) => void (m.texts[0].events[1] = [4, 'close', ''])],
    ['events that go backwards', (m) => void m.texts[0].events.unshift([1, 'verse', '1'])],
    ['an event at a negative position', (m) => void (m.texts[0].events[0] = [-1, 'open', 'para:p'])],
    ['a close with an argument', (m) => void (m.texts[0].events[1] = [3, 'close', 'para:p'])],
    ['a kind that is not one of the four', (m) => void (m.texts[0].events[0] = [0, 'milestone' as 'open', 'ts'])],
    ['attributes of an event that does not exist', (m) => void (m.texts[0].attrs = { 2: { a: 'b' } })],
    ['attributes of an event named by a string that is not a number', (m) => void (m.texts[0].attrs = { x: { a: 'b' } } as never)],
  ]
  for (const [name, change] of broken) {
    test(name, () => {
      const m = base()
      change(m)
      expect(() => bookSegment(m)).toThrow()
    })
  }
  test('the base model itself is fine', () => {
    expect(bookView(bookSegment(base()))).toEqual(base())
  })
  test('a piece with a lone surrogate has no UTF-8 form, so the file is not written', async () => {
    const m = base()
    m.texts[0].pieces[1] = ['\ud800', false]
    await expect(writeSegment(bookSegment(m))).rejects.toThrow()
  })
})
