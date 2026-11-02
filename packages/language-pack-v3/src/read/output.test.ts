import { beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bookSegment } from '../build/book'
import { type BuiltSegment } from '../build/catalog'
import { BUILDER, buildCommon, buildLanguage } from '../build/language'
import { obsSegment } from '../build/obs'
import { type CborValue, encodeDeterministic } from '../codec/cbor'
import { FORMAT_ERROR_CODES, FormatError } from '../codec/errors'
import { hex, readHeader, readSegment, type Segment, writeSegment } from '../codec/container'
import type { About, BookModel, ObsModel } from '../model'
import { partsSource } from '../node/partsSource'
import { writeTransfer } from '../transfer'
import { BOOK_TABLES } from './book'
import { canonicalJson, KNOWN, readerOutput, sortKeys } from './output'

const SPEC = join(import.meta.dir, '..', '..', 'spec', 'tests')
const DATA = join(SPEC, 'data')
const file = (...path: string[]) => new Uint8Array(readFileSync(join(SPEC, ...path)))
const json = (...path: string[]) => JSON.parse(readFileSync(join(SPEC, ...path), 'utf8'))

const about: Omit<About, 'catalog'> = { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER }
const GLT = 'es-419_gl/es-419/glt'
const GST = 'es-419_gl/es-419/gst'
const TN = 'es-419_gl/es-419/tn'
const TWL = 'es-419_gl/es-419/twl'

const out = async (bytes: Uint8Array): Promise<any> => readerOutput(bytes)
const minimal = () => file('container', 'minimal.seg')

describe('sortKeys and canonicalJson', () => {
  test('bytes are lowercase hex, an absent value is an absent key, keys are sorted', () => {
    const data = sortKeys({ b: new Uint8Array([0, 255, 16]), a: undefined, c: [{ z: 1, y: true }], 'Z': 'x' })
    expect(JSON.stringify(data)).toBe('{"Z":"x","b":"00ff10","c":[{"y":true,"z":1}]}')
  })

  test('keys are sorted by code point, not by UTF-16 code unit', () => {
    const data = { '\u{1D538}': 1, '￿': 2, a: 3 }
    expect(Object.keys(sortKeys(data) as object)).toEqual(['a', '￿', '\u{1D538}'])
    expect(canonicalJson(data)).toBe('{"a":3,"￿":2,"\u{1D538}":1}')
  })

  test('the canonical text sorts keys that an engine lists as array indexes ("10" before "9")', () => {
    expect(canonicalJson({ 9: 'a', 10: 'b', x: 'c' })).toBe('{"10":"b","9":"a","x":"c"}')
  })

  test('a key named __proto__ stays a key', () => {
    const data = JSON.parse('{"__proto__": {"x": 1}, "a": 2}')
    expect(canonicalJson(data)).toBe('{"__proto__":{"x":1},"a":2}')
    expect(Object.keys(sortKeys(data) as object)).toEqual(['__proto__', 'a'])
  })

  test('strings are written as JSON writes them: only quotes, backslashes and controls are escaped', () => {
    expect(canonicalJson({ t: 'a"b\\c\n\t\u0001é ' })).toBe('{"t":"a\\"b\\\\c\\n\\t\\u0001é "}')
  })

  test.each([
    ['null', null],
    ['undefined in a list', [undefined]],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a number above 2^53 - 1', 2 ** 53],
    ['a bigint', 5n],
    ['a function', () => 1],
  ])('%s is not JSON data', (_, value) => {
    expect(() => sortKeys(value)).toThrow()
  })

  test('integers survive, negative ones too', () => {
    expect(canonicalJson([0, -1, 2 ** 53 - 1, -(2 ** 53 - 1)])).toBe('[0,-1,9007199254740991,-9007199254740991]')
  })
})

describe('the container examples', () => {
  test('case 1: minimal.seg gives minimal.expected.json', async () => {
    expect(await readerOutput(minimal())).toEqual(json('container', 'minimal.expected.json'))
  })

  test('the expected file is the canonical text pretty-printed: its keys are sorted at every depth', () => {
    const expected = json('container', 'minimal.expected.json')
    const lines = JSON.stringify(expected, null, 2)
    // A checkout on Windows may turn line feeds into CR LF.
    expect(readFileSync(join(SPEC, 'container', 'minimal.expected.json'), 'utf8').replace(/\r\n/g, '\n')).toBe(`${lines}\n`)
    expect(JSON.stringify(JSON.parse(canonicalJson(expected)))).toBe(canonicalJson(expected))
  })

  test('case 2: truncated.seg is E_TRUNCATED', async () => {
    expect(await readerOutput(file('container', 'truncated.seg'))).toEqual(json('container', 'truncated.expected.json'))
  })

  test('case 3: bad-id.seg is E_ID', async () => {
    expect(await readerOutput(file('container', 'bad-id.seg'))).toEqual(json('container', 'bad-id.expected.json'))
  })

  test('the output is plain data: it survives JSON, and its text is the canonical text', async () => {
    const output = await readerOutput(minimal())
    expect(JSON.parse(JSON.stringify(output))).toEqual(output as object)
    expect(JSON.stringify(output)).toBe(canonicalJson(output))
  })
})

/** The keys of every object, in the reverse of the order the output has them. */
function reversed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversed)
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reversed(v)]))
  return value
}

describe('determinism', () => {
  test('the same bytes give the same text, however the keys come', async () => {
    const one = await readerOutput(minimal())
    const two = await readerOutput(minimal())
    expect(JSON.stringify(two)).toBe(JSON.stringify(one))
    expect(canonicalJson(reversed(one))).toBe(JSON.stringify(one))
    expect(JSON.stringify(sortKeys(reversed(one)))).toBe(JSON.stringify(one))
  })
})

// A file that has had its header changed: the body stays, so its id stays.
function withHeader(bytes: Uint8Array, change: (header: Record<string, CborValue>) => void): Uint8Array {
  const { header, headerEnd } = readHeader(bytes)
  const changed = structuredClone(header)
  change(changed)
  const encoded = encodeDeterministic(changed)
  const result = new Uint8Array(12 + encoded.length + bytes.length - headerEnd)
  result.set(bytes.subarray(0, 8))
  new DataView(result.buffer).setUint32(8, encoded.length)
  result.set(encoded, 12)
  result.set(bytes.subarray(headerEnd), 12 + encoded.length)
  return result
}

/** The segment of `minimal.seg`, as a copy to change. */
async function minimalSegment(): Promise<Segment> {
  return structuredClone((await readSegment(minimal(), { known: BOOK_TABLES })).seg)
}

const tableOnly = (value: any) => {
  const copy = structuredClone(value)
  delete copy.h.tables
  return copy
}

describe('tables a reader does not know (case 9)', () => {
  test('an optional table it does not know: the output of case 1 except h.tables', async () => {
    const seg = await minimalSegment()
    seg.h.tables['future-x'] = [1, false]
    seg.t['future-x'] = [1, 2, 3]
    const { bytes, id } = await writeSegment(seg)
    const result = await out(bytes)
    const original = await out(minimal())
    expect(result.id).toBe(id)
    expect(result.id).not.toBe(original.id)
    expect(result.h.tables).toEqual({ ...original.h.tables, 'future-x': [1, false] })
    expect({ ...tableOnly(result), id: '' }).toEqual({ ...tableOnly(original), id: '' })
  })

  test('a required table it does not know: E_TABLE', async () => {
    const seg = await minimalSegment()
    seg.h.tables['future-y'] = [1, true]
    seg.t['future-y'] = {}
    expect(await readerOutput((await writeSegment(seg)).bytes)).toEqual({ error: 'E_TABLE' })
  })

  test('a required table in another version: E_TABLE; an optional one: skipped', async () => {
    const seg = await minimalSegment()
    seg.h.tables.texts = [2, true]
    expect(await readerOutput((await writeSegment(seg)).bytes)).toEqual({ error: 'E_TABLE' })
    const optional = await minimalSegment()
    optional.h.tables.align = [2, false]
    optional.t.align = 'a table of the future'
    expect(((await out((await writeSegment(optional)).bytes)).texts[0] as object) ?? 0).toEqual(json('container', 'minimal.expected.json').texts[0])
  })

  test('the classes of phase 2 have no known tables: map, xmap and gen give E_TABLE', async () => {
    expect(KNOWN.map).toEqual({})
    expect(KNOWN.xmap).toEqual({})
    expect(KNOWN.gen).toEqual({})
    for (const cls of ['map', 'xmap', 'gen'] as const) {
      const required: Segment = { h: { class: cls, v: 1, tables: { core: [1, true] } }, t: { core: {} } }
      expect(await readerOutput((await writeSegment(required)).bytes)).toEqual({ error: 'E_TABLE' })
      // Even a segment whose tables are all optional: the class is not read.
      const optional: Segment = { h: { class: cls, v: 1, tables: { core: [1, false] } }, t: { core: {} } }
      expect(await readerOutput((await writeSegment(optional)).bytes)).toEqual({ error: 'E_TABLE' })
    }
  })

  test('the tables of the classes it reads', () => {
    expect(Object.keys(KNOWN.book).sort()).toEqual(['align', 'links', 'notes', 'questions', 'quotes', 'strings', 'texts'])
    expect(Object.keys(KNOWN.orig).sort()).toEqual(['macula', 'text', 'words'])
    expect(Object.keys(KNOWN.art)).toEqual(['articles'])
    expect(Object.keys(KNOWN.lex)).toEqual(['entries'])
    expect(Object.keys(KNOWN.obs).sort()).toEqual(['links', 'notes', 'questions', 'stories', 'strings', 'study-notes', 'study-questions'])
    expect(Object.keys(KNOWN.catalog).sort()).toEqual(['about', 'complements', 'requires', 'resources', 'segments', 'units'])
    for (const versions of Object.values(KNOWN).flatMap((tables) => Object.values(tables))) expect(versions).toEqual([1])
  })
})

describe('every error code is reachable from one corrupted file', () => {
  const bytes = minimal()
  const cases: [string, () => Promise<Uint8Array> | Uint8Array][] = [
    ['E_MAGIC', () => Uint8Array.from(bytes, (b, i) => (i === 0 ? 0 : b))],
    ['E_VERSION', () => Uint8Array.from(bytes, (b, i) => (i === 4 ? 4 : b))],
    ['E_KIND', () => Uint8Array.from(bytes, (b, i) => (i === 6 ? 9 : b))],
    ['E_TRUNCATED', () => bytes.subarray(0, bytes.length - 10)],
    ['E_TRAILING', () => Uint8Array.from([...bytes, 0])],
    ['E_HEADER', () => withHeader(bytes, (h) => void delete h.clen)],
    ['E_CODEC', () => withHeader(bytes, (h) => void (h.codec = 'gzip'))],
    ['E_INFLATE', () => withHeader(bytes, (h) => void ((h.ulen as number) += 1))],
    ['E_ID', () => withHeader(bytes, (h) => void ((h.id as Uint8Array)[0] ^= 1))],
    [
      'E_BODY',
      async () => {
        const seg = await minimalSegment()
        seg.t.texts = 5
        return (await writeSegment(seg)).bytes
      },
    ],
    ['E_HMISMATCH', () => withHeader(bytes, (h) => void ((h.h as Record<string, CborValue>).book = 'rut'))],
    [
      'E_TABLE',
      async () => {
        const seg = await minimalSegment()
        seg.h.tables['future-y'] = [1, true]
        seg.t['future-y'] = []
        return (await writeSegment(seg)).bytes
      },
    ],
    ['E_LIMIT', () => withHeader(bytes, (h) => void (h.ulen = 67_108_865))],
  ]

  test('all 13 codes are covered', () => {
    expect(cases.map(([code]) => code).sort()).toEqual([...FORMAT_ERROR_CODES].sort())
  })

  test.each(cases)('%s', async (code, make) => {
    expect(await readerOutput(await make())).toEqual({ error: code })
  })

  test('a header over 65 536 bytes is E_LIMIT, and a short file is E_TRUNCATED', async () => {
    const big = Uint8Array.from(bytes, (b, i) => (i === 9 ? 2 : b))
    expect(await readerOutput(big)).toEqual({ error: 'E_LIMIT' })
    expect(await readerOutput(new Uint8Array(0))).toEqual({ error: 'E_TRUNCATED' })
    expect(await readerOutput(bytes.subarray(0, 11))).toEqual({ error: 'E_TRUNCATED' })
  })

  test('the first defect of the order of checks wins', async () => {
    // E_ID before E_BODY: a body with a wrong id and a wrong table is E_ID.
    const seg = await minimalSegment()
    seg.t.texts = 5
    const { bytes: broken } = await writeSegment(seg)
    expect(await readerOutput(withHeader(broken, (h) => void ((h.id as Uint8Array)[0] ^= 1)))).toEqual({ error: 'E_ID' })
    // E_BODY (general shape) before E_TABLE, and E_TABLE before the tables' own schema: a segment with a table of the
    // future and a texts table that is not a list is E_TABLE.
    seg.h.tables['future-y'] = [1, true]
    seg.t['future-y'] = []
    expect(await readerOutput((await writeSegment(seg)).bytes)).toEqual({ error: 'E_TABLE' })
  })
})

// Books with everything the output can show

const tiny: BookModel = {
  lang: 'es-419',
  book: 'tit',
  orig: ['unfoldingWord/el-x-koine/ugnt', 'g987ab2025a'],
  res: [
    [GLT, 'v42'],
    [GST, 'v7'],
    [TN, 'v66'],
    [TWL, 'v18'],
  ],
  texts: [
    {
      res: GLT,
      pieces: [
        ['Pablo', true],
        [' ', false],
        ['siervo', true],
        [', ', false],
        ['de', true],
      ],
      events: [
        [0, 'chapter', '1'],
        [0, 'verse', '1-2'],
        [1, 'open', 'note:f'],
        [3, 'close', ''],
      ],
      attrs: { 2: { caller: '+' } },
      align: [[3], [], [1, 0]],
      alignMissing: [[1, 56_001_001, 'Ἰησοῦ', 1]],
    },
    { res: GST, pieces: [['Yo', true]], events: [[0, 'verse', '1']] },
  ],
  notes: {
    res: TN,
    rows: [
      { id: 'a1b2', ref: '1:1', from: 56_001_001, to: 56_001_001, concept: 'ta:translate/figs-metaphor', cols: { note: 'Hola\nmundo', quote: 'α', tags: '', isIntro: false }, quote: [3] },
      { id: 'c3d4', ref: '1:2-4', from: 56_001_002, to: 56_001_004, cols: { note: 'x', occurrence: '1', isIntro: true }, quote: [] },
      {
        id: 'e5f6',
        ref: '1:1,3',
        from: 56_001_001,
        to: 56_001_003,
        concept: 'ta:translate/figs-you',
        cols: { note: 'z', quote: 'α … β γ', tags: 'k' },
        quote: [-1, 5, -1],
        quoteKinds: [[0, 'ellipsis']],
        quoteMissing: [[2, 56_001_003, 'Ἰησοῦ', 1]],
      },
    ],
  },
  links: {
    res: TWL,
    rows: [
      { id: 'g7h8', ref: '1:1', from: 56_001_001, to: 56_001_001, concept: 'tw:kt/god', cols: { origWords: 'Θεοῦ' }, quote: [0, 1] },
      { id: 'i9j0', ref: '1:2', from: 56_001_002, to: 56_001_002, cols: { origWords: 'x', twLink: 'kt/grace' }, quote: [] },
    ],
  },
}

describe('the output of a book', () => {
  test('every key of the output, in a book with all its tables', async () => {
    const result = await out((await writeSegment(bookSegment(tiny))).bytes)
    expect(Object.keys(result)).toEqual(['h', 'id', 'links', 'notes', 'texts'])
    expect(result.id).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.keys(result.texts[0])).toEqual(['align', 'alignMissing', 'attrs', 'events', 'pieces', 'res'])
    expect(result.texts[0]).toEqual({
      res: GLT,
      pieces: [['Pablo', true], [' ', false], ['siervo', true], [', ', false], ['de', true]],
      events: [[0, 'chapter', '1'], [0, 'verse', '1-2'], [1, 'open', 'note:f'], [3, 'close', '']],
      attrs: [[2, { caller: '+' }]],
      align: [[3], [], [1, 0]],
      alignMissing: [[1, 56_001_001, 'Ἰησοῦ', 1]],
    })
    // A text without alignment has neither align nor alignMissing; a text without attributes has no attrs.
    expect(result.texts[1]).toEqual({ res: GST, pieces: [['Yo', true]], events: [[0, 'verse', '1']] })
  })

  test('a help row: ref (the reference text), from and to, concept, cols, and a quote with -1', async () => {
    const result = await out((await writeSegment(bookSegment(tiny))).bytes)
    expect(Object.keys(result.notes)).toEqual(['res', 'rows'])
    expect(result.notes.res).toBe(TN)
    const [first, second, third] = result.notes.rows
    expect(first).toEqual({
      id: 'a1b2',
      ref: '1:1',
      from: 56_001_001,
      to: 56_001_001,
      concept: 'ta:translate/figs-metaphor',
      cols: { note: 'Hola\nmundo', quote: 'α', tags: '', isIntro: false },
      quote: [3],
    })
    expect(second.concept).toBeUndefined()
    expect('concept' in second).toBe(false)
    expect(second.quote).toEqual([])
    expect(second.cols.isIntro).toBe(true)
    // The reference text the file keeps in refText replaces the canonical one.
    expect(third.ref).toBe('1:1,3')
    expect(third.quote).toEqual([-1, 5, -1])
    expect(third.quoteKinds).toEqual([[0, 'ellipsis']])
    expect(third.quoteMissing).toEqual([[2, 56_001_003, 'Ἰησοῦ', 1]])
    expect('quoteKinds' in first).toBe(false)
    expect(result.links.rows[1].cols).toEqual({ origWords: 'x', twLink: 'kt/grace' })
  })

  test('an attribute map that is empty in the file is output as it is; a text with no pair has no attrs', async () => {
    const seg = structuredClone(bookSegment(tiny))
    ;(seg.t.texts as any[])[0].attrs = [[2, {}]]
    ;(seg.t.texts as any[])[1].attrs = []
    const result = await out((await writeSegment(seg)).bytes)
    expect(result.texts[0].attrs).toEqual([[2, {}]])
    expect('attrs' in result.texts[1]).toBe(false)
  })

  test('a table the output does not have is not a key: no questions, no null', async () => {
    const result = await out((await writeSegment(bookSegment(tiny))).bytes)
    expect('questions' in result).toBe(false)
    expect(JSON.stringify(result)).not.toContain('null')
  })

  test('an unknown version of align: the texts without alignment; of notes: the quotes of the notes are dropped, not the links', async () => {
    const seg = structuredClone(bookSegment(tiny))
    seg.h.tables.align = [2, false]
    seg.h.tables.notes = [2, false]
    const result = await out((await writeSegment(seg)).bytes)
    expect(result.texts[0].align).toBeUndefined()
    expect(result.texts[0].alignMissing).toBeUndefined()
    expect(result.notes).toBeUndefined()
    expect(result.links.rows.map((row: any) => row.quote)).toEqual([[0, 1], []])

    const noQuotes = structuredClone(bookSegment(tiny))
    noQuotes.h.tables.quotes = [2, false]
    const other = await out((await writeSegment(noQuotes)).bytes)
    expect(other.notes.rows.every((row: any) => !('quote' in row) && !('quoteKinds' in row) && !('quoteMissing' in row))).toBe(true)
    expect(other.links.rows.every((row: any) => !('quote' in row))).toBe(true)
    expect(other.texts[0].align).toEqual([[3], [], [1, 0]])
  })
})

describe('the output of Open Bible Stories', () => {
  const OBS = 'unfoldingWord/en/obs'
  const SN = 'unfoldingWord/en/obs-sn'
  const model: ObsModel = {
    lang: 'en',
    res: [[OBS, 'v12'], [SN, 'v1'], ['unfoldingWord/en/obs-tn', 'v7']],
    stories: [
      { res: OBS, n: 1, title: '1. The Creation', frames: [{ n: 1, text: 'In the beginning.', image: 'u1' }] },
      { res: OBS, n: 10, title: '10. The plagues', reference: 'A Bible story from: Exodus 5-14', refs: [[2005001, 2014031]], frames: [{ n: 0, text: 'T' }, { n: 3, text: 'Three.' }] },
    ],
    notes: {
      res: 'unfoldingWord/en/obs-tn',
      rows: [
        { id: 'ab12', ref: '10:3', frame: 1003, concept: 'ta:translate/figs-metaphor', cols: { quote: 'hardened', note: 'A figure.', isIntro: false } },
        { id: 'cd34', ref: '10:03', frame: 1003, cols: { note: 'padded' } },
        { id: 'ef56', ref: '10:intro', frame: 1000, cols: { note: 'introduction' } },
      ],
    },
    studyNotes: { res: SN, rows: [{ id: 'sn001', ref: '10:1', frame: 1001, cols: { note: 'A study note.' } }] },
  }

  test('stories as the schema has them, and helps with the frame as text', async () => {
    const result = await out((await writeSegment(obsSegment(model))).bytes)
    expect(Object.keys(result)).toEqual(['h', 'id', 'notes', 'stories', 'study-notes'])
    expect(result.stories[1]).toEqual({
      res: OBS,
      n: 10,
      title: '10. The plagues',
      reference: 'A Bible story from: Exodus 5-14',
      refs: [[2005001, 2014031]],
      frames: [{ n: 0, text: 'T' }, { n: 3, text: 'Three.' }],
    })
    expect(result.stories[0].frames[0]).toEqual({ n: 1, text: 'In the beginning.', image: 'u1' })
    expect(result.notes.res).toBe('unfoldingWord/en/obs-tn')
    expect(result.notes.rows[0]).toEqual({
      id: 'ab12',
      frame: '10:3',
      frameId: 1003,
      concept: 'ta:translate/figs-metaphor',
      cols: { quote: 'hardened', note: 'A figure.', isIntro: false },
    })
    // The text the file keeps in refText is the frame; the number is still story × 100 + frame.
    expect(result.notes.rows[1]).toEqual({ id: 'cd34', frame: '10:03', frameId: 1003, cols: { note: 'padded' } })
    expect(result.notes.rows[2].frame).toBe('10:intro')
    expect(result.notes.rows[2].frameId).toBe(1000)
    expect(result['study-notes'].rows[0].frame).toBe('10:1')
    expect('ref' in result.notes.rows[0]).toBe(false)
  })
})

// The Titus of the sample

describe('the sample (es-419 Titus)', () => {
  let lang: Awaited<ReturnType<typeof buildLanguage>>
  let common: Awaited<ReturnType<typeof buildCommon>>
  const segmentOf = (built: { segments: BuiltSegment[] }, cls: string): BuiltSegment => built.segments.find((s) => s.seg.h.class === cls)!

  beforeAll(async () => {
    const source = await partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts'), originals: join(DATA, 'originals', 'list.json') })
    lang = await buildLanguage({ source, lang: 'es-419', registry: {}, about })
    common = await buildCommon({ source, about })
  }, 120_000)

  test('the book: case 4, GLT and GST whole and aligned, 216 notes, 36 questions, 223 links', async () => {
    const book = segmentOf(lang, 'book')
    const result = await out(book.bytes)
    expect(result.id).toBe(book.id)
    expect(result.h.book).toBe('tit')
    const [glt, gst] = result.texts
    expect([glt.res, glt.pieces.length, glt.pieces.filter((p: [string, boolean]) => p[1]).length, glt.events.length]).toEqual([GLT, 1913, 953, 69])
    expect(glt.align).toHaveLength(953)
    expect(glt.align.every((positions: number[]) => positions.length > 0)).toBe(true)
    expect([gst.res, gst.pieces.length, gst.pieces.filter((p: [string, boolean]) => p[1]).length, gst.events.length]).toEqual([GST, 3471, 1732, 69])
    expect(gst.align).toHaveLength(1732)
    expect(gst.align.every((positions: number[]) => positions.length > 0)).toBe(true)

    expect(result.notes.rows).toHaveLength(216)
    expect(result.notes.rows.filter((row: any) => row.cols.quote !== undefined && row.cols.quote !== '')).toHaveLength(212)
    expect(result.notes.rows.filter((row: any) => row.quote.length > 0)).toHaveLength(203)
    expect(result.questions.rows).toHaveLength(36)
    expect(result.links.rows).toHaveLength(223)
    expect(result.links.rows.every((row: any) => row.cols.origWords !== '' && row.quote.length > 0 && row.quote.every((p: number) => p >= 0))).toBe(true)
    expect(result.questions.rows.every((row: any) => !('quote' in row))).toBe(true)
  })

  test('every output is plain data with sorted keys: its text is the canonical text', async () => {
    for (const built of [...lang.segments, ...common.segments, lang.catalog, common.catalog]) {
      const result = await readerOutput(built.bytes)
      const text = JSON.stringify(result)
      expect(text).toBe(canonicalJson(result))
      expect(JSON.parse(text)).toEqual(result as object)
      expect(text).not.toContain('null')
    }
  })

  test('the original: words, the pieces that are their forms, events', async () => {
    const orig = segmentOf(common, 'orig')
    const result = await out(orig.bytes)
    expect(Object.keys(result)).toEqual(['attrs', 'events', 'h', 'id', 'pieces', 'words'])
    expect(result.words).toHaveLength(659)
    expect(Object.keys(result.words[0])).toEqual(['form', 'lemma', 'morph', 'strong'])
    const wordPieces = result.pieces.filter((p: [string, boolean]) => p[1])
    expect(wordPieces.map((p: [string, boolean]) => p[0])).toEqual(result.words.map((w: any) => w.form))
    expect(result.attrs).toEqual([[0, { code: 'TIT' }]])
    expect(result.h.orig).toEqual(['unfoldingWord/el-x-koine/ugnt', expect.stringMatching(/^g[0-9a-f]{10}$/)])
  })

  test('orig: an empty attribute map of a node or of a word is output as it is', async () => {
    const seg = structuredClone(segmentOf(common, 'orig').seg)
    ;(seg.t.text as any).attrs = [[0, {}]]
    ;(seg.t.words as any).other = [[1, {}]]
    const result = await out((await writeSegment(seg)).bytes)
    expect(result.attrs).toEqual([[0, {}]])
    expect(result.words[1].other).toEqual({})
    expect('other' in result.words[0]).toBe(false)
    expect(Object.keys(result.words[1])).toEqual(['form', 'lemma', 'morph', 'other', 'strong'])
  })

  test('orig: macula is output with its bytes in hex, and its keys that look like numbers in the canonical order', async () => {
    const seg = structuredClone(segmentOf(common, 'orig').seg)
    seg.h.tables.macula = [1, false]
    seg.t.macula = { release: 'r1', trees: { 9: new Uint8Array([1, 255]), 10: [2], b: { z: true } } }
    const result = await out((await writeSegment(seg)).bytes)
    expect(result.macula).toEqual({ release: 'r1', trees: { 9: '01ff', 10: [2], b: { z: true } } })
    expect(canonicalJson(result.macula)).toBe('{"release":"r1","trees":{"10":[2],"9":"01ff","b":{"z":true}}}')
  })

  test('a segment of a class phase 1 does not read is E_TABLE in a transfer file, even when all its tables are optional', async () => {
    const optionalMap = await builtOf({ h: { class: 'map', v: 1, tables: { core: [1, false] } }, t: { core: {} } })
    const file = writeTransfer({ mode: 'full', catalogs: [lang.catalog], entries: [segmentOf(lang, 'book'), optionalMap], made: '2026-11-01T10:00:00Z', by: 'test 1' })
    expect((await out(file)).entries.map((e: any) => [e.class, e.status])).toEqual([['catalog', 'ok'], ['book', 'ok'], ['map', 'E_TABLE']])
  })

  test('the articles: the group, each article with its sections and the resource key', async () => {
    const result = await out(segmentOf(lang, 'art').bytes)
    expect(Object.keys(result)).toEqual(['articles', 'h', 'id'])
    expect(result.h.group).toBe('tw:kt')
    expect(result.articles).toHaveLength(30)
    const grace = result.articles.find((a: any) => a.id === 'tw:kt/grace')
    expect(grace.res).toBe(TN.replace('/tn', '/tw'))
    expect(grace.sections.every((s: any) => typeof s.sid === 'string' && typeof s.level === 'number' && typeof s.md === 'string' && typeof s.lang === 'string' && typeof s.role === 'string')).toBe(true)
    expect(result.articles.map((a: any) => a.id)).toEqual([...result.articles.map((a: any) => a.id)].sort())
  })

  test('the lexicon: the entries of group G0', async () => {
    const result = await out(segmentOf(lang, 'lex').bytes)
    expect(Object.keys(result)).toEqual(['entries', 'h', 'id'])
    expect(result.h.group).toBe('G0')
    expect(result.entries).toHaveLength(994)
    const alpha = result.entries[0]
    expect(alpha).toMatchObject({ res: TN.replace('/tn', '/ugl'), lemma: 'ἄλφα', brief: 'alfa' })
    expect(Array.isArray(alpha.senses) && alpha.senses[0].glosses).toEqual(['alfa', 'el primero', 'el principio'])
  })

  test('the catalogs: ids and book sets in hex', async () => {
    const result = await out(lang.catalog.bytes)
    expect(result.id).toBe(lang.catalog.id)
    expect(result.about).toMatchObject({ catalog: 'es-419', format: '3.0', origin: 'published', publisher: 'unfoldingWord', revision: 1 })
    expect(result.resources.every((r: any) => /^[0-9a-f]{18}$/.test(r.books))).toBe(true)
    expect(result.resources.find((r: any) => r.key === GLT).books).toBe('000000000000800000')
    expect(result.segments.map((s: any) => s.id)).toEqual(lang.segments.map((s) => s.id))
    expect(result.segments.every((s: any) => /^[0-9a-f]{64}$/.test(s.inputs) && s.size > 0 && s.ulen > 0)).toBe(true)
    expect(result.units.map((u: any) => u.id)).toEqual(['art:tw:kt', 'book:tit', 'lex:G0'])
    expect(result.units.find((u: any) => u.id === 'book:tit').segments).toHaveLength(1)
    const commonResult = await out(common.catalog.bytes)
    expect(commonResult.h.lang).toBeUndefined()
    expect(commonResult.about.catalog).toBe('common')
  })

  test('a transfer file cut inside an entry (case 10): the catalogs and what comes before are ok, the cut entry and the rest are missing', async () => {
    const entries = [...lang.segments, ...common.segments]
    const file = writeTransfer({ mode: 'full', catalogs: [lang.catalog, common.catalog], entries, made: '2026-11-01T10:00:00Z', by: 'test 1' })
    const whole = await out(file)
    expect(Object.keys(whole)).toEqual(['catalogs', 'entries', 'index'])
    expect(whole.entries.map((e: any) => e.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok'])
    expect(whole.catalogs).toEqual([await out(lang.catalog.bytes), await out(common.catalog.bytes)])
    expect(whole.index.mode).toBe('full')
    expect(whole.index.made).toBe('2026-11-01T10:00:00Z')
    expect(whole.index.catalogs).toEqual([lang.catalog.id, common.catalog.id])
    expect(whole.index.entries.map((e: any) => [e.id, e.kind, e.class])).toEqual(
      [lang.catalog, common.catalog, ...entries].map((b) => [b.id, 'segment', b.seg.h.class]),
    )
    expect(whole.index.entries[0]).toMatchObject({ offset: 0, size: lang.catalog.bytes.length })
    expect(whole.entries[2]).toEqual({ id: entries[0].id, kind: 'segment', class: 'book', status: 'ok' })

    // Cut in the middle of the article segment (the third of the entries, after the book).
    const art = whole.index.entries.find((e: any) => e.class === 'art')
    const start = file.length - (whole.index.entries.at(-1).offset + whole.index.entries.at(-1).size - art.offset)
    const cut = file.subarray(0, start + Math.floor(art.size / 2))
    const result = await out(cut)
    expect(result.entries.map((e: any) => [e.class, e.status])).toEqual([
      ['catalog', 'ok'],
      ['catalog', 'ok'],
      ['book', 'ok'],
      ['art', 'missing'],
      ['lex', 'missing'],
      ['orig', 'missing'],
    ])
    expect(result.catalogs).toEqual(whole.catalogs)
    expect(result.index).toEqual(whole.index)

    // Cut inside the last catalog: nothing is usable.
    const second = whole.index.entries[1]
    const inside = file.length - (whole.index.entries.at(-1).offset + whole.index.entries.at(-1).size - second.offset)
    expect(await readerOutput(file.subarray(0, inside + 10))).toEqual({ error: 'E_TRUNCATED' })
    // Cut inside the index.
    expect(await readerOutput(file.subarray(0, 20))).toEqual({ error: 'E_TRUNCATED' })
  })

  test('an entry that fails says why and does not discard the others; a class phase 1 does not read is E_TABLE', async () => {
    const book = segmentOf(lang, 'book')
    const lex = segmentOf(lang, 'lex')
    const orig = segmentOf(common, 'orig')
    const future = await builtOf({ h: { class: 'map', v: 1, tables: { core: [1, true] } }, t: { core: {} } })
    const complement = new Uint8Array([1, 2, 3, 4])
    const complementId = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', complement)))
    const file = writeTransfer({
      mode: 'full',
      catalogs: [lang.catalog],
      entries: [book, future, lex, { id: complementId, bytes: complement, kind: 'complement' }, orig],
      made: '2026-11-01T10:00:00Z',
      by: 'test 1',
    })
    const damaged = Uint8Array.from(file)
    // Flip a byte in the middle of the lexicon segment's compressed body.
    const { entries: index } = (await out(file)).index
    const at = (id: string) => file.length - (index.at(-1).offset + index.at(-1).size) + index.find((e: any) => e.id === id).offset
    damaged[at(lex.id) + Math.floor(lex.bytes.length / 2)] ^= 0xff
    const result = await out(damaged)
    expect(result.entries.map((e: any) => [e.kind, e.class, e.status])).toEqual([
      ['segment', 'catalog', 'ok'],
      ['segment', 'book', 'ok'],
      ['segment', 'map', 'E_TABLE'],
      ['segment', 'lex', expect.stringMatching(/^E_(INFLATE|ID)$/)],
      ['complement', undefined, 'ok'],
      ['segment', 'orig', 'ok'],
    ])
    expect(result.entries[4]).toEqual({ id: complementId, kind: 'complement', status: 'ok' })

    // A complement whose bytes are not the id.
    const forged = Uint8Array.from(file)
    forged[at(complementId)] ^= 1
    expect((await out(forged)).entries[4].status).toBe('E_ID')
  })

  test('a bad catalog makes the whole file {error}: its own code', async () => {
    const file = writeTransfer({ mode: 'full', catalogs: [lang.catalog], entries: [segmentOf(lang, 'book')], made: '2026-11-01T10:00:00Z', by: 'test 1' })
    // The catalog is entry 0, at the start of the entries: flip a byte of its compressed body.
    const { header, headerEnd } = readHeader(file)
    expect(header.mode).toBe('full')
    const broken = Uint8Array.from(file)
    broken[headerEnd + lang.catalog.bytes.length - 3] ^= 0xff
    const result = await readerOutput(broken)
    expect(Object.keys(result as object)).toEqual(['error'])
    expect(FORMAT_ERROR_CODES as readonly string[]).toContain((result as { error: string }).error)
  })

  test('the output is the same on every run', async () => {
    const one = await readerOutput(segmentOf(lang, 'book').bytes)
    const two = await readerOutput(segmentOf(lang, 'book').bytes)
    expect(canonicalJson(two)).toBe(canonicalJson(one))
  })
})

/** A segment as `buildLanguage` hands it out, for the transfer writer. */
async function builtOf(seg: Segment): Promise<BuiltSegment> {
  const { bytes, id } = await writeSegment(seg)
  return { seg, bytes, id, inputs: '0'.repeat(64) }
}
