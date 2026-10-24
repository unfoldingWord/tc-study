import { describe, expect, test } from 'bun:test'
import { missingFromUnit, partInputs, unitInputs, unitOfSlot, type InputsContext, type ResourceFiles } from './partInputs'
import { lexiconGroupOf, slotId, slotOfRow, taGroupOf, twGroupOf, type PartSlot } from './partSlots'

const GLT = 'test_gl/es-419/glt'
const GST = 'test_gl/es-419/gst'
// A third text, with Jonah only: Ruth's alignments do not read it.
const RVR = 'test_gl/es-419/rvr'
const TN = 'test_gl/es-419/tn'
const TWL = 'test_gl/es-419/twl'
const TQ = 'test_gl/es-419/tq'
const TW = 'test_gl/es-419/tw'
const TA = 'test_gl/es-419/ta'
const UHL = 'test_gl/es-419/uhl'
const OBS = 'test_gl/es-419/obs'
const UHB = 'unfoldingWord/hbo/uhb'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const MACULA = 'Biblica/hbo/macula'

/** A fake blob sha naming the file, so a wrong file shows in a failure. */
const blob = (key: string, path: string) => `${key}#${path}`
const manifestOf = (key: string) => `manifest-of-${key}`

function resource(key: string, meta: { type: string; subject: string }, paths: string[], books?: Record<string, string>): ResourceFiles {
  return {
    key,
    ...meta,
    stamp: `v12#${key}`,
    // Every Door43 repository has one; a fingerprint takes it only normalized, never as a file.
    ...(key === MACULA ? {} : { manifest: manifestOf(key) }),
    files: new Map([...paths, ...(key === MACULA ? [] : ['manifest.yaml'])].map((p) => [p, blob(key, p)])),
    ...(books ? { books } : {}),
  }
}

const TEXT = { type: 'scripture', subject: 'Aligned Bible' }
const RESOURCES = [
  resource(GLT, TEXT, ['A0-FRT.usfm', '08-RUT.usfm', '32-JON.usfm'], { frt: './A0-FRT.usfm', rut: './08-RUT.usfm', jon: './32-JON.usfm' }),
  resource(GST, TEXT, ['08-RUT.usfm', '32-JON.usfm'], { rut: '08-RUT.usfm', jon: '32-JON.usfm' }),
  resource(RVR, TEXT, ['32-JON.usfm'], { jon: '32-JON.usfm' }),
  resource(TN, { type: 'notes', subject: 'TSV Translation Notes' }, ['tn_RUT.tsv', 'tn_JON.tsv'], { rut: 'tn_RUT.tsv', jon: 'tn_JON.tsv' }),
  resource(TWL, { type: 'unknown', subject: 'TSV Translation Words Links' }, ['twl_RUT.tsv', 'twl_JON.tsv'], { rut: 'twl_RUT.tsv', jon: 'twl_JON.tsv' }),
  // The README is mapped by no rule: every part of TQ reads it.
  resource(TQ, { type: 'questions', subject: 'TSV Translation Questions' }, ['tq_RUT.tsv', 'tq_JON.tsv', 'README.md'], { rut: 'tq_RUT.tsv', jon: 'tq_JON.tsv' }),
  resource(TW, { type: 'words', subject: 'Translation Words' }, [
    'bible/kt/god.md',
    'bible/kt/faith.md',
    'bible/kt/grace.md',
    'bible/kt/love.md',
    'bible/names/naomi.md',
    'bible/other/day.md',
    'bible/config.yaml',
    'LICENSE.md',
  ]),
  resource(TA, { type: 'academy', subject: 'Translation Academy' }, [
    'translate/figs-idiom/title.md',
    'translate/figs-idiom/sub-title.md',
    'translate/figs-idiom/01.md',
    'translate/figs-metaphor/title.md',
    'translate/figs-metaphor/01.md',
    'translate/toc.yaml',
    'translate/config.yaml',
    'checking/acceptable/01.md',
    'checking/toc.yaml',
    'README.md',
  ]),
  resource(UHL, { type: 'lexicon', subject: 'Hebrew Lexicon' }, ['content/H1961.json', 'content/H1234.json', 'content/H5281.json']),
  resource(OBS, { type: 'obs', subject: 'Open Bible Stories' }, ['content/01.md', 'content/02.md', 'LICENSE.md']),
  resource(UHB, { type: 'scripture', subject: 'Hebrew Old Testament' }, ['08-RUT.usfm', '32-JON.usfm'], { rut: '08-RUT.usfm', jon: '32-JON.usfm' }),
  resource(UGNT, { type: 'scripture', subject: 'Greek New Testament' }, ['57-TIT.usfm'], { tit: '57-TIT.usfm' }),
  resource(MACULA, { type: 'original-syntax', subject: 'Original Language Syntax' }, ['trees/RUT.json', 'referents/RUT.json', 'trees/JON.json']),
]

const ctxOf = (resources: ResourceFiles[]): InputsContext => ({
  resources: new Map(resources.map((r) => [r.key, r])),
  originalOf: (book) => (book === 'tit' ? UGNT : UHB),
})
const CTX = ctxOf(RESOURCES)

const filesOf = (slot: PartSlot) => partInputs(slot, CTX).files
const pathsOf = (slot: PartSlot, key = slot.resource) =>
  partInputs(slot, CTX)
    .files.filter(([r]) => r === key)
    .map(([, p]) => p)

describe('the files a part reads', () => {
  test('a literal text’s book reads only its file of that book, and its manifest', () => {
    const inputs = partInputs({ kind: 'book', resource: GLT, book: 'rut' }, CTX)
    expect(inputs.files).toEqual([[GLT, '08-RUT.usfm', blob(GLT, '08-RUT.usfm')]])
    expect(inputs.manifests).toEqual([[GLT, manifestOf(GLT)]])
    expect(inputs.stamps).toEqual([])
  })

  test('a book outside the canon is a book like any other', () => {
    expect(filesOf({ kind: 'book', resource: GLT, book: 'frt' })).toEqual([[GLT, 'A0-FRT.usfm', blob(GLT, 'A0-FRT.usfm')]])
  })

  test('a note book reads its TSV and the original’s book (its quotes), with both manifests', () => {
    const inputs = partInputs({ kind: 'book', resource: TN, book: 'rut' }, CTX)
    expect(inputs.files).toEqual([
      [TN, 'tn_RUT.tsv', blob(TN, 'tn_RUT.tsv')],
      [UHB, '08-RUT.usfm', blob(UHB, '08-RUT.usfm')],
    ])
    expect(inputs.manifests).toEqual([
      [TN, manifestOf(TN)],
      [UHB, manifestOf(UHB)],
    ])
  })

  test('word links and questions read the original’s book too', () => {
    expect(pathsOf({ kind: 'book', resource: TWL, book: 'jon' }, UHB)).toEqual(['32-JON.usfm'])
    expect(pathsOf({ kind: 'book', resource: TQ, book: 'jon' })).toEqual(['README.md', 'tq_JON.tsv'])
  })

  test('alignments add the book of every text that has it, and not a text without it', () => {
    const inputs = partInputs({ kind: 'alignments', resource: TN, book: 'rut' }, CTX)
    expect(inputs.files).toEqual([
      [GLT, '08-RUT.usfm', blob(GLT, '08-RUT.usfm')],
      [GST, '08-RUT.usfm', blob(GST, '08-RUT.usfm')],
      [TN, 'tn_RUT.tsv', blob(TN, 'tn_RUT.tsv')],
      [UHB, '08-RUT.usfm', blob(UHB, '08-RUT.usfm')],
    ])
    expect(inputs.manifests.map(([r]) => r)).toEqual([GLT, GST, TN, UHB])
    expect(filesOf({ kind: 'alignments', resource: TWL, book: 'jon' }).map(([r]) => r)).toEqual([GLT, GST, RVR, TWL, UHB])
  })

  test('a book its release has no file for (its catalog names another path) reads the release stamp, its keys carry it', () => {
    // bookContentStamp falls back to the release stamp when the book has no blob: a new tag changes those keys.
    const tn = resource(TN, { type: 'notes', subject: 'TSV Translation Notes' }, ['tn_RUT.tsv', 'tn_JON.tsv'], { rut: './RUT.tsv', jon: 'tn_JON.tsv' })
    const ctx = ctxOf([...RESOURCES.filter((x) => x.key !== TN && x.key !== GST), tn, { ...RESOURCES.find((x) => x.key === GST)!, books: { rut: 'RUT.usfm', jon: '32-JON.usfm' } }])
    for (const kind of ['book', 'alignments'] as const) {
      expect(partInputs({ kind, resource: TN, book: 'rut' }, ctx).stamps).toContainEqual([TN, `v12#${TN}`])
      expect(partInputs({ kind, resource: TN, book: 'jon' }, ctx).stamps).toEqual([])
    }
    // A text the alignments read whose book is so stamped: its stamp too.
    expect(partInputs({ kind: 'alignments', resource: TWL, book: 'rut' }, ctx).stamps).toEqual([[GST, `v12#${GST}`]])
    expect(unitInputs('book rut', keysOf('book rut'), ctx).stamps).toEqual([
      [GST, `v12#${GST}`],
      [TN, `v12#${TN}`],
    ])
    expect(unitInputs('book jon', keysOf('book jon'), ctx).stamps).toEqual([])
  })

  test('an original’s book reads its file; MACULA’s, its trees and referents of the book', () => {
    expect(filesOf({ kind: 'original', resource: UGNT, book: 'tit' })).toEqual([[UGNT, '57-TIT.usfm', blob(UGNT, '57-TIT.usfm')]])
    expect(pathsOf({ kind: 'macula', resource: MACULA, book: 'rut' })).toEqual(['referents/RUT.json', 'trees/RUT.json'])
    expect(pathsOf({ kind: 'macula', resource: MACULA, book: 'jon' })).toEqual(['trees/JON.json'])
    expect(partInputs({ kind: 'macula', resource: MACULA, book: 'rut' }, CTX).manifests).toEqual([])
  })

  test('a TW group reads exactly its articles, by the group rows use, and the files no rule maps', () => {
    const kt = ['bible/kt/god.md', 'bible/kt/faith.md', 'bible/kt/grace.md', 'bible/kt/love.md']
    const groups = new Set(kt.map((p) => twGroupOf(p)!))
    for (const group of groups) {
      const articles = kt.filter((p) => twGroupOf(p) === group)
      expect(pathsOf({ kind: 'tw', resource: TW, group })).toEqual(['LICENSE.md', 'bible/config.yaml', ...articles].sort())
    }
    expect(pathsOf({ kind: 'tw', resource: TW, group: twGroupOf('bible/names/naomi.md')! })).toEqual(['LICENSE.md', 'bible/config.yaml', 'bible/names/naomi.md'])
  })

  test('a TW article file and its rows (source and prepared) are in one group', () => {
    const tw = { key: TW, type: 'words', subject: 'Translation Words' }
    const sot = slotOfRow({ layer: 'sot', key: `${TW}/bible/kt/god` }, tw)
    expect(sot?.group).toBe(twGroupOf('bible/kt/god.md')!)
    expect(slotOfRow({ layer: 'prepared', key: `prepared:words:${TW}:bible/kt/god:bible/kt/god:full` }, tw)).toEqual(sot)
    expect(pathsOf(sot!)).toContain('bible/kt/god.md')
  })

  test('a TA article’s files and rows are in one group; a manual’s own files in every group of it', () => {
    const ta = { key: TA, type: 'academy', subject: 'Translation Academy' }
    const sot = slotOfRow({ layer: 'sot', key: `${TA}/translate/figs-idiom` }, ta)
    expect(sot?.group).toBe(taGroupOf('translate/figs-idiom/title.md')!)
    expect(slotOfRow({ layer: 'prepared', key: `prepared:academy:${TA}:translate/figs-idiom:translate/figs-idiom:full` }, ta)).toEqual(sot)
    expect(pathsOf(sot!)).toEqual(expect.arrayContaining(['translate/figs-idiom/title.md', 'translate/figs-idiom/sub-title.md', 'translate/figs-idiom/01.md']))
    for (let n = 0; n < 4; n++) {
      const paths = pathsOf({ kind: 'ta', resource: TA, group: `translate:${n}` })
      // Not only in the group its name would hash to: it is the manual's, not an article's.
      expect(paths).toEqual(expect.arrayContaining(['translate/toc.yaml', 'translate/config.yaml', 'README.md']))
      expect(paths).not.toContain('checking/toc.yaml')
      for (const article of ['figs-idiom', 'figs-metaphor']) {
        expect(paths.includes(`translate/${article}/01.md`)).toBe(taGroupOf(`translate/${article}`) === `translate:${n}`)
      }
    }
    expect(pathsOf({ kind: 'ta', resource: TA, group: 'checking' })).toEqual(['README.md', 'checking/acceptable/01.md', 'checking/toc.yaml'])
  })

  test('titles read every file of their resource and its release stamp', () => {
    const inputs = partInputs({ kind: 'titles', resource: TW }, CTX)
    expect(inputs.files.map(([, p]) => p)).toEqual([...RESOURCES.find((r) => r.key === TW)!.files.keys()].filter((p) => p !== 'manifest.yaml').sort())
    expect(inputs.stamps).toEqual([[TW, `v12#${TW}`]])
    expect(partInputs({ kind: 'titles', resource: TA }, CTX).stamps).toEqual([[TA, `v12#${TA}`]])
  })

  test('a lexicon group reads the row files of its group, as rows are placed', () => {
    const uhl = { key: UHL, type: 'lexicon', subject: 'Hebrew Lexicon' }
    const group = slotOfRow({ layer: 'sot', key: `${UHL}/content/H1961.json` }, uhl)?.group
    expect(group).toBe(lexiconGroupOf('content/H1961.json'))
    expect(pathsOf({ kind: 'lexicon', resource: UHL, group: group! })).toEqual(['content/H1234.json', 'content/H1961.json'])
    expect(pathsOf({ kind: 'lexicon', resource: UHL, group: '5' })).toEqual(['content/H5281.json'])
  })

  test('an OBS part reads every file of OBS', () => {
    expect(pathsOf({ kind: 'obs', resource: OBS, group: '1-10' })).toEqual(['LICENSE.md', 'content/01.md', 'content/02.md'])
  })

  test('a file no rule maps is in every part of its resource, and of no other', () => {
    for (const book of ['rut', 'jon']) expect(pathsOf({ kind: 'book', resource: TQ, book })).toContain('README.md')
    for (const slot of [{ kind: 'book', resource: TN, book: 'rut' }, { kind: 'alignments', resource: TN, book: 'rut' }] as const) {
      expect(filesOf(slot).some(([r]) => r === TQ)).toBe(false)
    }
  })

  test('manifest.yaml is never a file input', () => {
    for (const slot of allSlots()) expect(filesOf(slot).some(([, p]) => p === 'manifest.yaml')).toBe(false)
  })

  test('a part of a resource the context lacks, or of a kind its resource has not, throws', () => {
    expect(() => partInputs({ kind: 'book', resource: 'x/y/z', book: 'rut' }, CTX)).toThrow(/x\/y\/z/)
    expect(() => partInputs({ kind: 'tw', resource: TA, group: 'kt:1' }, CTX)).toThrow(/tw.*test_gl\/es-419\/ta/)
    expect(() => partInputs({ kind: 'book', resource: TN }, CTX)).toThrow(/no book/)
    expect(() => partInputs({ kind: 'tw', resource: TW }, CTX)).toThrow(/no group/)
  })
})

describe('units', () => {
  test('book, alignments and original parts are their book’s unit; everything else is shared', () => {
    expect(unitOfSlot({ kind: 'book', resource: TN, book: 'rut' })).toBe('book rut')
    expect(unitOfSlot({ kind: 'alignments', resource: TN, book: 'jon' })).toBe('book jon')
    expect(unitOfSlot({ kind: 'original', resource: UHB, book: 'rut' })).toBe('book rut')
    // Sliced by book, built once with the shared resources.
    expect(unitOfSlot({ kind: 'macula', resource: MACULA, book: 'rut' })).toBe('shared')
    for (const kind of ['tw', 'ta', 'titles', 'lexicon', 'obs'] as const) expect(unitOfSlot({ kind, resource: TW, group: 'g' })).toBe('shared')
  })

  test('every part of a two-book language is within its unit', () => {
    const slots = allSlots()
    expect(slots.length).toBeGreaterThan(30)
    for (const slot of slots) {
      const unit = unitOfSlot(slot)
      const missing = missingFromUnit(partInputs(slot, CTX), unitInputs(unit, keysOf(unit), CTX))
      if (missing.length) throw new Error(`${slotId(slot)} is not within ${unit}: ${missing.join(', ')}`)
    }
  })

  test('a part whose unit was given fewer resources is not within it, and says what is missing', () => {
    const part = partInputs({ kind: 'alignments', resource: TN, book: 'rut' }, CTX)
    const unit = unitInputs('book rut', keysOf('book rut').filter((k) => k !== GST), CTX)
    expect(missingFromUnit(part, unit)).toEqual([`file ${GST} 08-RUT.usfm ${blob(GST, '08-RUT.usfm')}`, `manifest ${GST} ${manifestOf(GST)}`])
  })

  test('a book unit holds its resources’ book files, unmapped files and manifests, not other books', () => {
    const unit = unitInputs('book jon', keysOf('book jon'), CTX)
    expect(unit.files.some(([, p]) => /RUT/.test(p))).toBe(false)
    expect(unit.files).toContainEqual([TQ, 'README.md', blob(TQ, 'README.md')])
    expect(unit.files).toContainEqual([RVR, '32-JON.usfm', blob(RVR, '32-JON.usfm')])
    expect(unit.stamps).toEqual([])
  })

  test('the shared unit holds every file and manifest of its resources and the TW and TA stamps only', () => {
    const unit = unitInputs('shared', keysOf('shared'), CTX)
    expect(unit.stamps).toEqual([
      [TA, `v12#${TA}`],
      [TW, `v12#${TW}`],
    ])
    expect(unit.files).toContainEqual([UHL, 'content/H5281.json', blob(UHL, 'content/H5281.json')])
    expect(unit.manifests.map(([r]) => r)).toEqual([OBS, TA, TW, UHL])
  })

  test('an unknown unit, or a resource the context lacks, throws', () => {
    expect(() => unitInputs('chapter 1', [TN], CTX)).toThrow(/chapter 1/)
    expect(() => unitInputs('shared', ['x/y/z'], CTX)).toThrow(/x\/y\/z/)
  })
})

const SHARED = [TW, TA, UHL, OBS, MACULA]

/** The resources a unit builds, as the build picks them: those with the book, and its original. */
function keysOf(unit: string): string[] {
  if (unit === 'shared') return SHARED
  const book = unit.slice('book '.length)
  return RESOURCES.filter((r) => !SHARED.includes(r.key) && r.books?.[book]).map((r) => r.key)
}

/** Every part the fixture could have. */
function allSlots(): PartSlot[] {
  const slots: PartSlot[] = []
  for (const r of RESOURCES) {
    for (const book of Object.keys(r.books ?? {})) {
      if (r.key === UHB || r.key === UGNT) slots.push({ kind: 'original', resource: r.key, book })
      else {
        slots.push({ kind: 'book', resource: r.key, book })
        if (r.key === TN || r.key === TWL) slots.push({ kind: 'alignments', resource: r.key, book })
      }
    }
  }
  for (const book of ['rut', 'jon']) slots.push({ kind: 'macula', resource: MACULA, book })
  for (const group of ['kt:0', 'kt:1', 'kt:2', 'kt:3', 'kt:4', 'kt:5', 'kt:6', 'kt:7', twGroupOf('bible/names/naomi.md')!, twGroupOf('bible/other/day.md')!]) {
    slots.push({ kind: 'tw', resource: TW, group })
  }
  for (const group of ['translate:0', 'translate:1', 'translate:2', 'translate:3', 'checking']) slots.push({ kind: 'ta', resource: TA, group })
  slots.push({ kind: 'titles', resource: TW }, { kind: 'titles', resource: TA })
  for (const group of ['1', '5']) slots.push({ kind: 'lexicon', resource: UHL, group })
  slots.push({ kind: 'obs', resource: OBS, group: '1-10' })
  return slots
}
