import { beforeAll, describe, expect, test } from 'bun:test'
import { BUILDER, buildLanguage } from '../build/language'
import { type BuiltSegment } from '../build/catalog'
import { hex, readHeader, readSegment } from '../codec/container'
import type { CatalogModel } from '../model'
import { partsSource } from '../node/partsSource'
import { CATALOG_TABLES, catalogView } from '../read/catalog'
import type { RowSource } from '../source/rows'
import { zipSource } from '../source/zipSource'
import { bridgeZip } from './fromV2'

// Case 13 of the tests (spec/tests/README.md): the format 1.1 pack of es-419 Titus, with the originals of case 4.
const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', 'spec', 'tests', 'data')
const LIST = join(DATA, 'es-419', 'list.json')
const ORIGINALS_LIST = join(DATA, 'originals', 'list.json')
const PARTS = join(DATA, 'parts')
const ZIP = join(DATA, 'es-419-tit.langpack.zip')

const DEVICE = 'phone-7'
const NOW = '2026-11-01T10:00:00Z'
const bytesOf = async (path: string) => new Uint8Array(await Bun.file(path).arrayBuffer())
const originals = () => partsSource({ list: ORIGINALS_LIST, partsDir: PARTS })
const noOriginals: RowSource = { async resources() { return [] }, async *rows() {} }

async function catalogOf(built: BuiltSegment): Promise<CatalogModel> {
  return catalogView((await readSegment(built.bytes, { known: CATALOG_TABLES })).seg)
}

describe('bridgeZip: the format 1.1 pack of es-419 Titus', () => {
  let bridged: Awaited<ReturnType<typeof bridgeZip>>
  let published: Awaited<ReturnType<typeof buildLanguage>>
  let catalog: CatalogModel

  beforeAll(async () => {
    bridged = await bridgeZip(await bytesOf(ZIP), await originals(), DEVICE, NOW)
    published = await buildLanguage({
      source: await partsSource({ list: LIST, partsDir: PARTS, originals: ORIGINALS_LIST }),
      lang: 'es-419',
      registry: {},
      about: { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: NOW, builder: BUILDER },
    })
    catalog = await catalogOf(bridged.catalog)
  })

  test('the source says the language of the pack', async () => {
    expect((await zipSource(await bytesOf(ZIP))).language).toBe('es-419')
  })

  test('case 13: the Titus book segment is the one the parts give, with the same id and the same bytes', () => {
    const [fromPack] = bridged.segments.filter((s) => s.seg.h.class === 'book')
    const [fromParts] = published.segments.filter((s) => s.seg.h.class === 'book')
    expect(fromPack.seg.h.book).toBe('tit')
    expect(fromPack.id).toBe(fromParts.id)
    expect(fromPack.bytes).toEqual(fromParts.bytes)
  })

  test('the pack brings the book and the map of what it had', () => {
    expect(bridged.segments.map((s) => [s.seg.h.class, s.seg.h.part ?? s.seg.h.book])).toEqual([['map', 'core'], ['map', 'tit'], ['book', 'tit'], ['orig', 'tit']])
    expect(catalog.units.map((u) => u.id)).toEqual(['book:tit', 'map', 'orig:tit'])
    // The pack has no tW or tA: the book needs no article group, so it can activate (a need no unit of the catalog meets would block it).
    expect(catalog.units[0].needs).toEqual(['map', 'orig:tit'])
    expect(catalog.segments.map((s) => hex(s.id))).toEqual(bridged.segments.map((s) => s.id))
  })

  test('the catalog is local: the device is the publisher, it is revision 1, and it has no signature', () => {
    expect(catalog.lang).toBe('es-419')
    expect(catalog.about).toEqual({
      format: '3.0',
      catalog: 'es-419',
      publisher: `local:${DEVICE}`,
      origin: 'local',
      revision: 1,
      built: NOW,
      builder: BUILDER,
    })
    expect(catalog.about.previous).toBeUndefined()
    expect(catalog.requires).toBeUndefined()
    expect(readHeader(bridged.catalog.bytes).header.sig).toBeUndefined()
  })

  test('the catalog lists the resources of the pack with what the manifest says: the title, and no license', () => {
    expect(catalog.resources.map((r) => r.key)).toEqual(['glt', 'gst', 'tn', 'tq', 'twl'].map((id) => `es-419_gl/es-419/${id}`).concat('unfoldingWord/el-x-koine/ugnt'))
    const tn = catalog.resources.find((r) => r.key.endsWith('/tn'))!
    expect(tn).toMatchObject({ title: 'Notas de Traducción', subject: 'TSV Translation Notes', release: 'v66', license: 'unknown' })
    expect(tn.books).toEqual(Uint8Array.from([0, 0, 0, 0, 0, 0, 128, 0, 0]))
    // The same segment, from the parts, has the same resources (the lists carry the license; the pack does not).
    const bookOf = (b: { segments: { seg: { h: { class: string } } }[] }) => b.segments.find((s) => s.seg.h.class === 'book')!
    expect(bookOf(published).seg.h.res).toEqual(bookOf(bridged).seg.h.res)
  })

  test('twice gives the same segments and the same catalog', async () => {
    const again = await bridgeZip(await bytesOf(ZIP), await originals(), DEVICE, NOW)
    expect(again.segments.map((s) => s.id)).toEqual(bridged.segments.map((s) => s.id))
    expect(again.segments.map((s) => s.inputs)).toEqual(bridged.segments.map((s) => s.inputs))
    expect(again.catalog.id).toBe(bridged.catalog.id)
  })

  test('another device or another date gives the same segments and another catalog', async () => {
    const other = await bridgeZip(await bytesOf(ZIP), await originals(), 'tablet-2', '2026-12-24T08:30:00Z')
    expect(other.segments.map((s) => s.id)).toEqual(bridged.segments.map((s) => s.id))
    expect(other.catalog.id).not.toBe(bridged.catalog.id)
    expect((await catalogOf(other.catalog)).about.publisher).toBe('local:tablet-2')
  })

  test('the report is the one of the build, with no line of a missing original', () => {
    expect(bridged.report.length).toBeGreaterThan(0)
    for (const line of bridged.report) expect(line).toMatch(/^book tit: \S/)
    expect(bridged.report.some((line) => line.includes('originals'))).toBe(false)
  })
})

describe('bridgeZip: a pack with no originals available', () => {
  test('waits for them: no book is built and the report says so', async () => {
    const built = await bridgeZip(await bytesOf(ZIP), noOriginals, DEVICE, NOW)
    expect(built.segments.filter((s) => s.seg.h.class !== 'map')).toEqual([])
    expect(built.report).toHaveLength(1)
    expect(built.report[0]).toMatch(/^book tit: the source has no originals of this book/)
    expect(built.report[0]).toContain('waits for them')
    const catalog = await catalogOf(built.catalog)
    expect(catalog.about.origin).toBe('local')
    expect(catalog.units.map((u) => u.id)).toEqual(['map'])
  })
})

describe('bridgeZip: bytes that are not a format 1 pack', () => {
  test('are refused', async () => {
    await expect(bridgeZip(new Uint8Array([1, 2, 3]), await originals(), DEVICE, NOW)).rejects.toThrow()
  })
})
