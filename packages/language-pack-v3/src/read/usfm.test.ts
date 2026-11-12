import { describe, expect, test } from 'bun:test'
import { USFMParser } from '@usfm-tools/parser'
import { bookSegment } from '../build/book'
import { extractText } from '../build/bookTexts'
import { extractOrig, OrigIndex, origSegment } from '../build/orig'
import { readSegment, writeSegment } from '../codec/container'
import type { BookModel, OrigModel, TextModel } from '../model'
import { partsSource } from '../node/partsSource'
import type { ResourceRef, Row, RowSource } from '../source/rows'
import { BOOK_TABLES, bookView } from './book'
import { ORIG_TABLES, origView } from './orig'
import { bookUsfm, origUsfm } from './usfm'

const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const GLT = 'es-419_gl/es-419/glt'
const GST = 'es-419_gl/es-419/gst'
const SAMPLE = [import.meta.dir, '..', '..', 'spec', 'tests', 'data'].join('/')

type Json = Record<string, any>

/**
 * A template for USFM: the backslashes stay as written. Bun's `String.raw` writes a non-ASCII character of the template as
 * `\uXXXX`, which a USFM parser reads as a marker, so the escapes are undone here.
 */
const usfm = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  String.raw({ raw: strings.raw }, ...values).replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

/** USFM into the USJ of the rows of format 2.0. */
function usjOf(text: string): unknown[] {
  const parser = new USFMParser()
  parser.parse(text)
  return (parser.toJSON() as Json).content as unknown[]
}

/** The rows of format 2.0 for a USFM: one chunk per chapter, the front matter as chunk 0. */
function rowsOf(usfm: string, res: string, book: string): Row[] {
  const chunks = new Map<number, unknown[]>([[0, []]])
  let chapter = 0
  for (const node of usjOf(usfm)) {
    if ((node as Json).type === 'chapter') {
      chapter = Number((node as Json).number)
      chunks.set(chapter, [])
    }
    chunks.get(chapter)!.push(node)
  }
  const row = (key: string, value: unknown): Row => ({ layer: 'sot', key: `scripture-usj:${res}:${key}`, value })
  return [
    row(book, { content: { chapterNumbers: [...chunks.keys()] } }),
    ...[...chunks].map(([n, content]) => row(`${book}:${n}`, { content: { usj: { type: 'USJ', version: '3.1', content } } })),
  ]
}

const originals = (rows: Row[], key: string, stamp: string): RowSource => ({
  async *rows(f) {
    if (f.lang === 'originals') for (const row of rows) if (f.layer === undefined || row.layer === f.layer) yield row
  },
  async resources(lang): Promise<ResourceRef[]> {
    return lang === 'originals' ? [{ key, stamp, kind: 'Original', books: ['tit'] }] : []
  },
})

const idOf = async (segment: Parameters<typeof writeSegment>[0]) => (await writeSegment(segment)).id
/** The model of an original without MACULA, which the USFM does not carry. */
const plain = (orig: OrigModel): OrigModel => {
  const { macula: _macula, ...rest } = orig
  return rest
}
const bookOf = (orig: OrigModel, ...texts: TextModel[]): BookModel => ({
  lang: 'es-419',
  book: orig.book,
  orig: [orig.key, orig.stamp],
  res: texts.map((t): [string, string] => [t.res, 'v1']),
  texts,
})

/** The text of each verse of a model, by chapter and label. */
function verseTexts(t: { pieces: [string, boolean][]; events: [number, string, string][] }): Record<string, string> {
  const out: Record<string, string> = {}
  let key = 'front'
  let chapter = ''
  let event = 0
  t.pieces.forEach(([text], at) => {
    for (; event < t.events.length && t.events[event][0] <= at; event++) {
      const [, kind, arg] = t.events[event]
      if (kind === 'chapter') [chapter, key] = [arg, `${arg}:0`]
      else if (kind === 'verse') key = `${chapter}:${arg}`
    }
    out[key] = (out[key] ?? '') + text
  })
  return out
}

/** The attributes of the `zaln-s` milestones of a USJ document, in order. */
function milestones(content: unknown[]): string[] {
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node === 'string') return
    const n = node as Json
    if (n.marker === 'zaln-s') out.push(['x-strong', 'x-lemma', 'x-morph', 'x-occurrence', 'x-occurrences', 'x-content'].map((k) => `${k}=${n[k]}`).join(' '))
    for (const child of n.content ?? []) walk(child)
  }
  content.forEach(walk)
  return out
}

// The fixtures: every kind of marker the book segment keeps.

const UGNT_USFM = usfm`\id TIT unfoldingWord Greek New Testament
\ide UTF-8
\h Titus
\toc1 The Letter of Paul to Titus
\mt1 Titus
\c 1
\p
\v 1 \w Παῦλος|lemma="Παῦλος" strong="G39720" x-morph="Gr,N,,,,,NMS,"\w* \w δοῦλος|lemma="δοῦλος" strong="G14010" x-morph="Gr,N,,,,,NMS,"\w* \w Θεοῦ|lemma="θεός" strong="G23160" x-morph="Gr,N,,,,,GMS,"\w* \w Θεοῦ|lemma="θεός" strong="G23160" x-morph="Gr,N,,,,,GMS,"\w* \w καὶ|lemma="καί" strong="G25320" x-morph="Gr,CC"\w*
\v 2 \w ζωῆς|lemma="ζωή" strong="G22220" x-morph="Gr,N,,,,,GFS,"\w* \w Θεοῦ|lemma="θεός" strong="G23160" x-morph="Gr,N,,,,,GMS,"\w*
\v 3 \w καὶ|lemma="καί" strong="G25320" x-morph="Gr,CC"\w* \w Παῦλος|lemma="Παῦλος" strong="G39720" x-morph="Gr,N,,,,,NMS,"\w*\f + \ft \+w ἐστίν|lemma="εἰμί" strong="G15100" x-morph="Gr,V"\+w*\f*
\q1
\v 4 \w ἀγάπη|lemma="ἀγάπη" strong="G260" x-morph="Gr,N"\w*
\c 2
\p
\v 1 \k κτίβ\k* \w λόγος|lemma="λόγος" strong="G30560" x-morph="Gr,N" x-ketiv="κτίβ"\w* \w τέλος|lemma="τέλος" strong="G51170" x-morph="Gr,N"\w*
`

const aligned = (content: string, strong: string, lemma: string, occurrence: number, occurrences: number): string =>
  usfm`\zaln-s |x-strong="${strong}" x-lemma="${lemma}" x-morph="m" x-occurrence="${occurrence}" x-occurrences="${occurrences}" x-content="${content}"\*`
const END = usfm`\zaln-e\*`
const word = (text: string, occurrence = 1, occurrences = 1): string => usfm`\w ${text}|x-occurrence="${occurrence}" x-occurrences="${occurrences}"\w*`

const GLT_USFM = [
  usfm`\id TIT EN_TPL fixture
\ide UTF-8
\h Tito
\toc1 La carta de Pablo a Tito
\mt1 Tito
\is Introducción
\ip Un párrafo de la introducción con \bd negrita\bd*.
\c 1
\s1 Título de la sección
\p
\v 1 `,
  aligned('Παῦλος', 'G39720', 'Παῦλος', 1, 1),
  word('Pablo'),
  END,
  ', ',
  aligned('δοῦλος', 'G14010', 'δοῦλος', 1, 1),
  aligned('Θεοῦ', 'G23160', 'θεός', 1, 2),
  word('siervo'),
  END,
  END,
  ' ',
  aligned('Θεοῦ', 'G23160', 'θεός', 2, 2),
  word('de', 1, 2),
  ' ',
  word('Dios'),
  END,
  ' ',
  aligned('καὶ', 'G25320', 'καί', 1, 1),
  word('y'),
  END,
  usfm` sin ${word('alinear')} más\f + \fr 1:1 \ft Nota con \+w palabra|x-occurrence="1" x-occurrences="1"\+w* y \+bd énfasis\+bd*.\f* fin\x - \xo 1:1 \xt Tit 2:1\x*
\v 2-3 `,
  aligned('ζωῆς', 'G22220', 'ζωή', 1, 1),
  word('vida'),
  END,
  ' ',
  aligned('Θεοῦ', 'G23160', 'θεός', 1, 1),
  word('Dios'),
  END,
  ' ',
  aligned('Παῦλος', 'G39720', 'Παῦλος', 1, 1),
  word('Pablo'),
  END,
  usfm`
\q1
\v 4 `,
  aligned('ἀγάπη', 'G260', 'ἀγάπη', 1, 1),
  word('amor'),
  END,
  usfm` \add agregado\add*
\q2 otra línea
\b
\m sin sangría \nd Señor\nd* \ts\*
\c 2
\p
\v 1 `,
  aligned('λόγος', 'G30560', 'λόγος', 1, 1),
  word('palabra'),
  END,
  ' ',
  aligned('τέλος', 'G51170', 'τέλος', 1, 1),
  word('fin'),
  END,
  '.\n',
].join('')

const origOf = (usfm: string) => extractOrig(originals(rowsOf(usfm, UGNT, 'tit'), UGNT, 'v1'), 'tit')

describe('origUsfm', () => {
  test('rebuilds an original: the same segment, the same words and their attributes', async () => {
    const orig = await origOf(UGNT_USFM)
    const usfm = origUsfm(orig)
    const again = await extractOrig(originals(rowsOf(usfm, UGNT, 'tit'), orig.key, orig.stamp), 'tit')
    expect(again.words).toEqual(orig.words)
    expect(await idOf(origSegment(again))).toBe(await idOf(origSegment(orig)))
    expect(verseTexts(again)).toEqual(verseTexts(orig))
    // the strong number, the lemma and the morphology are in the USFM
    expect(usfm).toContain('\\w Παῦλος|lemma="Παῦλος" strong="G39720" x-morph="Gr,N,,,,,NMS,"\\w*')
  })

  test('keeps a ketiv and its qere', async () => {
    const orig = await origOf(UGNT_USFM)
    expect(orig.events.some(([, , arg]) => arg === 'char:k')).toBe(true)
    expect(orig.words.find((w) => w.form === 'λόγος')!.other).toEqual({ 'x-ketiv': 'κτίβ' })
    const usfm = origUsfm(orig)
    expect(usfm).toContain('\\k κτίβ\\k*')
    expect(usfm).toContain('x-ketiv="κτίβ"')
  })

  test('the footnote word is a word inside the note', async () => {
    const orig = await origOf(UGNT_USFM)
    expect(origUsfm(orig)).toContain('\\f + \\ft \\+w ἐστίν|')
  })

  test('a segment read back writes the same USFM', async () => {
    const orig = plain(await origOf(UGNT_USFM))
    const read = origView((await readSegment((await writeSegment(origSegment(orig))).bytes, { known: ORIG_TABLES })).seg)
    expect(origUsfm(read)).toBe(origUsfm(orig))
  })
})

describe('bookUsfm', () => {
  const build = async () => {
    const orig = await origOf(UGNT_USFM)
    const text = extractText(rowsOf(GLT_USFM, GLT, 'tit'), 'tit', GLT, new OrigIndex(orig))
    return { orig, text, book: bookOf(orig, text) }
  }

  test('the fixture has alignment, a bridge, a note and a nested pair', async () => {
    const { text } = await build()
    expect(text.align?.some((positions) => positions.length === 2)).toBe(true)
    expect(text.events.some(([, kind, arg]) => kind === 'open' && arg === 'note:f')).toBe(true)
    expect(text.events.some(([, kind, arg]) => kind === 'verse' && arg === '2-3')).toBe(true)
    expect(text.alignMissing).toBeUndefined()
  })

  test('the USFM builds again into the same segment', async () => {
    const { orig, text, book } = await build()
    const usfm = bookUsfm(book, 0, orig)
    const again = extractText(rowsOf(usfm, GLT, 'tit'), 'tit', GLT, new OrigIndex(orig))
    expect(again.align).toEqual(text.align)
    expect(again.pieces).toEqual(text.pieces)
    expect(again.events).toEqual(text.events)
    expect(again.attrs).toEqual(text.attrs)
    expect(await idOf(bookSegment(bookOf(orig, again)))).toBe(await idOf(bookSegment(book)))
  })

  test('the verse texts are the source texts', async () => {
    const { orig, text, book } = await build()
    const again = extractText(rowsOf(bookUsfm(book, 0, orig), GLT, 'tit'), 'tit', GLT, new OrigIndex(orig))
    expect(verseTexts(again)).toEqual(verseTexts(text))
    expect(verseTexts(text)['1:2-3']).toContain('vida')
  })

  test('each aligned word keeps x-strong, x-lemma, x-occurrence, x-occurrences and x-content of the source', async () => {
    const { orig, book } = await build()
    const usfm = bookUsfm(book, 0, orig)
    const before = milestones(usjOf(GLT_USFM))
    const after = milestones(usjOf(usfm))
    expect(before.length).toBeGreaterThan(8)
    // the fixture writes x-morph="m" for every word: the original's own morphology is what the rebuilt USFM names
    const strip = (list: string[]) => list.map((line) => line.replace(/x-morph=\S+ /, ''))
    expect(strip(after)).toEqual(strip(before))
    expect(after[0]).toContain('x-morph=Gr,N,,,,,NMS,')
    expect(after.some((line) => line.includes('x-content=Θεοῦ') && line.includes('x-occurrence=2'))).toBe(true)
  })

  test('a segment read back writes the same USFM', async () => {
    const { orig, book } = await build()
    const read = bookView((await readSegment((await writeSegment(bookSegment(book))).bytes, { known: BOOK_TABLES })).seg)
    expect(bookUsfm(read, 0, orig)).toBe(bookUsfm(book, 0, orig))
  })

  test('a word that alignMissing lists is unaligned text', async () => {
    const { orig, text } = await build()
    const cut: TextModel = { ...text, align: text.align!.map((positions, w) => (w === 0 ? [] : positions)), alignMissing: [[0, 56_001_001, 'Παῦλος', 3]] }
    const usfm = bookUsfm(bookOf(orig, cut), 0, orig)
    expect(usfm).toContain('\\w Pablo|')
    expect(milestones(usjOf(usfm)).length).toBe(milestones(usjOf(GLT_USFM)).length - 1)
  })

  test('names a text the book does not have', async () => {
    const { orig, book } = await build()
    expect(() => bookUsfm(book, 3, orig)).toThrow(RangeError)
  })
})

// Real sources: the sample of the spec and, with LP3_DATA, a folder with the same layout (`es-419/list.json`, `parts/`,
// `originals/list.json`).

async function titus(dir: string) {
  const src = await partsSource({ list: `${dir}/es-419/list.json`, partsDir: `${dir}/parts`, originals: `${dir}/originals/list.json` })
  const orig = plain(await extractOrig(src, 'tit'))
  const index = new OrigIndex(orig)
  const texts: TextModel[] = []
  for (const res of [GLT, GST]) {
    const rows: Row[] = []
    for await (const row of src.rows({ lang: 'es-419', book: 'tit', resource: res, layer: 'sot' })) rows.push(row)
    if (rows.length > 0) texts.push(extractText(rows, 'tit', res, index))
  }
  return { orig, texts }
}

async function roundTrip(dir: string): Promise<void> {
  const { orig, texts } = await titus(dir)
  expect(texts.length).toBeGreaterThan(0)
  const again = await extractOrig(originals(rowsOf(origUsfm(orig), UGNT, 'tit'), orig.key, orig.stamp), 'tit')
  expect(await idOf(origSegment(again))).toBe(await idOf(origSegment(orig)))
  const book = bookOf(orig, ...texts)
  for (const [i, text] of texts.entries()) {
    const rebuilt = extractText(rowsOf(bookUsfm(book, i, orig), text.res, 'tit'), 'tit', text.res, new OrigIndex(orig))
    expect(verseTexts(rebuilt)).toEqual(verseTexts(text))
    expect(await idOf(bookSegment(bookOf(orig, rebuilt)))).toBe(await idOf(bookSegment(bookOf(orig, text))))
  }
}

describe('the Titus of the data sample', () => {
  test('UGNT, GLT and GST rebuild to segments with the same ids', () => roundTrip(SAMPLE), 60_000)
})

describe('real sources (LP3_DATA)', () => {
  test.skipIf(process.env.LP3_DATA === undefined)(
    'es-419 GLT Titus and UGNT Titus rebuild to segments with the same ids',
    () => roundTrip(process.env.LP3_DATA!),
    120_000,
  )
})
