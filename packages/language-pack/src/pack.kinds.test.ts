import { describe, expect, it } from 'bun:test'
import { resourceContentStamp, type ResourceMetadata } from '@bt-synergy/resource-catalog'
import { bookOfRow, originalOfDerivedRow } from './keys'
import { buildLanguagePack, importLanguagePack } from './pack'
import type { CacheRow, PackSource, PackTarget } from './types'

const TN = 'es-419_gl/es-419/tn'
const GLT = 'es-419_gl/es-419/glt'
const TA = 'es-419_gl/es-419/ta'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const UHB = 'unfoldingWord/hbo/uhb'
const TWL = 'es-419_gl/es-419/twl'

const release = (tag: string, at: string) => ({ tag_name: tag, published_at: at })
const META: Record<string, ResourceMetadata> = Object.fromEntries(
  (
    [
      [TN, 'notes', release('v66', '2024-07-17T20:13:08Z')],
      [GLT, 'scripture', release('v42', '2026-08-11T12:22:03Z')],
      [TA, 'academy', release('v12', '2024-07-17T20:13:00Z')],
      [UGNT, 'scripture', release('v0.34', '2023-09-27T02:19:31Z')],
      [UHB, 'scripture', release('v2.1.30', '2023-01-05T10:00:00Z')],
    ] as const
  ).map(([key, type, rel]) => [
    key,
    {
      resourceKey: key,
      owner: key.split('/')[0],
      language: key.split('/')[1],
      resourceId: key.split('/')[2],
      type,
      title: key,
      release: rel,
    } as unknown as ResourceMetadata,
  ])
)
// tc-study's catalog keeps word links as `type: 'unknown'`: only the subject says what they are.
META[TWL] = {
  resourceKey: TWL,
  owner: 'es-419_gl',
  language: 'es-419',
  resourceId: 'twl',
  type: 'unknown',
  subject: 'TSV Translation Words Links',
  title: TWL,
  release: release('v18', '2024-07-17T20:13:06Z'),
} as unknown as ResourceMetadata
const stamp = (key: string) => resourceContentStamp(META[key])
const VERSIONS = { sot: { usjProcessing: '2.2.0-usj' }, quote: { helpsQuote: 5 }, align: { helpsAlign: 6 } }
const receipt = (key: string): CacheRow => ({
  key: `resource:${key}`,
  entry: {
    content: {},
    metadata: {
      downloadComplete: true,
      releaseStamp: stamp(key),
      ingestSchema: META[key].type === 'scripture' ? 'usj:2.2.0-usj' : 'helps:1',
    },
  },
})
const row = (key: string): CacheRow => ({ key, entry: { content: key, timestamp: 1, version: 1 } })
const ol = (key: string) => `${key}@${stamp(key)}+2.2.0-usj`

/** es-419 with Titus (NT) and Ruth (OT) notes, a Titus GLT, a TA article, and both originals. */
function store() {
  const rows: CacheRow[] = [
    receipt(TN),
    row(`tn:${TN}:tit`),
    row(`tn:${TN}:tit:1`),
    row(`tn:${TN}:rut`),
    row(`tn:${TN}:rut:1`),
    row(`prepared:notes:${TN}:tit:nav`),
    row(`prepared:notes:${TN}:tit:1:full`),
    row(`prepared:notes:${TN}:rut:1:full`),
    row(`helps-quote:${TN}@${stamp(TN)}:${ol(UGNT)}:tit:1`),
    row(`helps-quote:${TN}@${stamp(TN)}:${ol(UHB)}:rut:1`),
    row(`helps-align:${TN}@${stamp(TN)}:${ol(UGNT)}:${GLT}@${stamp(GLT)}+3000220:tit:1`),
    receipt(TWL),
    row(`twl:${TWL}:tit`),
    row(`prepared:words-links:${TWL}:tit:1:full`),
    row(`helps-quote:${TWL}@${stamp(TWL)}:${ol(UGNT)}:tit:1`),
    receipt(GLT),
    row(`scripture-usj:${GLT}:tit`),
    row(`scripture-usj:${GLT}:tit:1`),
    row(`prepared:scripture:${GLT}:tit:1:full`),
    receipt(TA),
    row(`${TA}/translate/figs-metaphor`),
    row(`helps-text:ta-title:${TA}@${stamp(TA)}:translate/figs-metaphor`),
    receipt(UGNT),
    row(`scripture-usj:${UGNT}:tit:1`),
    receipt(UHB),
    row(`scripture-usj:${UHB}:rut:1`),
  ]
  const source: PackSource = {
    rowsByPrefix: async (prefix) => rows.filter((r) => r.key.startsWith(prefix)),
    catalogRow: async (key) => META[key] ?? null,
    catalogRows: async () => Object.values(META),
  }
  return source
}

function target(device: Record<string, ResourceMetadata> = {}) {
  const rows = new Map<string, unknown>()
  const catalog = new Map<string, ResourceMetadata>(Object.entries(device))
  const t: PackTarget = {
    putRows: async (list) => {
      for (const r of list) rows.set(r.key, r.entry)
    },
    existingKeys: async (keys) => new Set(keys.filter((k) => rows.has(k))),
    putCatalogRows: async (list) => {
      for (const r of list) catalog.set(r.key, r.metadata)
    },
    catalogRow: async (key) => catalog.get(key) ?? null,
  }
  return { rows, catalog, target: t }
}

const keysOf = (m: { resources: Array<{ key: string }> }) => m.resources.map((r) => r.key).sort()

describe('las claves dicen de qué libro y de qué original son', () => {
  it('lee el libro de cada capa y el original de las citas', () => {
    expect(bookOfRow(`tn:${TN}:TIT:1`, 'sot', TN)).toBe('tit')
    expect(bookOfRow(`${TA}/translate/figs-metaphor`, 'sot', TA)).toBeNull()
    expect(bookOfRow(`prepared:notes:${TN}:rut:1:full`, 'prepared', TN)).toBe('rut')
    expect(bookOfRow(`helps-align:${TN}@x:${ol(UGNT)}:${GLT}@y+3000220:tit:1`, 'align', TN)).toBe('tit')
    expect(originalOfDerivedRow(`helps-quote:${TN}@x:${ol(UHB)}:rut:1`)).toEqual({ key: UHB, stamp: stamp(UHB) })
  })
})

describe('las clases de paquete', () => {
  it('un paquete de idioma no lleva los originales, pero dice cuáles necesitan sus citas', async () => {
    const { manifest } = await buildLanguagePack({ source: store(), language: 'es-419', versions: VERSIONS })
    expect(manifest.kind).toBe('language')
    expect(keysOf(manifest)).toEqual([GLT, TA, TN, TWL])
    expect(manifest.requires).toEqual([
      { key: UGNT, stamp: stamp(UGNT) },
      { key: UHB, stamp: stamp(UHB) },
    ])
    expect(manifest.resources.find((r) => r.key === TN)?.books).toEqual(['rut', 'tit'])
  })

  it('el paquete de originales lleva UGNT y UHB enteros y nada del idioma', async () => {
    const { manifest } = await buildLanguagePack({ source: store(), language: 'es-419', kind: 'originals', versions: VERSIONS })
    expect(keysOf(manifest)).toEqual([UGNT, UHB])
    expect(manifest.resources.every((r) => r.role === 'original' && r.rows.receipt === 1 && r.rows.sot === 1)).toBe(true)
    expect(manifest.requires).toBeUndefined()
  })

  it('el paquete base lleva TA entero y de los recursos por libro solo su fila de catálogo y sus libros', async () => {
    const { manifest } = await buildLanguagePack({ source: store(), language: 'es-419', kind: 'base', versions: VERSIONS })
    const byKey = Object.fromEntries(manifest.resources.map((r) => [r.key, r]))
    expect(byKey[TA].rows).toEqual({ receipt: 1, sot: 1, text: 1 })
    expect(byKey[TN].rows).toEqual({})
    expect(byKey[TN].books).toEqual(['rut', 'tit'])
    expect(byKey[GLT].books).toEqual(['tit'])
    expect(byKey[TWL].rows).toEqual({})
    expect(byKey[TWL].books).toEqual(['tit'])
  })

  it('un paquete de Tito trae solo Tito, sin recibos, y pide solo el griego', async () => {
    const { manifest, skipped } = await buildLanguagePack({ source: store(), language: 'es-419', kind: 'book', books: ['TIT'], versions: VERSIONS })
    expect(manifest.books).toEqual(['tit'])
    expect(keysOf(manifest)).toEqual([GLT, TN, TWL])
    const tn = manifest.resources.find((r) => r.key === TN)!
    expect(tn.rows).toEqual({ sot: 2, prepared: 2, quote: 1, align: 1 })
    expect(manifest.resources.every((r) => !r.rows.receipt)).toBe(true)
    expect(manifest.requires).toEqual([{ key: UGNT, stamp: stamp(UGNT) }])
    expect(skipped).toEqual([])
  })

  it('un libro que un recurso no tiene se dice, y el recurso queda fuera', async () => {
    const { manifest, skipped } = await buildLanguagePack({ source: store(), language: 'es-419', kind: 'book', books: ['rut'], versions: VERSIONS })
    expect(keysOf(manifest)).toEqual([TN])
    expect(skipped).toEqual([
      { key: GLT, why: 'no tiene rut' },
      { key: TWL, why: 'no tiene rut' },
    ])
  })

  it('un paquete de libro sin libros no se hace', async () => {
    await expect(buildLanguagePack({ source: store(), language: 'es-419', kind: 'book', books: [] })).rejects.toThrow('al menos un libro')
  })
})

describe('abrir un paquete que necesita originales', () => {
  it('con el mismo original en el aparato, entran las citas', async () => {
    const { bytes } = await buildLanguagePack({ source: store(), language: 'es-419', kind: 'book', books: ['tit'], versions: VERSIONS })
    const { target: t, rows } = target({ [UGNT]: META[UGNT] })
    const result = await importLanguagePack({ bytes, target: t, versions: VERSIONS })
    expect(result.originals).toEqual([{ key: UGNT, stamp: stamp(UGNT), status: 'present' }])
    expect(result.skippedLayers).toEqual([])
    expect([...rows.keys()].some((k) => k.startsWith('helps-quote:'))).toBe(true)
    expect([...rows.keys()].some((k) => k.startsWith('resource:'))).toBe(false)
  })

  it('sin el original todavía, las citas entran igual y el resultado lo avisa', async () => {
    const { bytes } = await buildLanguagePack({ source: store(), language: 'es-419', kind: 'book', books: ['tit'], versions: VERSIONS })
    const { target: t, rows } = target()
    const result = await importLanguagePack({ bytes, target: t, versions: VERSIONS })
    expect(result.originals.map((o) => o.status)).toEqual(['missing'])
    expect([...rows.keys()].some((k) => k.startsWith('helps-align:'))).toBe(true)
  })

  it('con otra versión del original, las citas y alineaciones se quedan fuera y lo demás entra', async () => {
    const { bytes } = await buildLanguagePack({ source: store(), language: 'es-419', kind: 'book', books: ['tit'], versions: VERSIONS })
    const otherUgnt = { ...META[UGNT], release: release('v0.35', '2026-01-01T00:00:00Z') } as unknown as ResourceMetadata
    const { target: t, rows } = target({ [UGNT]: otherUgnt })
    const result = await importLanguagePack({ bytes, target: t, versions: VERSIONS })
    expect(result.originals.map((o) => o.status)).toEqual(['other-release'])
    expect(result.skippedLayers.sort()).toEqual(['align', 'quote'])
    const keys = [...rows.keys()]
    expect(keys.some((k) => k.startsWith('helps-quote:') || k.startsWith('helps-align:'))).toBe(false)
    expect(keys).toContain(`tn:${TN}:tit:1`)
    expect(keys).toContain(`prepared:notes:${TN}:tit:1:full`)
  })

  it('un paquete que trae el mismo original adentro no depende del aparato', async () => {
    const { bytes } = await buildLanguagePack({ source: store(), language: 'es-419', originalKeys: [UGNT, UHB], versions: VERSIONS })
    const { target: t } = target()
    const result = await importLanguagePack({ bytes, target: t, versions: VERSIONS })
    expect(result.originals.map((o) => o.status)).toEqual(['in-pack', 'in-pack'])
  })
})
