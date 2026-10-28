import { describe, expect, test } from 'bun:test'
import type { PartEntry, PartsList } from './partsList'
import { slotId, slotOfEntry } from './partSlots'
import { CANON_BOOK_ORDER, compareUnits, partsCoverage, planParts } from './plan'
import type { Register, SlotRecord } from './register'

const FP = 'f'.repeat(64)
const TN = 'o/es-419/tn'
const TW = 'o/es-419/tw'
const UHB = 'unfoldingWord/hbo/uhb'
const MACULA = 'o/macula'

function part(sha256: string, bytes: number, p: Pick<PartEntry, 'kind' | 'resource'> & Partial<PartEntry>): PartEntry {
  return { sha256, bytes, rows: 1, fingerprint: FP, layers: ['sot'], ...p }
}

const TN_RUT = part('tn-rut', 10, { kind: 'book', resource: TN, book: 'rut' })
const TN_JON = part('tn-jon', 20, { kind: 'book', resource: TN, book: 'jon' })
const TN_RUT_ALIGN = part('tn-rut-al', 5, { kind: 'alignments', resource: TN, book: 'rut' })
const TW_KT3 = part('tw-kt3', 7, { kind: 'tw', resource: TW, group: 'kt:3' })
const TW_TITLES = part('tw-titles', 3, { kind: 'titles', resource: TW })

const UHB_RUT = part('uhb-rut', 50, { kind: 'original', resource: UHB, book: 'rut' })
const UHB_JON = part('uhb-jon', 60, { kind: 'original', resource: UHB, book: 'jon' })
const MACULA_RUT = part('macula-rut', 8, { kind: 'macula', resource: MACULA, book: 'rut' })

function listOf(language: string, parts: PartEntry[], originals?: PartsList['originals']): PartsList {
  return { schema: 2, language, compat: 'c', code: 'c+0', versions: {}, resources: [], parts, ...(originals ? { originals } : {}) }
}

// As the builder writes them: original and MACULA parts only in the originals list, which the language list names.
const ORIGINALS = listOf('originals', [UHB_RUT, UHB_JON, MACULA_RUT])
const LANGUAGE_PARTS = [TN_RUT, TN_JON, TN_RUT_ALIGN, TW_KT3, TW_TITLES]
const LIST = listOf('es-419', LANGUAGE_PARTS, { path: 'catalog/c/originals/o.json', sha256: 'o' })
const LATEST = [...LANGUAGE_PARTS, ...ORIGINALS.parts]
const ALL = ['book rut', 'book jon', 'shared']

const idOf = (p: PartEntry) => slotId(slotOfEntry(p))
const record = (sha256: string, list = 'es-419'): SlotRecord => ({ sha256, keys: [], list, at: '2026-10-27T00:00:00.000Z' })
const registerOf = (parts: PartEntry[]): Register =>
  new Map(parts.map((p) => [idOf(p), record(p.sha256, ORIGINALS.parts.includes(p) ? 'originals' : 'es-419')]))
const shas = (parts: PartEntry[]) => parts.map((p) => p.sha256).sort()

describe('planParts', () => {
  test('a first plan downloads every part of the chosen units, each slot once', () => {
    const plan = planParts({ list: LIST, originals: ORIGINALS, register: new Map(), chosen: ALL })
    expect(shas(plan.download)).toEqual(shas(LATEST))
    expect(plan.remove).toEqual([])
    expect(plan.bytes).toBe(LATEST.reduce((n, p) => n + p.bytes, 0))
  })

  test('defensive: a slot both lists name is downloaded once, from the originals list for original and MACULA', () => {
    const stale = [part('uhb-rut-stale', 999, { kind: 'original', resource: UHB, book: 'rut' }), part('macula-rut-stale', 999, { kind: 'macula', resource: MACULA, book: 'rut' })]
    const list = listOf('es-419', [...LANGUAGE_PARTS, ...stale], LIST.originals)
    const plan = planParts({ list, originals: ORIGINALS, register: new Map(), chosen: ALL })
    const ids = plan.download.map(idOf)
    expect(new Set(ids).size).toBe(ids.length)
    expect(shas(plan.download)).toEqual(shas(LATEST))
  })

  test('units are book units in canonical Bible order, then shared', () => {
    const plan = planParts({ list: LIST, originals: ORIGINALS, register: new Map(), chosen: ['shared', 'book jon', 'book rut'] })
    expect(plan.units).toEqual(['book rut', 'book jon', 'shared'])
  })

  test('nothing to do when the register matches the lists', () => {
    const plan = planParts({ list: LIST, originals: ORIGINALS, register: registerOf(LATEST), chosen: ALL })
    expect(plan).toEqual({ download: [], remove: [], units: [], bytes: 0 })
  })

  test('a slot with another sha is downloaded again, and only its unit is touched', () => {
    const register = registerOf(LATEST)
    register.set(idOf(TN_RUT), record('tn-rut-old'))
    const plan = planParts({ list: LIST, originals: ORIGINALS, register, chosen: ALL })
    expect(plan.download).toEqual([TN_RUT])
    expect(plan.units).toEqual(['book rut'])
    expect(plan.bytes).toBe(10)
  })

  test('originals held with another sha are replaced', () => {
    const register = registerOf(LATEST)
    register.set(idOf(UHB_JON), record('uhb-jon-old', 'originals'))
    const plan = planParts({ list: LIST, originals: ORIGINALS, register, chosen: ALL })
    expect(plan.download).toEqual([UHB_JON])
    expect(plan.units).toEqual(['book jon'])
  })

  test('a book not chosen is ignored, its parts and its register slots alike', () => {
    const register = new Map([[slotId({ kind: 'book', resource: TN, book: 'gen' }), record('tn-gen')]])
    const plan = planParts({ list: LIST, originals: ORIGINALS, register, chosen: ['book rut'] })
    expect(shas(plan.download)).toEqual(shas([TN_RUT, TN_RUT_ALIGN, UHB_RUT]))
    expect(plan.remove).toEqual([])
    expect(plan.units).toEqual(['book rut'])
    expect(plan.bytes).toBe(65)
  })

  test("this language's own slot in a chosen unit that the list no longer names is removed", () => {
    const register = registerOf(LATEST)
    const goneTw = slotId({ kind: 'tw', resource: TW, group: 'kt:5' })
    const goneBook = slotId({ kind: 'alignments', resource: TN, book: 'jon' })
    const otherBook = slotId({ kind: 'book', resource: TN, book: 'gen' })
    for (const id of [goneTw, goneBook, otherBook]) register.set(id, record('x'))
    const plan = planParts({ list: LIST, originals: ORIGINALS, register, chosen: ALL })
    expect(plan.download).toEqual([])
    expect([...plan.remove].sort()).toEqual([goneBook, goneTw].sort())
    expect(plan.units).toEqual(['book jon', 'shared'])
    expect(plan.bytes).toBe(0)
  })

  test("another language's slots are never removed, in book units or the shared unit", () => {
    const register = registerOf(LATEST)
    register.set(slotId({ kind: 'book', resource: 'o/pt-br/tn', book: 'rut' }), record('pt-tn-rut', 'pt-br'))
    register.set(slotId({ kind: 'tw', resource: 'o/pt-br/tw', group: 'kt:1' }), record('pt-tw-kt1', 'pt-br'))
    const plan = planParts({ list: LIST, originals: ORIGINALS, register, chosen: ['book rut', 'shared'] })
    expect(plan).toEqual({ download: [], remove: [], units: [], bytes: 0 })
  })

  test('an originals slot this originals list does not name is never removed by a plan', () => {
    const register = registerOf(LATEST)
    register.set(slotId({ kind: 'original', resource: 'unfoldingWord/el-x-koine/ugnt', book: 'rut' }), record('ugnt-rut', 'originals'))
    register.set(slotId({ kind: 'macula', resource: MACULA, book: 'jon' }), record('macula-jon', 'originals'))
    const plan = planParts({ list: LIST, originals: ORIGINALS, register, chosen: ALL })
    expect(plan.remove).toEqual([])
  })

  test('a slot recorded under this language that the originals list names is not removed', () => {
    const register = registerOf(LATEST)
    register.set(idOf(UHB_RUT), record(UHB_RUT.sha256, 'es-419'))
    register.set(idOf(MACULA_RUT), record(MACULA_RUT.sha256, 'es-419'))
    const plan = planParts({ list: LIST, originals: ORIGINALS, register, chosen: ALL })
    expect(plan).toEqual({ download: [], remove: [], units: [], bytes: 0 })
  })

  test('a list that names an originals list cannot be planned without it', () => {
    expect(() => planParts({ list: LIST, register: new Map(), chosen: ALL })).toThrow(/originals/)
    expect(() => partsCoverage({ list: LIST, register: new Map(), chosen: ALL })).toThrow(/originals/)
  })

  test('a list that names no originals list is planned alone', () => {
    const plan = planParts({ list: listOf('es-419', LANGUAGE_PARTS), register: new Map(), chosen: ['book rut'] })
    expect(shas(plan.download)).toEqual(shas([TN_RUT, TN_RUT_ALIGN]))
  })
})

describe('unit order', () => {
  test('the canonical order has the 66 books, Genesis to Revelation', () => {
    expect(CANON_BOOK_ORDER.length).toBe(66)
    expect(CANON_BOOK_ORDER[0]).toBe('gen')
    expect(CANON_BOOK_ORDER[39]).toBe('mat')
    expect(CANON_BOOK_ORDER[65]).toBe('rev')
  })

  test('books in canon order, unknown books after them by name, shared last', () => {
    expect(['shared', 'book zzz', 'book rev', 'book 1sa', 'book gen', 'book aaa'].sort(compareUnits)).toEqual(['book gen', 'book 1sa', 'book rev', 'book aaa', 'book zzz', 'shared'])
  })
})

describe('partsCoverage', () => {
  test('nothing present: every chosen part missing, no resource whole', () => {
    const coverage = partsCoverage({ list: LIST, originals: ORIGINALS, register: new Map(), chosen: ['book rut'] })
    expect(coverage.get(TN)).toEqual({ present: 0, missing: 2, missingBytes: 15, whole: false })
    expect(coverage.get(UHB)).toEqual({ present: 0, missing: 1, missingBytes: 50, whole: false })
    // Named by the lists, none of its parts chosen.
    expect(coverage.get(TW)).toEqual({ present: 0, missing: 0, missingBytes: 0, whole: false })
  })

  test('a resource is whole only when every part the lists name for it is present', () => {
    const rutOnly = registerOf([TN_RUT, TN_RUT_ALIGN])
    const some = partsCoverage({ list: LIST, originals: ORIGINALS, register: rutOnly, chosen: ['book rut'] })
    expect(some.get(TN)).toEqual({ present: 2, missing: 0, missingBytes: 0, whole: false })

    const all = partsCoverage({ list: LIST, originals: ORIGINALS, register: registerOf(LATEST), chosen: ALL })
    for (const key of [TN, TW, UHB, MACULA]) expect(all.get(key)?.whole).toBe(true)
    expect(all.get(TN)).toEqual({ present: 3, missing: 0, missingBytes: 0, whole: true })
  })

  test('a slot held with another sha counts as missing', () => {
    const register = registerOf(LATEST)
    register.set(idOf(TN_JON), record('tn-jon-old'))
    const coverage = partsCoverage({ list: LIST, originals: ORIGINALS, register, chosen: ALL })
    expect(coverage.get(TN)).toEqual({ present: 2, missing: 1, missingBytes: 20, whole: false })
    expect(coverage.get(UHB)?.whole).toBe(true)
  })

  test('originals held at another sha than the originals list names count as missing', () => {
    const stale = new Map([[idOf(UHB_RUT), record('uhb-rut-old', 'originals')], [idOf(UHB_JON), record('uhb-jon', 'originals')]])
    const coverage = partsCoverage({ list: LIST, originals: ORIGINALS, register: stale, chosen: ALL })
    expect(coverage.get(UHB)).toEqual({ present: 1, missing: 1, missingBytes: 50, whole: false })
  })
})
