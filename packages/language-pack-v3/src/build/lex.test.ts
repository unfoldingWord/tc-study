import { beforeAll, describe, expect, test } from 'bun:test'
import { readSegment, writeSegment } from '../codec/container'
import { verseId } from '../ids'
import type { LexEntry } from '../model'
import { partsSource } from '../node/partsSource'
import { LEX_TABLES, lexView } from '../read/lex'
import type { ResourceRef, Row, RowFilter, RowSource } from '../source/rows'
import { fromHebrewNumbering, HEBREW_NUMBERING } from './hebrewNumbering'
import { extractLexicon, lexGroupOf, lexResources, lexSegment, parseStrong, readRefs } from './lex'
import fixture from './lex.uhl-rows.fixture.json'

// The sample is real files (spec/tests/data/README.md): the es-419 Greek lexicon, group 0 (G1 to G999).
// `lex.uhl-rows.fixture.json` holds four rows of the es-419 Hebrew lexicon, copied from the phase 0 sample
// (wt/fase0-paquetes/muestra, es-419 uhl groups 0, 1, 3 and 7). Both are unfoldingWord resources under CC BY-SA 4.0.
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const ES = 'es-419'
const UGL = 'es-419_gl/es-419/ugl'
const UHL = 'es-419_gl/es-419/uhl'

const sampleSource = () => partsSource({ list: join(DATA, 'es-419', 'list.json'), partsDir: join(DATA, 'parts') })

// Synthetic sources

const ref = (key: string, kind: string, stamp = '60a78e039b#2026-10-27T11_47_33Z'): ResourceRef => ({ key, stamp, kind, books: [] })
const ugl = (key = UGL) => ref(key, 'Greek Lexicon')
const uhl = (key = UHL) => ref(key, 'Hebrew Lexicon', '3fc0fdd593#2026-10-27T11_48_59Z')

function fakeSource(resources: { ref: ResourceRef; rows: Row[] }[], others: ResourceRef[] = []): RowSource {
  return {
    async resources() {
      return [...resources.map((r) => r.ref), ...others]
    },
    async *rows(f: RowFilter) {
      for (const r of resources) {
        if (f.resource !== undefined && r.ref.key !== f.resource) continue
        for (const row of r.rows) if (f.layer === undefined || row.layer === f.layer) yield row
      }
    },
  }
}

type SenseIn = Record<string, unknown>
const entryIn = (strong: string, extra: Record<string, unknown> = {}, senses: SenseIn[] = [{ definition: `d ${strong}` }]) => ({
  strong,
  lemma: `l ${strong}`,
  pos: ['n.'],
  senses,
  ...extra,
})
const file = (key: string, n: number, entries: unknown[], brief = `b ${n}`, long = `l ${n}`): Row => ({
  layer: 'sot',
  key: `${key}/content/${n}.json`,
  value: { brief, entries, long },
})

async function build(resources: { ref: ResourceRef; rows: Row[] }[], others: ResourceRef[] = []) {
  const issues: string[] = []
  const groups = await extractLexicon(fakeSource(resources, others), ES, issues)
  return { groups, issues }
}

const id = (book: string, chapter: number, verse: number) => verseId(book, chapter, verse)
const one = (book: string, chapter: number, verse: number): [number, number] => [id(book, chapter, verse), id(book, chapter, verse)]

// Hebrew numbering

describe('the Hebrew numbering', () => {
  /** The places of a range `a-b` of the table, as `[chapter, verse]`. */
  const expand = (side: string): [string, number, number][] => {
    const m = /^([1-3A-Z][A-Z]{2}) (\d+):(\d+)(?:-(\d+))?$/.exec(side)!
    const from = Number(m[3])
    const to = Number(m[4] ?? m[3])
    return Array.from({ length: to - from + 1 }, (_, i): [string, number, number] => [m[1], Number(m[2]), from + i])
  }

  test('the table has 144 entries, and every run is as long on both sides', () => {
    const entries = Object.entries(HEBREW_NUMBERING)
    expect(entries).toHaveLength(144)
    for (const [ours, theirs] of entries) expect(expand(ours).length).toBe(expand(theirs).length)
  })

  test('the inverse is well defined: 2031 places of the UHB, 2031 different places of the Hebrew Bible, and each one comes back', () => {
    const hebrew = new Set<string>()
    const ours = new Set<string>()
    for (const [o, h] of Object.entries(HEBREW_NUMBERING)) {
      const a = expand(o)
      const b = expand(h)
      a.forEach(([book, chapter, verse], i) => {
        ours.add(`${book} ${chapter}:${verse}`)
        hebrew.add(`${b[i][0]} ${b[i][1]}:${b[i][2]}`)
        expect(fromHebrewNumbering(b[i][0], { chapter: b[i][1], verse: b[i][2] })).toEqual({ chapter, verse })
      })
    }
    expect(ours.size).toBe(2031)
    expect(hebrew.size).toBe(2031)
  })

  test('the title of a psalm is verse 0, and Jonah 2:1 is 1:17', () => {
    expect(fromHebrewNumbering('PSA', { chapter: 3, verse: 1 })).toEqual({ chapter: 3, verse: 0 })
    expect(fromHebrewNumbering('PSA', { chapter: 3, verse: 2 })).toEqual({ chapter: 3, verse: 1 })
    expect(fromHebrewNumbering('PSA', { chapter: 51, verse: 2 })).toEqual({ chapter: 51, verse: 0 })
    expect(fromHebrewNumbering('PSA', { chapter: 51, verse: 3 })).toEqual({ chapter: 51, verse: 1 })
    expect(fromHebrewNumbering('JON', { chapter: 2, verse: 1 })).toEqual({ chapter: 1, verse: 17 })
    expect(fromHebrewNumbering('JON', { chapter: 2, verse: 2 })).toEqual({ chapter: 2, verse: 1 })
    expect(fromHebrewNumbering('GEN', { chapter: 32, verse: 1 })).toEqual({ chapter: 31, verse: 55 })
  })

  test('a place the table does not list comes back unchanged, and so does any place of the New Testament', () => {
    expect(fromHebrewNumbering('GEN', { chapter: 1, verse: 1 })).toEqual({ chapter: 1, verse: 1 })
    expect(fromHebrewNumbering('PSA', { chapter: 23, verse: 1 })).toEqual({ chapter: 23, verse: 1 })
    expect(fromHebrewNumbering('JON', { chapter: 3, verse: 4 })).toEqual({ chapter: 3, verse: 4 })
    // A Hebrew place the table has as a UHB place only (the first line of a psalm's title) has no counterpart: unchanged.
    expect(fromHebrewNumbering('PSA', { chapter: 51, verse: 1 })).toEqual({ chapter: 51, verse: 1 })
    expect(fromHebrewNumbering('MAT', { chapter: 1, verse: 1 })).toEqual({ chapter: 1, verse: 1 })
    expect(fromHebrewNumbering('ROM', { chapter: 3, verse: 23 })).toEqual({ chapter: 3, verse: 23 })
  })

  test('the book code can be in any case, and the place given is not changed', () => {
    const place = { chapter: 3, verse: 1 }
    expect(fromHebrewNumbering('psa', place)).toEqual({ chapter: 3, verse: 0 })
    expect(fromHebrewNumbering(' Psa ', place)).toEqual({ chapter: 3, verse: 0 })
    expect(place).toEqual({ chapter: 3, verse: 1 })
    const same = { chapter: 1, verse: 1 }
    expect(fromHebrewNumbering('gen', same)).not.toBe(same)
  })
})

// References

describe('readRefs', () => {
  test('one verse', () => {
    expect(readRefs('jhn', '3:16', false)).toEqual([one('jhn', 3, 16)])
  })

  test('a list of verses of a chapter gives one range for each verse (1 Chronicles 2:17 and 2:44)', () => {
    expect(readRefs('1ch', '2:17,44', true)).toEqual([one('1ch', 2, 17), one('1ch', 2, 44)])
    // Verses that follow one another are not merged.
    expect(readRefs('jhn', '1:1,2,3', false)).toEqual([one('jhn', 1, 1), one('jhn', 1, 2), one('jhn', 1, 3)])
  })

  test('chapter groups separated by semicolons', () => {
    expect(readRefs('heb', '6:4,18;10:4;11:6', false)).toEqual([one('heb', 6, 4), one('heb', 6, 18), one('heb', 10, 4), one('heb', 11, 6)])
  })

  test('a dash range is one range, inside a chapter and across chapters', () => {
    expect(readRefs('jhn', '3:1-4', false)).toEqual([[id('jhn', 3, 1), id('jhn', 3, 4)]])
    expect(readRefs('jhn', '3:1-4,9;4:2', false)).toEqual([[id('jhn', 3, 1), id('jhn', 3, 4)], one('jhn', 3, 9), one('jhn', 4, 2)])
    expect(readRefs('jhn', '3:1-4:2', false)).toEqual([[id('jhn', 3, 1), id('jhn', 4, 2)]])
  })

  test('spaces and leading zeros are read', () => {
    expect(readRefs('jhn', ' 3:16 ; 04:02', false)).toEqual([one('jhn', 3, 16), one('jhn', 4, 2)])
  })

  test('the Hebrew numbering is converted to the UHB: the title of Psalm 3 and Jonah 2:1', () => {
    expect(readRefs('psa', '3:1,2', true)).toEqual([one('psa', 3, 0), one('psa', 3, 1)])
    expect(readRefs('psa', '51:2-5', true)).toEqual([[id('psa', 51, 0), id('psa', 51, 3)]])
    expect(readRefs('jon', '2:1-3', true)).toEqual([[id('jon', 1, 17), id('jon', 2, 2)]])
    // The same text in a lexicon that is not Hebrew is not converted.
    expect(readRefs('psa', '3:1,2', false)).toEqual([one('psa', 3, 1), one('psa', 3, 2)])
  })

  test('what is not one of the forms gives null', () => {
    for (const text of ['', ';', '3', '3:', ':3', '3:x', '3:1,', '3:1;', '3:1;;4:1', '3:5-2', '3:1-4:x', '4:1-3:1', '1000:1', '3:1000', '3 1', '3:1.5', '-3:1', 'JHN 3:16']) {
      expect(readRefs('jhn', text, false)).toBeNull()
    }
  })

  test('a book that is not one of the 66 gives null', () => {
    expect(readRefs('xyz', '1:1', false)).toBeNull()
  })
})

describe('Strong numbers and groups', () => {
  test('the group is the letter and the thousands of the number', () => {
    expect(lexGroupOf('G1')).toBe('G0')
    expect(lexGroupOf('G976')).toBe('G0')
    expect(lexGroupOf('G999')).toBe('G0')
    expect(lexGroupOf('G1000')).toBe('G1')
    expect(lexGroupOf('G5485')).toBe('G5')
    expect(lexGroupOf('G54850')).toBe('G54')
    expect(lexGroupOf('H0001')).toBe('H0')
    expect(lexGroupOf('H0999')).toBe('H0')
    expect(lexGroupOf('H1000')).toBe('H1')
    expect(lexGroupOf('H8674')).toBe('H8')
  })

  test('the letters after the number only tell homonyms apart', () => {
    expect(lexGroupOf('G127a')).toBe('G0')
    expect(lexGroupOf('H0138b')).toBe('H0')
    expect(lexGroupOf('H7462b')).toBe('H7')
    expect(parseStrong('G1003b')).toEqual(['G', 1003])
  })

  test('anything else has no group', () => {
    for (const text of ['', 'X12', 'G', 'g12', '12', 'GA']) expect(lexGroupOf(text)).toBeNull()
  })
})

// The entries

describe('extractLexicon on synthetic rows', () => {
  test('the group of an entry: G999 is G0 and G1000 is G1; H0001 is H0 and H8674 is H8', async () => {
    const { groups } = await build([
      { ref: ugl(), rows: [file(UGL, 999, [entryIn('G999')]), file(UGL, 1000, [entryIn('G1000')]), file(UGL, 5485, [entryIn('G5485')])] },
      { ref: uhl(), rows: [file(UHL, 1, [entryIn('H0001')]), file(UHL, 8674, [entryIn('H8674')]), file(UHL, 10, [entryIn('H0010')])] },
    ])
    expect([...groups.keys()]).toEqual(['G0', 'G1', 'G5', 'H0', 'H8'])
    expect(groups.get('G0')!.map((e) => e.strong)).toEqual(['G999'])
    expect(groups.get('G1')!.map((e) => e.strong)).toEqual(['G1000'])
    expect(groups.get('H0')!.map((e) => e.strong)).toEqual(['H0001', 'H0010'])
    expect(groups.get('H8')!.map((e) => e.strong)).toEqual(['H8674'])
  })

  test('groups are in the order of their letter and their number, not of the text (G9 before G10)', async () => {
    const { groups } = await build([{ ref: ugl(), rows: [file(UGL, 10000, [entryIn('G10000')]), file(UGL, 9000, [entryIn('G9000')]), file(UGL, 2000, [entryIn('G2000')])] }])
    expect([...groups.keys()]).toEqual(['G2', 'G9', 'G10'])
  })

  test('the subjects are Greek Lexicon and Hebrew Lexicon; any other resource is ignored', async () => {
    const other = ref('es-419_gl/es-419/tw', 'Translation Words')
    const { groups } = await build([{ ref: ugl(), rows: [file(UGL, 1, [entryIn('G1')])] }], [other, ref('x/es-419/lexicon', 'Lexicon')])
    expect([...groups.keys()]).toEqual(['G0'])
    expect((await build([], [other])).groups.size).toBe(0)
  })

  test('entries are ordered by Strong number and then by file order, whatever the order of the rows', async () => {
    const { groups } = await build([
      {
        ref: ugl(),
        rows: [
          file(UGL, 30, [entryIn('G30')]),
          file(UGL, 127, [entryIn('G127', { lemma: 'x1' }), entryIn('G127a', { lemma: 'x2' })]),
          file(UGL, 5, [entryIn('G5')]),
          file(UGL, 127, [entryIn('G127', { lemma: 'y1' })]),
          file(UGL, 9, [entryIn('G9b'), entryIn('G9a')]),
        ],
      },
    ])
    expect(groups.get('G0')!.map((e) => `${e.strong}:${e.lemma}`)).toEqual(['G5:l G5', 'G9b:l G9b', 'G9a:l G9a', 'G30:l G30', 'G127:x1', 'G127a:x2', 'G127:y1'])
  })

  test('brief and long belong to the file: a homonym file gives them to each of its entries', async () => {
    const { groups } = await build([{ ref: ugl(), rows: [file(UGL, 127, [entryIn('G127'), entryIn('G127a')], 'modestia', 'una cualidad: modestia'), file(UGL, 128, [entryIn('G128')], 'otra', 'otra larga')] }])
    expect(groups.get('G0')!.map((e) => [e.strong, e.brief, e.long])).toEqual([
      ['G127', 'modestia', 'una cualidad: modestia'],
      ['G127a', 'modestia', 'una cualidad: modestia'],
      ['G128', 'otra', 'otra larga'],
    ])
  })

  test('the entry is kept as published: keys, pos, notes, aramaic, and the strong with its letters', async () => {
    const senses = [{ code: '1.2', definition: 'd', glosses: ['a', 'b'], domain: 'dom', domainCode: '001', comments: 'c', etymology: 'e', lang: 'en', definitionLang: 'en' }]
    const { groups, issues } = await build([
      { ref: uhl(), rows: [file(UHL, 138, [entryIn('H0138a', { aramaic: true, notes: ['n1', 'n2'], source: 'en_uhl', review: 'pending' }, senses)])] },
    ])
    expect(groups.get('H0')![0]).toEqual({
      res: UHL,
      strong: 'H0138a',
      lemma: 'l H0138a',
      brief: 'b 138',
      long: 'l 138',
      pos: ['n.'],
      senses,
      notes: ['n1', 'n2'],
      aramaic: true,
      source: 'en_uhl',
      review: 'pending',
    })
    expect(issues).toEqual([])
  })

  test('the Hebrew numbering is applied to the Hebrew lexicon and not to the Greek one', async () => {
    const senses = [{ refs: { PSA: '3:1;51:2', JON: '2:1' } }]
    const { groups } = await build([
      { ref: uhl(), rows: [file(UHL, 1, [entryIn('H0001', {}, senses)])] },
      { ref: ugl(), rows: [file(UGL, 1, [entryIn('G1', {}, senses)])] },
    ])
    expect(groups.get('H0')![0].senses[0].refs).toEqual([one('psa', 3, 0), one('psa', 51, 0), one('jon', 1, 17)])
    expect(groups.get('G0')![0].senses[0].refs).toEqual([one('psa', 3, 1), one('psa', 51, 2), one('jon', 2, 1)])
  })

  test('book codes are lowercased to the 66 codes, and a sense can have refs of more than one book', async () => {
    const { groups } = await build([{ ref: uhl(), rows: [file(UHL, 1, [entryIn('H0001', {}, [{ refs: { '1CH': '2:17,44', SNG: '1:1', JOL: '3:1' } }])])] }])
    // Joel 3:1 of the Hebrew Bible is 2:28 of the UHB.
    expect(groups.get('H0')![0].senses[0].refs).toEqual([one('1ch', 2, 17), one('1ch', 2, 44), one('sng', 1, 1), one('jol', 2, 28)])
  })

  test('a reference that cannot be read is kept out of refs and counted: one line for each entry', async () => {
    const senses = [{ definition: 'd', refs: { JHN: '3:16', MAT: 'x', XYZ: '1:1' } }, { definition: 'd', refs: { ROM: '1:1;' } }, { definition: 'no refs' }]
    const { groups, issues } = await build([{ ref: ugl(), rows: [file(UGL, 1, [entryIn('G1', {}, senses)])] }])
    expect(groups.get('G0')![0].senses.map((s) => s.refs)).toEqual([[one('jhn', 3, 16)], undefined, undefined])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain(`G1 (${UGL})`)
    expect(issues[0]).toContain('2 references cannot be read')
    expect(issues[0]).toContain('ROM "1:1;"')
    expect(issues[0]).toContain('MAT "x"')
    expect(issues[0]).toContain('XYZ "1:1"')
  })

  test('refs that is empty gives a sense without refs', async () => {
    const { groups, issues } = await build([{ ref: ugl(), rows: [file(UGL, 1, [entryIn('G1', {}, [{ definition: 'd', refs: {} }])])] }])
    expect('refs' in groups.get('G0')![0].senses[0]).toBe(false)
    expect(issues).toEqual([])
  })

  test('placeholders and empty senses are kept, and the report counts them', async () => {
    const senses = [{ glosses: ['[Glosses - es]'], definition: '' }, { definition: 'NEW NOTE' }, { definition: '', glosses: [] }, { definition: 'bien' }]
    const { groups, issues } = await build([{ ref: ugl(), rows: [file(UGL, 1, [entryIn('G1', { notes: ['NEW NOTE'] }, senses)])] }])
    expect(groups.get('G0')![0].senses).toEqual(senses)
    expect(issues).toEqual([`${UGL}: 3 senses or notes hold a placeholder ([Glosses - es], NEW NOTE) and 1 senses have no definition and no glosses: kept as published`])
  })

  test('the rows of domains are not part of lex: one line says how many', async () => {
    const domains: Row[] = ['001', '002'].map((code) => ({ layer: 'sot', key: `${UGL}/domains/${code}.json`, value: { name: 'x', words: [] } }))
    const { groups, issues } = await build([{ ref: ugl(), rows: [file(UGL, 1, [entryIn('G1')]), ...domains] }])
    expect([...groups.keys()]).toEqual(['G0'])
    expect(issues).toEqual([`${UGL}: 2 rows of domains are not part of lex in phase 1: left out`])
  })

  test('files with only brief and long (a lexicon that has no entries) give no group, and the report says so once', async () => {
    const rows: Row[] = [1, 2, 3].map((n) => ({ layer: 'sot', key: `${UHL}/content/${n}.json`, value: { brief: 'father', long: 'Meaning: father' } }))
    const { groups, issues } = await build([{ ref: uhl(), rows }])
    expect(groups.size).toBe(0)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('3 files have no entries')
  })

  test('a key that lex.cddl does not have is left out and reported; so is a row that is not a lexicon file', async () => {
    const rows = [file(UGL, 1, [{ ...entryIn('G1', { future: 1 }, [{ definition: 'd', future2: true }]) }]), { layer: 'sot', key: `${UGL}/readme.md`, value: 'x' }]
    const { groups, issues } = await build([{ ref: ugl(), rows }])
    expect(groups.get('G0')![0]).not.toHaveProperty('future')
    expect(groups.get('G0')![0].senses[0]).not.toHaveProperty('future2')
    expect(issues).toHaveLength(2)
    expect(issues.some((line) => line.includes('"future"') && line.includes('"future2"') && line.startsWith(`G1 (${UGL})`))).toBe(true)
    expect(issues.some((line) => line.includes('readme.md'))).toBe(true)
  })

  test('two entries with the same Strong number are both kept, and the report says so', async () => {
    const { groups, issues } = await build([{ ref: uhl(), rows: [file(UHL, 870, [entryIn('H0870', { lemma: 'a' }), entryIn('H0870', { lemma: 'b' })])] }])
    expect(groups.get('H0')!.map((e) => e.lemma)).toEqual(['a', 'b'])
    expect(issues).toEqual([`${UHL}: 1 Strong numbers are in more than one entry (H0870): all kept`])
  })

  test('two resources of one subject: the first by key is used, and a line says it', async () => {
    const other = 'a_owner/es-419/ugl'
    const { groups, issues } = await build([
      { ref: ugl(), rows: [file(UGL, 1, [entryIn('G1', { lemma: 'z' })])] },
      { ref: ugl(other), rows: [file(other, 1, [entryIn('G1', { lemma: 'a' })])] },
    ])
    expect(groups.get('G0')!.map((e) => [e.res, e.lemma])).toEqual([[other, 'a']])
    expect(issues).toEqual([`2 resources of Greek Lexicon (${other}, ${UGL}); ${other} is used`])
  })

  test('rows that are not what format 2.0 writes throw Error naming the row', async () => {
    const bad = async (rows: Row[], resource = ugl(), text = '') => {
      await expect(build([{ ref: resource, rows }])).rejects.toThrow(text)
    }
    await bad([{ layer: 'sot', key: `${UGL}/content/1.json`, value: 'x' }], ugl(), 'content/1.json: the file is not an object')
    await bad([{ layer: 'sot', key: `${UGL}/content/1.json`, value: { entries: {} } }], ugl(), 'entries is not a list')
    await bad([file(UGL, 1, [entryIn('H0001')])], ugl(), 'is not a G followed by a number')
    await bad([file(UHL, 1, [entryIn('G1')])], uhl(), 'is not a H followed by a number')
    await bad([file(UGL, 1, [entryIn('X1')])], ugl(), 'X1')
    await bad([file(UGL, 1, [{ ...entryIn('G1'), lemma: 4 }])], ugl(), 'lemma is not text')
    await bad([file(UGL, 1, [{ ...entryIn('G1'), senses: {} }])], ugl(), 'senses is not a list')
    await bad([file(UGL, 1, [entryIn('G1', {}, [{ glosses: 'x' }])])], ugl(), 'glosses of a sense is not a list of text')
    await bad([file(UGL, 1, [entryIn('G1', {}, [{ code: 3 }])])], ugl(), 'code of a sense is not text')
    await bad([file(UGL, 1, [entryIn('G1', { aramaic: 'yes' })])], ugl(), 'aramaic is not true or false')
    await bad([file(UGL, 1, [entryIn('G1', { pos: [1] })])], ugl(), 'pos is not a list of text')
    await bad([file(UGL, 1, ['x'])], ugl(), 'is not an object')
  })

  test('the same rows give the same entries and the same bytes', async () => {
    const rows = [file(UGL, 3, [entryIn('G3', {}, [{ refs: { JHN: '3:16' } }])]), file(UGL, 1, [entryIn('G1')])]
    const a = await build([{ ref: ugl(), rows }])
    const b = await build([{ ref: ugl(), rows: [...rows] }])
    expect(b.groups).toEqual(a.groups)
    const segment = async (groups: Map<string, LexEntry[]>) => (await writeSegment(lexSegment(ES, 'G0', [[UGL, '60a78e039b']], groups.get('G0')!))).bytes
    expect(await segment(b.groups)).toEqual(await segment(a.groups))
  })
})

describe('lexResources', () => {
  test('the resources of the entries, as [key, release tag], sorted by key', () => {
    const entries = [{ res: UHL }, { res: UGL }, { res: UHL }] as LexEntry[]
    expect(lexResources(entries, [ugl(), uhl()])).toEqual([
      [UGL, '60a78e039b'],
      [UHL, '3fc0fdd593'],
    ])
  })

  test('an entry of a resource that is not given throws', () => {
    expect(() => lexResources([{ res: UGL }] as LexEntry[], [uhl()])).toThrow('is not one of the resources given')
  })
})

// Real files

describe('the es-419 Greek lexicon of the sample', () => {
  let groups: Map<string, LexEntry[]>
  let issues: string[]
  let refs: ResourceRef[]

  beforeAll(async () => {
    const source = await sampleSource()
    issues = []
    groups = await extractLexicon(source, ES, issues)
    refs = await source.resources(ES)
  })

  test('the part gives the group G0 only, and every Strong number is below 1000', () => {
    expect([...groups.keys()]).toEqual(['G0'])
    const entries = groups.get('G0')!
    expect(entries).toHaveLength(994)
    for (const entry of entries) {
      const [letter, number] = parseStrong(entry.strong)!
      expect(letter).toBe('G')
      expect(number).toBeLessThan(1000)
      expect(entry.res).toBe(UGL)
    }
    const numbers = entries.map((entry) => parseStrong(entry.strong)![1])
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })

  test('the entry of the number 1 has the lemma ἄλφα (the lexicon publishes it as G1a)', () => {
    const entry = groups.get('G0')!.find((e) => e.strong === 'G1a')!
    expect(entry.lemma).toBe('ἄλφα')
    expect(entry.brief).toBe('alfa')
    expect(entry.senses[0].definition).toBe('el primero de una serie, con implicaciones de ser significativo o de importancia')
    expect(entry.senses[0].glosses).toEqual(['alfa', 'el primero', 'el principio'])
    expect(groups.get('G0')!.some((e) => e.strong === 'G1')).toBe(false)
  })

  test('a homonym file gives brief and long to both entries', () => {
    const [a, b] = groups.get('G0')!.filter((e) => e.strong === 'G127' || e.strong === 'G127a')
    expect([a.strong, b.strong]).toEqual(['G127', 'G127a'])
    expect(a.brief).toBe('modestia, reverencia')
    expect(b.brief).toBe(a.brief)
    expect(b.long).toBe(a.long)
    expect(a.long!.startsWith('1) cualidad de modestia')).toBe(true)
  })

  test('every ref is a range of one verse of the New Testament', () => {
    let count = 0
    for (const entry of groups.get('G0')!) {
      for (const sense of entry.senses) {
        for (const [from, to] of sense.refs ?? []) {
          count++
          expect(from).toBe(to)
          expect(from).toBeGreaterThan(40_000_000)
          expect(from).toBeLessThan(67_000_000)
        }
      }
    }
    expect(count).toBeGreaterThan(1000)
    const heb = groups.get('G0')!.flatMap((e) => e.senses).find((s) => (s.refs ?? []).some(([from]) => from === id('heb', 6, 18)))
    expect(heb).toBeDefined()
  })

  test('the report is about placeholders only', () => {
    expect(issues.every((line) => line.includes('placeholder') || line.includes('Strong numbers'))).toBe(true)
  })

  test('segment → file → reader gives the entries back, and the segment is small', async () => {
    const entries = groups.get('G0')!
    const res = lexResources(entries, refs)
    expect(res).toEqual([[UGL, '60a78e039b']])
    const { bytes } = await writeSegment(lexSegment(ES, 'G0', res, entries))
    const { seg, skipped } = await readSegment(bytes, { known: LEX_TABLES })
    expect(skipped).toEqual([])
    expect(seg.h).toEqual({ class: 'lex', v: 1, tables: { entries: [1, true] }, lang: ES, group: 'G0', res: [[UGL, '60a78e039b']] })
    expect(lexView(seg)).toEqual({ group: 'G0', entries })
    // The part weighs 261 670 bytes as gzip of JSONL; v1 keeps the entries in their published shape, without columns
    // (lex.cddl), and weighs 287 529 bytes: about 10% more, as phase 0 found (3 725 KB against 3 636 KB for the whole of es-419).
    expect(bytes.length).toBeGreaterThan(200_000)
    expect(bytes.length).toBeLessThan(300_000)
  })
})

describe('real rows of the es-419 Hebrew lexicon', () => {
  const rows = fixture as Row[]

  test('the Hebrew numbering is applied: Psalm 51:7 is 51:5, Jonah 2:7 is 2:6, and what the table does not list stays', async () => {
    const { groups, issues } = await build([{ ref: uhl(), rows }])
    expect([...groups.keys()]).toEqual(['H0', 'H1', 'H3', 'H7'])
    const refsOf = (strong: string) => [...groups.values()].flat().find((e) => e.strong === strong)!.senses.flatMap((s) => s.refs ?? [])
    expect(refsOf('H3179')).toEqual([one('gen', 30, 38), one('gen', 30, 39), one('gen', 30, 41), one('gen', 31, 10), one('psa', 51, 5)])
    expect(refsOf('H7095')).toEqual([one('1ki', 6, 25), one('1ki', 7, 37), one('jon', 2, 6)])
    expect(refsOf('H1791a')).toEqual([one('ezr', 5, 16), one('ezr', 5, 17), one('ezr', 6, 7), one('ezr', 6, 8), one('ezr', 6, 12)])
    expect(issues.filter((line) => line.includes('cannot be read'))).toEqual([])
  })

  test('the homonyms of one file repeat brief and long; aramaic is kept', async () => {
    const { groups } = await build([{ ref: uhl(), rows }])
    const [a, b] = groups.get('H1')!
    expect([a.strong, b.strong]).toEqual(['H1791a', 'H1791b'])
    expect(a.brief).toBeDefined()
    expect([b.brief, b.long]).toEqual([a.brief, a.long])
    expect(a.aramaic).toBe(true)
    expect(groups.get('H0')![0].strong).toBe('H0230')
    expect(groups.get('H0')![0].aramaic).toBe(true)
  })

  test('segment → file → reader gives the Hebrew entries back', async () => {
    const { groups } = await build([{ ref: uhl(), rows }])
    for (const [group, entries] of groups) {
      const res = lexResources(entries, [uhl()])
      const { bytes } = await writeSegment(lexSegment(ES, group, res, entries))
      const { seg } = await readSegment(bytes, { known: LEX_TABLES })
      expect(lexView(seg)).toEqual({ group, entries })
    }
  })
})

describe('lexSegment', () => {
  const entries = (): LexEntry[] => [
    { res: UGL, strong: 'G30', lemma: 'c', senses: [{ definition: 'd' }] },
    { res: UGL, strong: 'G5', lemma: 'a', brief: 'b', long: 'l', pos: ['n.'], senses: [{ glosses: ['g'], refs: [one('jhn', 3, 16)] }], notes: ['n'] },
    { res: UGL, strong: 'G127a', lemma: 'e', senses: [] },
    { res: UGL, strong: 'G127', lemma: 'd', senses: [{}] },
  ]
  const res: [string, string][] = [[UGL, 'v1']]

  test('the header and the table: ordered by the Strong number, and entries of one number in the order given', () => {
    const seg = lexSegment(ES, 'G0', res, entries())
    expect(seg.h).toEqual({ class: 'lex', v: 1, tables: { entries: [1, true] }, lang: ES, group: 'G0', res })
    expect((seg.t.entries as { strong: string }[]).map((e) => e.strong)).toEqual(['G5', 'G30', 'G127a', 'G127'])
  })

  test('the view gives the entries back in that order, with their keys as they were', () => {
    const view = lexView(lexSegment(ES, 'G0', res, entries()))
    expect(view.entries.map((e) => e.strong)).toEqual(['G5', 'G30', 'G127a', 'G127'])
    expect(view.entries[0]).toEqual(entries()[1])
    expect(view.entries[3]).toEqual({ res: UGL, strong: 'G127', lemma: 'd', senses: [{}] })
  })

  test('a key an entry lacks is left out, and an empty list of refs is kept', () => {
    const [entry] = (lexSegment(ES, 'G0', res, [{ res: UGL, strong: 'G1', lemma: 'l', senses: [{ refs: [] }] }]).t.entries as Record<string, unknown>[])
    expect(Object.keys(entry).sort()).toEqual(['lemma', 'res', 'senses', 'strong'])
    expect(entry.senses).toEqual([{ refs: [] }])
  })

  test('the same entries in another order give the same bytes when their numbers differ', async () => {
    const list = () => [entries()[0], entries()[1], entries()[3]] // G30, G5, G127
    const a = (await writeSegment(lexSegment(ES, 'G0', res, list()))).bytes
    const b = (await writeSegment(lexSegment(ES, 'G0', res, list().reverse()))).bytes
    expect(b).toEqual(a)
  })

  test('throws for what the segment cannot hold', () => {
    const e = (): LexEntry => ({ res: UGL, strong: 'G1', lemma: 'l', senses: [] })
    expect(() => lexSegment(ES, 'g0', res, [e()])).toThrow('is not a letter G or H and a number')
    expect(() => lexSegment(ES, 'G', res, [e()])).toThrow('is not a letter G or H and a number')
    expect(() => lexSegment(ES, 'G0', [], [e()])).toThrow('at least one resource')
    expect(() => lexSegment(ES, 'G0', [[UGL, 'v1'], [UGL, 'v2']], [e()])).toThrow('is in res twice')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), res: UHL }])).toThrow('res does not list')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), strong: 'G1000' }])).toThrow('is of the group G1, not G0')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), strong: 'H0001' }])).toThrow('is of the group H0, not G0')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), strong: 'x' }])).toThrow('no Strong number')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), lemma: 3 as never }])).toThrow('no lemma')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), senses: undefined as never }])).toThrow('no list of senses')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), pos: 'n' as never }])).toThrow('pos is not a list of text')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), aramaic: 1 as never }])).toThrow('aramaic is not true or false')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), brief: 3 as never }])).toThrow('brief is not text')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), senses: [{ code: 3 as never }] }])).toThrow('code of a sense is not text')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), senses: [{ glosses: [1] as never }] }])).toThrow('glosses of a sense are not a list of text')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), senses: [{ refs: [[2, 1]] }] }])).toThrow('runs backwards')
    expect(() => lexSegment(ES, 'G0', res, [{ ...e(), senses: [{ refs: [[1.5, 2]] }] }])).toThrow('is not [from, to]')
  })
})

describe('a large lexicon', () => {
  test('20 000 entries are read and put in segments in a few seconds', async () => {
    const rows: Row[] = []
    for (let n = 1; n <= 20_000; n++) {
      rows.push(file(UGL, n, [entryIn(`G${n}`, {}, [{ definition: `definición ${n}`, glosses: ['a', 'b'], refs: { JHN: `${1 + (n % 20)}:${1 + (n % 30)},${2 + (n % 30)};3:${1 + (n % 9)}` } }])]))
    }
    rows.reverse()
    const started = performance.now()
    const issues: string[] = []
    const groups = await extractLexicon(fakeSource([{ ref: ugl(), rows }]), ES, issues)
    expect(groups.size).toBe(21)
    let total = 0
    for (const [group, entries] of groups) {
      total += entries.length
      const seg = lexSegment(ES, group, [[UGL, 'v1']], entries)
      expect((seg.t.entries as unknown[]).length).toBe(entries.length)
    }
    const elapsed = performance.now() - started
    expect(total).toBe(20_000)
    expect([...groups.keys()].slice(0, 3)).toEqual(['G0', 'G1', 'G2'])
    expect(groups.get('G0')!.map((e) => e.strong).slice(0, 3)).toEqual(['G1', 'G2', 'G3'])
    expect(issues).toEqual([])
    expect(elapsed).toBeLessThan(5000)
  })
})
