import { describe, expect, test } from 'bun:test'
import { gzip, ungzip } from 'pako'
import {
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  isMatchingIngestReceipt,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import { buildLanguagePack, importLanguagePack } from '../pack'
import { packTargetFrom } from '../stores'
import type { PackLayer, PackSource, PackVersions } from '../types'
import { applyParts, type ApplyInput } from './apply'
import { sha256Hex, writePart, type PartRow } from './partFile'
import type { PartEntry, PartKind, PartsList } from './partsList'
import { slotId, slotOfEntry, twGroupOf } from './partSlots'
import { planParts } from './plan'
import { REGISTER_PREFIX, readRegister, registerRow, type Register } from './register'
import { memoryByteStore, stagingFrom, type PartsStaging } from './staging'
import { memoryTarget, type MemoryTarget } from './testTarget'

const NOW = Date.parse('2026-10-27T12:00:00.000Z')
const VERSIONS: PackVersions = { sot: { usjProcessing: '2.3.0-usj' }, quote: { helpsQuote: 5 } }

const TN = 'o/es-419/tn'
const TW = 'o/es-419/tw'
const UHB = 'unfoldingWord/hbo/uhb'
const OL = `${UHB}@gabc+2.3.0-usj`
const KT = twGroupOf('bible/kt/god')!

const meta = (key: string, type: string, subject: string): ResourceMetadata =>
  ({ resourceKey: key, type, subject, title: key, release: { tag_name: 'v1' } }) as unknown as ResourceMetadata

const RESOURCES = {
  [TN]: meta(TN, 'notes', 'TSV Translation Notes'),
  [TW]: meta(TW, 'words', 'Translation Words'),
  [UHB]: meta(UHB, 'scripture', 'Hebrew Old Testament'),
}

const value = (text: string) => ({ content: text, metadata: { note: text } })
const row = (layer: PackLayer, key: string, text = key): PartRow => ({ layer, key, value: value(text) })

type Built = { entry: PartEntry; bytes: Uint8Array }

async function built(kind: PartKind, resource: string, rows: PartRow[], where: { book?: string; group?: string } = {}): Promise<Built> {
  const part = await writePart(rows)
  const entry: PartEntry = {
    sha256: part.sha256,
    bytes: part.bytes.byteLength,
    rows: part.rows,
    kind,
    resource,
    ...where,
    fingerprint: 'f'.repeat(64),
    layers: [...new Set(rows.map((r) => r.layer))],
  }
  return { entry, bytes: part.bytes }
}

const alignKey = (book: string, stamp = 'v1') => `helps-align:${TN}@${stamp}#2026:${OL}:o/es-419/ult@v1+1:${book}:1`

const TN_RUT = () =>
  built('book', TN, [row('sot', `tn:${TN}:rut`), row('sot', `tn:${TN}:rut:1`), row('prepared', `prepared:notes:${TN}:rut:1:full`)], { book: 'rut' })
const TN_RUT_ALIGN = (stamp = 'v1') => built('alignments', TN, [row('align', alignKey('rut', stamp))], { book: 'rut' })
const TN_JON = () => built('book', TN, [row('sot', `tn:${TN}:jon`), row('sot', `tn:${TN}:jon:1`)], { book: 'jon' })
const UHB_RUT = (text = 'uhb') => built('original', UHB, [row('sot', `scripture-usj:${UHB}:rut:1`, text)], { book: 'rut' })
const TW_KT = () => built('tw', TW, [row('sot', `${TW}/bible/kt/god`)], { group: KT })
const TW_TITLES = () => built('titles', TW, [row('text', `helps-text:titles:${TW}@v1:all`)])

function listOf(language: string, parts: Built[], keys: string[], extra: Partial<PartsList> = {}): PartsList {
  return {
    schema: 2,
    language,
    compat: 'c',
    code: 'c+0',
    versions: VERSIONS,
    resources: keys.map((key) => ({ key, stamp: 's', role: language === 'originals' ? 'original' : 'language', subject: String(RESOURCES[key as keyof typeof RESOURCES].subject), title: key, metadata: RESOURCES[key as keyof typeof RESOURCES] })),
    parts: parts.map((p) => p.entry),
    ...extra,
  }
}

const ORIGINALS_REF = { path: 'catalog/c/originals/o.json', sha256: 'o' }

async function lists(language: Built[], originals: Built[]) {
  return {
    list: listOf('es-419', language, [TN, TW], { originals: ORIGINALS_REF }),
    originals: listOf('originals', originals, [UHB]),
  }
}

async function stagingWith(parts: Built[]): Promise<PartsStaging> {
  const staging = stagingFrom(memoryByteStore())
  for (const p of parts) await staging.put(p.entry.sha256, p.bytes)
  return staging
}

const registerOf = (target: MemoryTarget): Register => readRegister([...target.rows].map(([key, entry]) => ({ key, entry })))
const idOf = (p: Built) => slotId(slotOfEntry(p.entry))

async function run(target: MemoryTarget, staging: PartsStaging, list: PartsList, originals: PartsList | undefined, chosen: string[], extra: Partial<ApplyInput> = {}) {
  const register = registerOf(target)
  const plan = planParts({ list, originals, register, chosen })
  return applyParts({ target, staging, plan, list, originals, register, chosen, versions: VERSIONS, now: () => NOW, ...extra })
}

const ALL = ['book rut', 'book jon', 'shared']

describe('applyParts', () => {
  test('a first download writes every row, the register and the catalog, one transaction per unit', async () => {
    const parts = { tnRut: await TN_RUT(), align: await TN_RUT_ALIGN(), tnJon: await TN_JON(), uhb: await UHB_RUT(), kt: await TW_KT(), titles: await TW_TITLES() }
    const { list, originals } = await lists([parts.tnRut, parts.align, parts.tnJon, parts.kt, parts.titles], [parts.uhb])
    const staging = await stagingWith(Object.values(parts))
    const target = memoryTarget()

    const result = await run(target, staging, list, originals, ALL)

    expect(result.failed).toEqual([])
    expect(result.applied).toEqual(['book rut', 'book jon', 'shared'])
    // One per unit, and one for the receipts after the last.
    expect(target.committed).toBe(4)
    expect(result.bytesApplied).toBe(Object.values(parts).reduce((n, p) => n + p.entry.bytes, 0))
    expect(result.originalsReplaced).toBe(false)
    expect(result.completed.sort()).toEqual([TN, TW, UHB].sort())

    // Rows as the part had them, dated now, without a lifetime.
    expect(target.rows.get(`tn:${TN}:rut:1`)).toEqual({ ...value(`tn:${TN}:rut:1`), timestamp: NOW })
    expect(target.rows.get(alignKey('rut'))).toEqual({ ...value(alignKey('rut')), timestamp: NOW })
    for (const [key, entry] of target.rows) {
      if (key.startsWith('resource:')) continue
      expect((entry as { timestamp?: number }).timestamp).toBe(NOW)
      expect(entry as object).not.toHaveProperty('expiresAt')
    }
    // Every resource is whole: each has the receipt existing readers look for.
    expect([...target.rows.keys()].filter((key) => key.startsWith('resource:')).sort()).toEqual([TN, TW, UHB].map((key) => `resource:${key}`).sort())
    for (const key of [TN, TW, UHB]) {
      const m = RESOURCES[key]
      const receipt = target.rows.get(`resource:${key}`)
      expect(isMatchingIngestReceipt(receipt, expectedIngestReleaseStamp(m), ingestSchemaForResourceType(m.type, '2.3.0-usj'))).toBe(true)
      expect(receipt).toMatchObject({ content: {}, metadata: { downloadMethod: 'parts', downloadCompletedAt: new Date(NOW).toISOString() } })
    }

    const register = registerOf(target)
    expect(register.get(idOf(parts.tnRut))).toEqual({
      sha256: parts.tnRut.entry.sha256,
      keys: [`tn:${TN}:rut`, `tn:${TN}:rut:1`, `prepared:notes:${TN}:rut:1:full`].sort(),
      list: 'es-419',
      at: new Date(NOW).toISOString(),
    })
    // Review Focus 2: the original is held once, and the register says the originals list put it there.
    expect(register.get(idOf(parts.uhb))?.list).toBe('originals')
    expect(register.size).toBe(6)

    for (const key of [TN, TW, UHB]) {
      const row = target.catalog.get(key)!
      expect(row.catalogedAt).toBe(new Date(NOW).toISOString())
      expect(row.availability).toMatchObject({ offline: true, partial: false })
    }
    expect(await staging.list()).toEqual([])
  })

  test('a resource chosen in part is offline when every chosen part is in, and not completed', async () => {
    const parts = { tnRut: await TN_RUT(), align: await TN_RUT_ALIGN(), tnJon: await TN_JON(), uhb: await UHB_RUT() }
    const { list, originals } = await lists([parts.tnRut, parts.align, parts.tnJon], [parts.uhb])
    const target = memoryTarget()

    const result = await run(target, await stagingWith(Object.values(parts)), list, originals, ['book rut'])

    expect(result.applied).toEqual(['book rut'])
    expect(target.rows.has(`tn:${TN}:jon:1`)).toBe(false)
    // Offline for what was chosen, and partial: tc-study reads `partial: false` as downloaded whole.
    expect(target.catalog.get(TN)!.availability).toMatchObject({ offline: true, partial: true })
    expect(target.catalog.get(UHB)!.availability).toMatchObject({ offline: true, partial: false })
    expect(result.completed).toEqual([UHB])
    // "Complete" would mislead bt-synergy's readers about a resource held in part.
    expect(target.rows.has(`resource:${TN}`)).toBe(false)
    expect(target.rows.has(`resource:${UHB}`)).toBe(true)

    // A row an older importer wrote with `partial: false` is set right by the next call, with nothing to apply.
    target.catalog.set(TN, { ...target.catalog.get(TN)!, availability: { online: true, offline: true, bundled: false, partial: false } })
    const next = await run(target, await stagingWith([]), list, originals, ['book rut'])
    expect(next.applied).toEqual([])
    expect(next.failed).toEqual([])
    expect(target.catalog.get(TN)!.availability).toMatchObject({ offline: true, partial: true })
  })

  test('a replaced slot deletes the keys its new part no longer has and writes the new ones', async () => {
    const tnRut = await TN_RUT()
    const old = await TN_RUT_ALIGN('v1')
    const uhb = await UHB_RUT()
    const target = memoryTarget()
    const first = await lists([tnRut, old], [uhb])
    await run(target, await stagingWith([tnRut, old, uhb]), first.list, first.originals, ['book rut'])

    const next = await TN_RUT_ALIGN('v2')
    const second = await lists([tnRut, next], [uhb])
    target.rows.set('warm-coverage:v1', { content: 1 })
    const result = await run(target, await stagingWith([next]), second.list, second.originals, ['book rut'])

    expect(result.applied).toEqual(['book rut'])
    expect(target.rows.has(alignKey('rut', 'v1'))).toBe(false)
    expect(target.rows.has(alignKey('rut', 'v2'))).toBe(true)
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(true)
    expect(target.rows.has('warm-coverage:v1')).toBe(true)
    expect(registerOf(target).get(idOf(next))).toMatchObject({ sha256: next.entry.sha256, keys: [alignKey('rut', 'v2')] })
  })

  test('a slot the list no longer names loses its keys and its register row', async () => {
    const tnRut = await TN_RUT()
    const tnJon = await TN_JON()
    const target = memoryTarget()
    const first = await lists([tnRut, tnJon], [])
    await run(target, await stagingWith([tnRut, tnJon]), first.list, first.originals, ALL)
    expect(target.rows.has(`tn:${TN}:jon:1`)).toBe(true)

    const second = await lists([tnRut], [])
    const register = registerOf(target)
    const plan = planParts({ list: second.list, originals: second.originals, register, chosen: ALL })
    expect(plan.remove).toEqual([idOf(tnJon)])
    const result = await applyParts({ target, staging: await stagingWith([]), plan, ...second, register, chosen: ALL, versions: VERSIONS, now: () => NOW })

    expect(result.applied).toEqual(['book jon'])
    expect(target.rows.has(`tn:${TN}:jon`)).toBe(false)
    expect(target.rows.has(`tn:${TN}:jon:1`)).toBe(false)
    expect(target.rows.has(REGISTER_PREFIX + idOf(tnJon))).toBe(false)
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(true)
    expect(registerOf(target).has(idOf(tnRut))).toBe(true)
  })

  test('the first time a slot is applied, rows from a whole pack of that slot only are deleted', async () => {
    const tnRut = await TN_RUT()
    const align = await TN_RUT_ALIGN('v2')
    const { list } = await lists([tnRut, align], [])
    const whole = { content: 'old', timestamp: 1, expiresAt: '2026-11-01T00:00:00.000Z' }
    const target = memoryTarget({
      rows: [
        // Of the Ruth book slot, not in the new part: deleted.
        { key: `tn:${TN}:rut:2`, entry: whole },
        { key: `prepared:notes:${TN}:rut:2:full`, entry: whole },
        // Of the Ruth book slot and in the new part: replaced.
        { key: `tn:${TN}:rut:1`, entry: whole },
        // Of the Ruth alignments slot: deleted.
        { key: alignKey('rut', 'v1'), entry: whole },
        // Another slot of the same resource (Jonah), other resources and keys of no resource: kept. The receipt: below.
        { key: `tn:${TN}:jon:1`, entry: whole },
        { key: `prepared:notes:${TN}:jon:1:full`, entry: whole },
        { key: `resource:${TN}`, entry: whole },
        { key: `tn:${TN}-extra:rut:1`, entry: whole },
        { key: `prepared:notes:${TN}-extra:rut:1:full`, entry: whole },
        { key: `scripture-usj:${UHB}:rut:1`, entry: whole },
        { key: 'warm-coverage:v1', entry: whole },
      ],
    })

    const result = await applyParts({
      target,
      staging: await stagingWith([tnRut, align]),
      plan: planParts({ list, register: new Map(), chosen: ['book rut'], originals: listOf('originals', [], []) }),
      list,
      originals: listOf('originals', [], []),
      register: new Map(),
      chosen: ['book rut'],
      versions: VERSIONS,
      now: () => NOW,
    })

    expect(result.failed).toEqual([])
    for (const gone of [`tn:${TN}:rut:2`, `prepared:notes:${TN}:rut:2:full`, alignKey('rut', 'v1')]) expect(target.rows.has(gone)).toBe(false)
    expect(target.rows.get(`tn:${TN}:rut:1`)).toEqual({ ...value(`tn:${TN}:rut:1`), timestamp: NOW })
    for (const kept of [`tn:${TN}:jon:1`, `prepared:notes:${TN}:jon:1:full`, `tn:${TN}-extra:rut:1`, `prepared:notes:${TN}-extra:rut:1:full`, `scripture-usj:${UHB}:rut:1`, 'warm-coverage:v1']) {
      expect(target.rows.get(kept)).toEqual(whole)
    }
    // The units leave the receipt; the list names Ruth only, so the resource is whole and its receipt is from parts.
    expect(target.rows.get(`resource:${TN}`)).toMatchObject({ content: {}, metadata: { downloadMethod: 'parts', releaseStamp: 'v1' } })
  })

  test('a book with a row outside its slot fails alone: the other book stays applied, its register untouched', async () => {
    const tnRut = await TN_RUT()
    const bad = await built('book', TN, [row('sot', `tn:${TN}:jon:1`), row('sot', `tn:${TN}:rut:9`)], { book: 'jon' })
    const { list, originals } = await lists([tnRut, bad], [])
    const staging = await stagingWith([tnRut, bad])
    const target = memoryTarget()

    const result = await run(target, staging, list, originals, ['book rut', 'book jon'])

    expect(result.applied).toEqual(['book rut'])
    expect(result.failed).toEqual([{ scope: 'unit', unit: 'book jon', reason: 'invalid', message: expect.stringContaining(`tn:${TN}:rut:9`) }])
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(true)
    expect(target.rows.has(`tn:${TN}:jon:1`)).toBe(false)
    expect(target.rows.has(`tn:${TN}:rut:9`)).toBe(false)
    expect(registerOf(target).has(idOf(bad))).toBe(false)
    // Its part waits in staging; the applied one is gone. TN is not offline: a chosen part is missing.
    expect((await staging.list()).map((s) => s.sha)).toEqual([bad.entry.sha256])
    expect(target.catalog.get(TN)!.availability.offline).toBe(false)
    expect(result.completed).toEqual([])
  })

  test('staged bytes that no longer hash to their name refuse their unit (Review Focus 4)', async () => {
    const tnRut = await TN_RUT()
    const tnJon = await TN_JON()
    const { list, originals } = await lists([tnRut, tnJon], [])
    const inner = await stagingWith([tnRut, tnJon])
    // The same rows, compressed otherwise: every row is in its slot, only the hash tells.
    const changed = gzip(ungzip(tnRut.bytes), { level: 1 })
    const staging: PartsStaging = { ...inner, get: async (sha) => (sha === tnRut.entry.sha256 ? changed : inner.get(sha)) }
    const target = memoryTarget()

    const result = await run(target, staging, list, originals, ['book rut', 'book jon'])

    expect(result.failed).toEqual([{ scope: 'unit', unit: 'book rut', reason: 'invalid', message: expect.any(String) }])
    expect(result.applied).toEqual(['book jon'])
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(false)
  })

  test('a full disk in one unit is reported as quota; the other units go on (Review Focus 5)', async () => {
    const tnRut = await TN_RUT()
    const tnJon = await TN_JON()
    const { list, originals } = await lists([tnRut, tnJon], [])
    const target = memoryTarget()
    target.failNextTransaction('QuotaExceededError')
    const staging = await stagingWith([tnRut, tnJon])

    const result = await run(target, staging, list, originals, ['book rut', 'book jon'])

    expect(result.failed).toEqual([{ scope: 'unit', unit: 'book rut', reason: 'quota', message: expect.any(String) }])
    expect(result.applied).toEqual(['book jon'])
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(false)
    expect(registerOf(target).has(idOf(tnRut))).toBe(false)
    expect(registerOf(target).has(idOf(tnJon))).toBe(true)
    // The failed unit's part waits in staging for the next apply.
    expect((await staging.list()).map((s) => s.sha)).toEqual([tnRut.entry.sha256])
  })

  test('catalog rows that cannot be written before a unit leave it unapplied, to be done again', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()
    const old = { ...RESOURCES[TN], release: { tag_name: 'v0' } } as unknown as ResourceMetadata
    await target.putCatalogRows([{ key: TN, metadata: old }])
    const putCatalogRows = target.putCatalogRows
    target.putCatalogRows = async () => {
      throw new Error('catalog closed')
    }
    const staging = await stagingWith([tnRut])

    const failed = await run(target, staging, list, originals, ['book rut'])

    expect(failed.applied).toEqual([])
    expect(failed.failed).toEqual([{ scope: 'unit', unit: 'book rut', reason: 'error', message: expect.stringContaining('catalog closed') }])
    expect(target.rows.size).toBe(0)
    // Only the receipts pass, which found nothing to write.
    expect(target.committed).toBe(1)
    expect(target.catalog.get(TN)).toEqual(old)
    expect((await staging.list()).map((s) => s.sha)).toEqual([tnRut.entry.sha256])

    target.putCatalogRows = putCatalogRows
    const again = await run(target, staging, list, originals, ['book rut'])

    expect(again.applied).toEqual(['book rut'])
    expect(again.failed).toEqual([])
    expect((target.catalog.get(TN) as unknown as { release: { tag_name: string } }).release.tag_name).toBe('v1')
    expect(target.catalog.get(TN)!.availability.offline).toBe(true)
    expect(registerOf(target).has(idOf(tnRut))).toBe(true)
  })

  test('the catalog has the new rows before a unit commits; a failed offline update after it is reported', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()
    const putCatalogRows = target.putCatalogRows
    const seen: Array<{ committed: number; offline: boolean }> = []
    target.putCatalogRows = async (rows) => {
      seen.push({ committed: target.committed, offline: rows[0].metadata.availability.offline })
      if (seen.length > 1) throw new Error('catalog closed')
      return putCatalogRows(rows)
    }

    const result = await run(target, await stagingWith([tnRut]), list, originals, ['book rut'])

    // First the rows from the list (not offline yet: nothing of TN was held), then the offline flag, which failed,
    // then the end of the call trying again (the stored flag is not what the register says), which failed too.
    expect(seen).toEqual([{ committed: 0, offline: false }, { committed: 1, offline: true }, { committed: 1, offline: true }])
    expect(result.applied).toEqual(['book rut'])
    expect(result.failed).toEqual([
      { scope: 'catalog', unit: 'book rut', reason: 'error', message: expect.stringContaining('catalog closed') },
      { scope: 'catalog', reason: 'error', message: expect.stringContaining('catalog closed') },
    ])
    expect((target.catalog.get(TN) as unknown as { release: { tag_name: string } }).release.tag_name).toBe('v1')
    expect(target.catalog.get(TN)!.catalogedAt).toBe(new Date(NOW).toISOString())
    expect(target.catalog.get(TN)!.availability.offline).toBe(false)
  })

  test('an offline flag not written after a unit (the app killed, or the write failed) is healed by the next call', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()
    const putCatalogRows = target.putCatalogRows
    let writes = 0
    target.putCatalogRows = async (rows) => {
      // Only the write before the unit gets through: as if the app stopped once the unit committed.
      if (++writes > 1) throw new Error('catalog closed')
      return putCatalogRows(rows)
    }
    const first = await run(target, await stagingWith([tnRut]), list, originals, ['book rut'])
    expect(first.applied).toEqual(['book rut'])
    expect(target.catalog.get(TN)!.availability.offline).toBe(false)

    // The app starts again: nothing to download, the release unchanged.
    target.putCatalogRows = putCatalogRows
    const next = await run(target, await stagingWith([]), list, originals, ['book rut'])

    expect(next.applied).toEqual([])
    expect(next.failed).toEqual([])
    expect(target.catalog.get(TN)!.availability).toMatchObject({ offline: true, partial: false })
    expect((target.catalog.get(TN) as unknown as { release: { tag_name: string } }).release.tag_name).toBe('v1')
  })

  test('a full disk while writing catalog rows is reported as quota', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()
    target.putCatalogRows = async () => {
      throw new DOMException('disk full', 'QuotaExceededError')
    }

    const result = await run(target, await stagingWith([tnRut]), list, originals, ['book rut'])

    expect(result.applied).toEqual([])
    expect(result.failed).toEqual([{ scope: 'unit', unit: 'book rut', reason: 'quota', message: expect.stringContaining('disk full') }])
  })

  test('before a unit, a resource the device already has offline stays offline', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()
    const mine = { ...RESOURCES[TN], availability: { online: true, offline: true, bundled: false, partial: false } } as unknown as ResourceMetadata
    await target.putCatalogRows([{ key: TN, metadata: mine }])
    const putCatalogRows = target.putCatalogRows
    const offline: boolean[] = []
    target.putCatalogRows = async (rows) => {
      offline.push(rows[0].metadata.availability.offline)
      return putCatalogRows(rows)
    }

    await run(target, await stagingWith([tnRut]), list, originals, ['book rut'])

    expect(offline).toEqual([true, true])
  })

  test('a planned part not in staging: nothing is applied and the result names it', async () => {
    const tnRut = await TN_RUT()
    const tnJon = await TN_JON()
    const { list, originals } = await lists([tnRut, tnJon], [])
    const target = memoryTarget()

    const result = await run(target, await stagingWith([tnRut]), list, originals, ['book rut', 'book jon'])

    expect(result.applied).toEqual([])
    expect(result.refused).toEqual({ reason: 'missing', message: expect.stringContaining('book jon') })
    expect(result.failed).toEqual([{ scope: 'unit', unit: 'book jon', reason: 'missing', message: expect.stringContaining(tnJon.entry.sha256) }])
    // Ruth is staged and not applied either: no unit goes in while a part of the plan is missing.
    expect(target.rows.size).toBe(0)
    expect(target.catalog.size).toBe(0)
    // Only the receipts pass, which found nothing to write.
    expect(target.committed).toBe(1)
  })

  test('a startup call with a part still downloading applies no unit, yet heals the catalog and the receipts', async () => {
    const tnRut = await TN_RUT()
    const kt = await TW_KT()
    const target = memoryTarget()
    const first = await lists([tnRut], [])
    await run(target, await stagingWith([tnRut]), first.list, first.originals, ALL)
    // What a call cut short leaves: the receipt not written, the offline flag not set.
    target.rows.delete(`resource:${TN}`)
    target.catalog.set(TN, { ...target.catalog.get(TN)!, availability: { online: true, offline: false, bundled: false, partial: false } })

    // The next list adds a Translation Words part, which the app is still downloading into staging.
    const second = await lists([tnRut, kt], [])
    const result = await run(target, await stagingWith([]), second.list, second.originals, ALL)

    expect(result.refused).toEqual({ reason: 'missing', message: expect.stringContaining('shared') })
    expect(result.applied).toEqual([])
    expect(result.failed).toEqual([{ scope: 'unit', unit: 'shared', reason: 'missing', message: expect.stringContaining(kt.entry.sha256) }])
    expect(registerOf(target).has(idOf(kt))).toBe(false)
    expect(target.catalog.has(TW)).toBe(false)
    expect(target.catalog.get(TN)!.availability).toMatchObject({ offline: true, partial: false })
    expect(target.rows.get(`resource:${TN}`)).toMatchObject({ content: {}, metadata: { downloadMethod: 'parts', releaseStamp: 'v1' } })
  })

  test('a list made with other versions is refused whole', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()

    const result = await run(target, await stagingWith([tnRut]), list, originals, ['book rut'], { versions: { ...VERSIONS, quote: { helpsQuote: 6 } } })

    expect(result.applied).toEqual([])
    expect(result.refused).toEqual({ reason: 'versions', message: expect.stringContaining('quote') })
    expect(result.failed).toEqual([{ scope: 'unit', unit: 'book rut', reason: 'versions', message: expect.stringContaining('quote') }])
    expect(target.rows.size).toBe(0)
    expect(target.catalog.size).toBe(0)
  })

  test('other versions with nothing to download: refused, and nothing at all is written', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()
    await run(target, await stagingWith([tnRut]), list, originals, ['book rut'])
    target.rows.delete(`resource:${TN}`)
    target.catalog.set(TN, { ...target.catalog.get(TN)!, availability: { online: true, offline: false, bundled: false, partial: false } })
    const rows = new Map(target.rows)
    const catalog = structuredClone(target.catalog)
    const committed = target.committed

    const result = await run(target, await stagingWith([]), list, originals, ['book rut'], { versions: { ...VERSIONS, quote: { helpsQuote: 6 } } })

    expect(result.refused).toEqual({ reason: 'versions', message: expect.stringContaining('quote') })
    expect(result.applied).toEqual([])
    expect(result.failed).toEqual([])
    expect(target.committed).toBe(committed)
    expect(target.rows).toEqual(rows)
    expect(target.catalog).toEqual(catalog)
  })

  test('a target without transactRaw is refused at once, nothing written (Review Focus 3)', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget({ transactRaw: false })

    await expect(run(target, await stagingWith([tnRut]), list, originals, ['book rut'])).rejects.toThrow(/transactRaw/)
    expect(target.rows.size).toBe(0)
    expect(target.catalog.size).toBe(0)
  })

  test('originals held with another sha are replaced, and the result says so', async () => {
    const old = await UHB_RUT('old')
    const target = memoryTarget()
    const first = await lists([], [old])
    expect((await run(target, await stagingWith([old]), first.list, first.originals, ['book rut'])).originalsReplaced).toBe(false)

    const next = await UHB_RUT('new')
    const second = await lists([], [next])
    const result = await run(target, await stagingWith([next]), second.list, second.originals, ['book rut'])

    expect(result.originalsReplaced).toBe(true)
    expect(target.rows.get(`scripture-usj:${UHB}:rut:1`)).toEqual({ ...value('new'), timestamp: NOW })
    expect(registerOf(target).get(idOf(next))).toMatchObject({ sha256: next.entry.sha256, list: 'originals' })
  })

  test('a row value with a lifetime is written without it', async () => {
    const line = JSON.stringify({ layer: 'sot', key: `tn:${TN}:rut:1`, value: { content: 'x', expiresAt: '2026-11-01T00:00:00.000Z' } })
    const bytes = gzip(new TextEncoder().encode(`${line}\n`))
    const tnRut = await TN_RUT()
    const odd: Built = { entry: { ...tnRut.entry, sha256: await sha256Hex(bytes), bytes: bytes.byteLength, rows: 1 }, bytes }
    const { list, originals } = await lists([odd], [])
    const target = memoryTarget()

    const result = await run(target, await stagingWith([odd]), list, originals, ['book rut'])

    expect(result.failed).toEqual([])
    expect(target.rows.get(`tn:${TN}:rut:1`)).toEqual({ content: 'x', timestamp: NOW })
  })

  test('defensive: a planned removal of a slot another list holds deletes nothing', async () => {
    const uhb = await UHB_RUT()
    const target = memoryTarget()
    const first = await lists([], [uhb])
    await run(target, await stagingWith([uhb]), first.list, first.originals, ['book rut'])
    const before = new Map(target.rows)
    const register = registerOf(target)

    const plan = { download: [], remove: [idOf(uhb)], units: ['book rut'], bytes: 0 }
    const result = await applyParts({ target, staging: await stagingWith([]), plan, ...first, register, chosen: ['book rut'], versions: VERSIONS, now: () => NOW })

    expect(result.failed).toEqual([])
    expect(target.rows).toEqual(before)
  })

  test('a resource that stops being whole loses its receipt from parts; a whole pack’s receipt stays', async () => {
    const tnRut = await TN_RUT()
    const tnJon = await TN_JON()
    const uhb = await UHB_RUT()
    const target = memoryTarget()
    const first = await lists([tnRut, tnJon], [uhb])
    await run(target, await stagingWith([tnRut, tnJon, uhb]), first.list, first.originals, ALL)
    expect(target.rows.get(`resource:${TN}`)).toMatchObject({ metadata: { downloadMethod: 'parts' } })
    // UHB's receipt as a whole pack left it.
    const whole = { content: {}, metadata: { downloadComplete: true, releaseStamp: 'v1', ingestSchema: 'usj:2.3.0-usj', downloadMethod: 'zip' } }
    target.rows.set(`resource:${UHB}`, whole)

    // A new release changes both books and the original; only Ruth is applied.
    const nextRut = await built('book', TN, [row('sot', `tn:${TN}:rut`), row('sot', `tn:${TN}:rut:1`, 'new')], { book: 'rut' })
    const nextJon = await built('book', TN, [row('sot', `tn:${TN}:jon`), row('sot', `tn:${TN}:jon:1`, 'new')], { book: 'jon' })
    const nextUhb = await UHB_RUT('new')
    const second = await lists([nextRut, nextJon], [nextUhb])
    const register = registerOf(target)
    const plan = { ...planParts({ list: second.list, originals: second.originals, register, chosen: ALL }), units: ['book rut'] }
    plan.download = plan.download.filter((p) => p.book === 'rut' && p.resource === TN)
    const result = await applyParts({ target, staging: await stagingWith([nextRut]), plan, ...second, register, chosen: ALL, versions: VERSIONS, now: () => NOW })

    expect(result.applied).toEqual(['book rut'])
    expect(result.completed).toEqual([])
    expect(target.rows.has(`resource:${TN}`)).toBe(false)
    expect(target.rows.get(`resource:${UHB}`)).toEqual(whole)
  })

  test('a resource whose every slot is removed loses its receipt from parts', async () => {
    const tnRut = await TN_RUT()
    const target = memoryTarget()
    const first = await lists([tnRut], [])
    await run(target, await stagingWith([tnRut]), first.list, first.originals, ALL)
    expect(target.rows.has(`resource:${TN}`)).toBe(true)

    const second = await lists([], [])
    const result = await run(target, await stagingWith([]), second.list, second.originals, ALL)

    expect(result.applied).toEqual(['book rut'])
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(false)
    expect(target.rows.has(`resource:${TN}`)).toBe(false)
  })

  test('receipts are read and written in one transaction after the last unit; its failure is reported', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()
    const reads: string[][] = []
    const transact = target.transactRaw!
    target.transactRaw = async (read, decide) => {
      reads.push(read.keys)
      if (read.keys.includes(`resource:${TN}`)) target.failNextTransaction()
      return transact(read, decide)
    }

    const result = await run(target, await stagingWith([tnRut]), list, originals, ALL)

    expect(result.applied).toEqual(['book rut'])
    expect(result.completed).toEqual([TN])
    expect(reads).toHaveLength(2)
    expect(reads[1]).toContain(`resource:${TN}`)
    expect(reads[1]).toContain(REGISTER_PREFIX + idOf(tnRut))
    expect(result.failed).toEqual([{ scope: 'receipts', reason: 'quota', message: expect.any(String) }])
    expect(target.rows.has(`resource:${TN}`)).toBe(false)
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(true)

    // The next call (an app starting) has nothing to download; its receipts pass writes what the failed one left out.
    target.transactRaw = transact
    const next = await run(target, await stagingWith([]), list, originals, ALL)

    expect(next.applied).toEqual([])
    expect(next.failed).toEqual([])
    expect(target.rows.get(`resource:${TN}`)).toMatchObject({ content: {}, metadata: { downloadMethod: 'parts', releaseStamp: 'v1' } })
  })

  test('receipts follow the register read inside their transaction, not the one the call started from', async () => {
    const tnRut = await TN_RUT()
    const tnJon = await TN_JON()
    const { list, originals } = await lists([tnRut, tnJon], [])
    const target = memoryTarget()
    const transact = target.transactRaw!
    target.transactRaw = async (read, decide) => {
      // Another window applied Jonah between this call's last unit and its receipts.
      if (read.keys.includes(`resource:${TN}`)) {
        const other = registerRow(idOf(tnJon), { sha256: tnJon.entry.sha256, keys: [], list: 'es-419', at: '' }, NOW)
        target.rows.set(other.key, other.entry)
      }
      return transact(read, decide)
    }

    const result = await run(target, await stagingWith([tnRut]), list, originals, ['book rut'])

    expect(result.applied).toEqual(['book rut'])
    expect(target.rows.get(`resource:${TN}`)).toMatchObject({ metadata: { downloadMethod: 'parts' } })
  })

  const restamped = (l: PartsList, tag: string): PartsList => ({
    ...l,
    resources: l.resources.map((r) => ({ ...r, metadata: { ...(r.metadata as object), release: { tag_name: tag } } })),
  })
  const schemaOf = (m: ResourceMetadata) => ingestSchemaForResourceType(m.type, '2.3.0-usj')

  test('a release that changed tags and no part: the catalog rows and receipts follow it, matching each other', async () => {
    const tnRut = await TN_RUT()
    const uhb = await UHB_RUT()
    const target = memoryTarget()
    const first = await lists([tnRut], [uhb])
    await run(target, await stagingWith([tnRut, uhb]), first.list, first.originals, ALL)
    expect(target.rows.get(`resource:${TN}`)).toMatchObject({ metadata: { releaseStamp: 'v1' } })

    const list = restamped(first.list, 'v2')
    const originals = restamped(first.originals, 'v2')
    const result = await run(target, await stagingWith([]), list, originals, ALL)

    expect(result.applied).toEqual([])
    expect(result.failed).toEqual([])
    for (const key of [TN, UHB]) {
      const row = target.catalog.get(key)!
      expect(row.release?.tag_name).toBe('v2')
      expect(row.availability.offline).toBe(true)
      const receipt = target.rows.get(`resource:${key}`)
      expect(receipt).toMatchObject({ metadata: { releaseStamp: 'v2', downloadMethod: 'parts' } })
      expect(isMatchingIngestReceipt(receipt, expectedIngestReleaseStamp(row), schemaOf(row))).toBe(true)
    }
  })

  test('a catalog row that cannot be refreshed to the new release keeps its receipt, matching the old row', async () => {
    const tnRut = await TN_RUT()
    const target = memoryTarget()
    const first = await lists([tnRut], [])
    await run(target, await stagingWith([tnRut]), first.list, first.originals, ALL)
    const receipt = target.rows.get(`resource:${TN}`)
    target.putCatalogRows = async () => {
      throw new Error('catalog closed')
    }

    const result = await run(target, await stagingWith([]), restamped(first.list, 'v2'), first.originals, ALL)

    expect(result.failed).toEqual([{ scope: 'catalog', reason: 'error', message: expect.stringContaining('catalog closed') }])
    const row = target.catalog.get(TN)!
    expect(row.release?.tag_name).toBe('v1')
    expect(target.rows.get(`resource:${TN}`)).toEqual(receipt)
    expect(isMatchingIngestReceipt(receipt, expectedIngestReleaseStamp(row), schemaOf(row))).toBe(true)
  })

  test('a catalog row the receipts pass cannot read is reported, and that receipt left as it is', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()
    await run(target, await stagingWith([tnRut]), list, originals, ALL)
    target.rows.delete(`resource:${TN}`)
    const catalogRow = target.catalogRow!
    let reads = 0
    target.catalogRow = async (key) => {
      // The refresh reads it; the receipts pass, after it, cannot.
      if (key === TN && ++reads > 1) throw new Error('catalog unreadable')
      return catalogRow(key)
    }

    const result = await run(target, await stagingWith([]), list, originals, ALL)

    expect(result.failed).toEqual([{ scope: 'receipts', reason: 'error', message: expect.stringContaining('catalog unreadable') }])
    expect(target.rows.has(`resource:${TN}`)).toBe(false)
  })

  test('a startup call while a new release of one book downloads leaves that resource as it is', async () => {
    const tnRut = await TN_RUT()
    const tnJon = await TN_JON()
    const target = memoryTarget()
    const first = await lists([tnRut, tnJon], [])
    await run(target, await stagingWith([tnRut, tnJon]), first.list, first.originals, ALL)
    const receipt = target.rows.get(`resource:${TN}`)
    const stored = structuredClone(target.catalog.get(TN))

    // Release v2 changes only Jonah's part; it is not in staging yet.
    const nextJon = await built('book', TN, [row('sot', `tn:${TN}:jon`), row('sot', `tn:${TN}:jon:1`, 'v2')], { book: 'jon' })
    const second = await lists([tnRut, nextJon], [])
    const result = await run(target, await stagingWith([]), restamped(second.list, 'v2'), second.originals, ALL)

    expect(result.refused?.reason).toBe('missing')
    expect(result.failed).toEqual([{ scope: 'unit', unit: 'book jon', reason: 'missing', message: expect.stringContaining(nextJon.entry.sha256) }])
    // Jonah's v1 rows are still there: the row stays v1 and offline, the receipt stays, until the part arrives.
    expect(target.catalog.get(TN)).toEqual(stored)
    expect(target.rows.get(`resource:${TN}`)).toEqual(receipt)
  })

  test('a startup call while a builder change downloads keeps the receipt of the complete data held', async () => {
    const tnRut = await TN_RUT()
    const tnJon = await TN_JON()
    const target = memoryTarget()
    const first = await lists([tnRut, tnJon], [])
    await run(target, await stagingWith([tnRut, tnJon]), first.list, first.originals, ALL)
    const receipt = target.rows.get(`resource:${TN}`)
    const stored = structuredClone(target.catalog.get(TN))

    // The same release, every part of TN with a new sha (a builder change); none staged yet.
    const nextRut = await built('book', TN, [row('sot', `tn:${TN}:rut`), row('sot', `tn:${TN}:rut:1`, 'built again')], { book: 'rut' })
    const nextJon = await built('book', TN, [row('sot', `tn:${TN}:jon`), row('sot', `tn:${TN}:jon:1`, 'built again')], { book: 'jon' })
    const second = await lists([nextRut, nextJon], [])
    const result = await run(target, await stagingWith([]), second.list, second.originals, ALL)

    expect(result.refused?.reason).toBe('missing')
    expect(target.rows.get(`resource:${TN}`)).toEqual(receipt)
    expect(target.catalog.get(TN)).toEqual(stored)
  })

  /** The lists of a release that dropped TN: neither its catalog row nor any part of it. */
  const withoutTn = () => ({
    list: listOf('es-419', [], [TW], { originals: ORIGINALS_REF }),
    originals: listOf('originals', [], [UHB]),
  })

  test('a resource the lists stop carrying is no longer offline once its slots are removed', async () => {
    const tnRut = await TN_RUT()
    const target = memoryTarget()
    const first = await lists([tnRut], [])
    await run(target, await stagingWith([tnRut]), first.list, first.originals, ALL)
    expect(target.catalog.get(TN)!.availability).toMatchObject({ offline: true, partial: false })

    const second = withoutTn()
    const result = await run(target, await stagingWith([]), second.list, second.originals, ALL)

    expect(result.applied).toEqual(['book rut'])
    expect(result.failed).toEqual([])
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(false)
    expect(target.rows.has(`resource:${TN}`)).toBe(false)
    // The device keeps its row (it still knows the resource), no longer read as downloaded.
    expect(target.catalog.get(TN)!.availability).toMatchObject({ offline: false, partial: false })
    expect(target.catalog.get(TN)!.release?.tag_name).toBe('v1')
  })

  test('the flag of a resource the lists stop carrying is cleared before its rows go, so a stop after the unit leaves it right', async () => {
    const tnRut = await TN_RUT()
    const target = memoryTarget()
    const first = await lists([tnRut], [])
    await run(target, await stagingWith([tnRut]), first.list, first.originals, ALL)

    const putCatalogRows = target.putCatalogRows
    let writes = 0
    target.putCatalogRows = async (rows) => {
      // Only the write before the unit gets through: as if the app stopped once the unit committed.
      if (++writes > 1) throw new Error('catalog closed')
      return putCatalogRows(rows)
    }
    const second = withoutTn()
    const result = await run(target, await stagingWith([]), second.list, second.originals, ALL)

    expect(result.applied).toEqual(['book rut'])
    expect(target.rows.has(`tn:${TN}:rut:1`)).toBe(false)
    expect(target.catalog.get(TN)!.availability).toMatchObject({ offline: false, partial: false })
  })

  /** A whole pack of TN made on another device from what it holds. */
  async function wholePackOf(device: MemoryTarget, extra: { kind?: 'book'; books?: string[] } = {}) {
    const source: PackSource = {
      rowsByPrefix: async (prefix) =>
        [...device.rows].filter(([key]) => key >= prefix && key <= prefix + '￿').map(([key, entry]) => ({ key, entry })),
      catalogRow: async (key) => device.catalog.get(key) ?? null,
      catalogRows: async () => [...device.catalog.values()],
    }
    const pack = await buildLanguagePack({ source, language: 'es-419', resourceKeys: [TN], versions: VERSIONS, ...extra })
    expect(pack.skipped).toEqual([])
    return pack.bytes
  }

  test('a whole pack of another release opened with overwrite over parts: its slots are planned again, the old release kept until they arrive', async () => {
    // Another device holds Ruth's notes from parts of v1 and packs them whole.
    const v1 = await TN_RUT()
    const old = await lists([v1], [])
    const other = memoryTarget()
    await run(other, await stagingWith([v1]), old.list, old.originals, ALL)
    const bytes = await wholePackOf(other)

    // This device holds them from parts of v2.
    const v2 = await built('book', TN, [row('sot', `tn:${TN}:rut`), row('sot', `tn:${TN}:rut:1`, 'v2')], { book: 'rut' })
    const next = await lists([v2], [])
    const list = restamped(next.list, 'v2')
    const target = memoryTarget()
    await run(target, await stagingWith([v2]), list, next.originals, ALL)
    expect(target.catalog.get(TN)!.release?.tag_name).toBe('v2')

    const opened = await importLanguagePack({ bytes, target, overwrite: true, versions: VERSIONS })
    expect(opened.skippedResources).toEqual([])
    expect(target.rows.get(`tn:${TN}:rut:1`)).toMatchObject({ content: `tn:${TN}:rut:1` })

    // The app starts: the register no longer says v2 fills Ruth, so its part is planned again; until it arrives, the
    // catalog row and the receipt still name v1, as the rows on the device are.
    const register = registerOf(target)
    expect(register.has(idOf(v2))).toBe(false)
    const plan = planParts({ list, originals: next.originals, register, chosen: ALL })
    expect(plan.download.map((p) => p.sha256)).toEqual([v2.entry.sha256])
    const result = await applyParts({ target, staging: await stagingWith([]), plan, list, originals: next.originals, register, chosen: ALL, versions: VERSIONS, now: () => NOW })

    expect(result.refused?.reason).toBe('missing')
    expect(target.catalog.get(TN)!.release?.tag_name).toBe('v1')
    expect(target.rows.get(`resource:${TN}`)).toMatchObject({ metadata: { releaseStamp: 'v1' } })

    // Once the part is staged, v2 comes back whole.
    const done = await run(target, await stagingWith([v2]), list, next.originals, ALL)
    expect(done.applied).toEqual(['book rut'])
    expect(target.catalog.get(TN)!.release?.tag_name).toBe('v2')
    expect(target.rows.get(`tn:${TN}:rut:1`)).toEqual({ ...value('v2'), timestamp: NOW })
    expect(target.rows.get(`resource:${TN}`)).toMatchObject({ metadata: { releaseStamp: 'v2', downloadMethod: 'parts' } })
  })

  test('a book pack opened with overwrite gives back only the slots of its books, of that resource only', async () => {
    const v1 = await TN_RUT()
    const old = await lists([v1], [])
    const other = memoryTarget()
    await run(other, await stagingWith([v1]), old.list, old.originals, ALL)
    const bytes = await wholePackOf(other, { kind: 'book', books: ['rut'] })

    const rut = await built('book', TN, [row('sot', `tn:${TN}:rut`), row('sot', `tn:${TN}:rut:1`, 'v2')], { book: 'rut' })
    const jon = await TN_JON()
    const kt = await TW_KT()
    const next = await lists([rut, jon, kt], [])
    const list = restamped(next.list, 'v2')
    const target = memoryTarget()
    await run(target, await stagingWith([rut, jon, kt]), list, next.originals, ALL)
    // A resource whose key starts like TN's is another resource.
    const foreign = registerRow('book:o/es-419/tn-x:rut', { sha256: 'x', keys: [], list: 'pt-br', at: '' }, NOW)
    target.rows.set(foreign.key, foreign.entry)

    await importLanguagePack({ bytes, target, overwrite: true, versions: VERSIONS })

    const register = registerOf(target)
    expect(register.has(idOf(rut))).toBe(false)
    expect(register.has(idOf(jon))).toBe(true)
    expect(register.has(idOf(kt))).toBe(true)
    expect(register.has('book:o/es-419/tn-x:rut')).toBe(true)
  })

  test('a target that cannot read catalog rows is refused at once, nothing written', async () => {
    const tnRut = await TN_RUT()
    const { list, originals } = await lists([tnRut], [])
    const target = memoryTarget()
    delete (target as { catalogRow?: unknown }).catalogRow

    await expect(run(target, await stagingWith([tnRut]), list, originals, ALL)).rejects.toThrow('catalogRow')
    expect(target.rows.size).toBe(0)
    expect(target.catalog.size).toBe(0)
  })

  test('packTargetFrom carries the cache store’s transactRaw', async () => {
    const calls: unknown[] = []
    const catalog = { get: async () => null, getAll: async () => [], set: async () => {} }
    const cache = { getByPrefix: async () => [], putRawMany: async () => {} }
    expect(packTargetFrom({ cache, catalog }).transactRaw).toBeUndefined()
    const target = packTargetFrom({ cache: { ...cache, transactRaw: async (read: unknown) => void calls.push(read) }, catalog })
    await target.transactRaw!({ keys: ['a'], prefixes: [] }, () => ({ puts: [], deletes: [] }))
    expect(calls).toEqual([{ keys: ['a'], prefixes: [] }])
  })
})
