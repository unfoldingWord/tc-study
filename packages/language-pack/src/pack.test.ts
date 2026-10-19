import { describe, expect, it } from 'bun:test'
import JSZip from 'jszip'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { buildLanguagePack, importLanguagePack, readPackManifest } from './pack'
import { packSourceFrom, packTargetFrom } from './stores'
import type { CacheRow, PackSource, PackTarget } from './types'

const TN = 'es-419_gl/es-419/tn'
const TPL = 'es-419_gl/es-419/glt'
const TA = 'es-419_gl/es-419/ta'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const EN_TN = 'unfoldingWord/en/tn'

const meta = (key: string, extra: Partial<ResourceMetadata> = {}): ResourceMetadata =>
  ({
    resourceKey: key,
    server: 'git.door43.org',
    owner: key.split('/')[0],
    language: key.split('/')[1],
    resourceId: key.split('/')[2],
    subject: 'TSV Translation Notes',
    title: key,
    version: 'v1',
    release: { tag_name: 'v1', published_at: '2026-10-01T00:00:00Z' },
    type: [TPL, UGNT].includes(key) ? 'scripture' : 'notes',
    ...extra,
  }) as unknown as ResourceMetadata

const row = (key: string, content: unknown = { key }): CacheRow => ({ key, entry: { content, timestamp: 1, version: 1 } })
const STAMP = 'v1#2026-10-01T00_00_00Z'
const VERSIONS = { sot: { usjProcessing: '2.2.0-usj', notesTsvParser: 3 }, quote: { helpsQuote: 5 }, align: { helpsAlign: 6 } }
/** A receipt as the download worker leaves it after a complete download of the release the catalog names. */
const receipt = (key: string, scripture = false, extra: Record<string, unknown> = {}): CacheRow => ({
  key: `resource:${key}`,
  entry: { content: {}, metadata: { downloadComplete: true, releaseStamp: STAMP, ingestSchema: scripture ? 'usj:2.2.0-usj' : 'helps:1', ...extra } },
})

/** A store with what tc-study keeps for an es-419 Titus, the Greek it is built on, and things of other resources. */
function store() {
  const rows: CacheRow[] = [
    receipt(TN),
    row(`tn:${TN}:tit`, { _chunkedBook: true, chapters: [1, 2] }),
    row(`tn:${TN}:tit:1`),
    row(`tn:${TN}:tit:2`),
    row(`prepared:notes:${TN}:tit:nav`),
    row(`prepared:notes:${TN}:tit:1:full`),
    row(`helps-quote:${TN}@v1#2026:${UGNT}@v1+2.2.0-usj:tit:1`),
    row(`helps-align:${TN}@v1#2026:${UGNT}@v1+2.2.0-usj:${TPL}@v1+3000220:tit:1`),
    receipt(TPL, true),
    row(`scripture-usj:${TPL}:tit`),
    row(`scripture-usj:${TPL}:tit:1`),
    row(`prepared:scripture:${TPL}:tit:1:full`),
    receipt(TA),
    row(`${TA}/translate/figs-metaphor`),
    row(`helps-text:ta-title:${TA}@v1:translate/figs-metaphor`, 'Metáfora'),
    receipt(UGNT, true),
    row(`scripture-usj:${UGNT}:tit:1`),
    // Not of the pack: another language, and a resource whose key starts like ours.
    receipt(EN_TN),
    row(`tn:${EN_TN}:tit`),
    row(`prepared:notes:${EN_TN}:tit:nav`),
    receipt(`${TN}-extra`),
    // Downloaded, then a book failed: the worker merges the error into the receipt.
    receipt('es-419_gl/es-419/tq', false, { downloadComplete: false, downloadError: 'tit: 404' }),
    row(`tn:${TN}-extra:tit`),
    row('warm-coverage:v1'),
  ]
  const catalog = new Map<string, ResourceMetadata>([TN, TPL, TA, UGNT, EN_TN, 'es-419_gl/es-419/tq'].map((k) => [k, meta(k)]))
  const source: PackSource = {
    rowsByPrefix: async (prefix) => rows.filter((r) => r.key >= prefix && r.key <= prefix + '￿'),
    catalogRow: async (key) => catalog.get(key) ?? null,
    catalogRows: async () => [...catalog.values()],
  }
  return { rows, catalog, source }
}

function emptyTarget(initial: CacheRow[] = []) {
  const rows = new Map(initial.map((r) => [r.key, r.entry]))
  const writes: string[] = []
  const catalog = new Map<string, ResourceMetadata>()
  const target: PackTarget = {
    putRows: async (list) => {
      for (const r of list) {
        rows.set(r.key, r.entry)
        writes.push(r.key)
      }
    },
    existingKeys: async (keys) => new Set(keys.filter((k) => rows.has(k))),
    putCatalogRows: async (list) => {
      for (const r of list) catalog.set(r.key, r.metadata)
    },
  }
  return { rows, writes, catalog, target }
}

describe('hacer un paquete de idioma', () => {
  it('lleva los recursos del idioma y el griego que sus citas necesitan, con cada capa, y nada de otros recursos', async () => {
    const { source } = store()
    const { bytes, manifest, skipped } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', originalKeys: [UGNT], now: new Date('2026-10-14T00:00:00Z') })
    expect(manifest.resources.map((r) => [r.key, r.role])).toEqual([
      [TN, 'language'],
      [TPL, 'language'],
      [TA, 'language'],
      [UGNT, 'original'],
    ])
    expect(manifest.resources[0]!.rows).toEqual({ receipt: 1, sot: 3, prepared: 2, quote: 1, align: 1 })
    expect(manifest.resources[2]!.rows).toEqual({ receipt: 1, sot: 1, text: 1 })
    expect(manifest.resources[0]!.stamp).toBe('v1#2026-10-01T00_00_00Z')
    // The tQ of the catalog was never downloaded.
    expect(skipped).toEqual([{ key: 'es-419_gl/es-419/tq', why: 'su descarga no terminó, o es de otra versión' }])
    expect(manifest.versions).toEqual(VERSIONS)
    const zip = await JSZip.loadAsync(bytes)
    const all = (await Promise.all(Object.values(zip.files).filter((f) => f.name.endsWith('.jsonl')).map((f) => f.async('string')))).join('')
    expect(all).not.toContain(EN_TN)
    expect(all).not.toContain(`${TN}-extra`)
    expect(all).not.toContain('warm-coverage')
  })

  it('un recurso cuya clave empieza igual que la de otro no se cuela en el paquete', async () => {
    const { source } = store()
    const { bytes, manifest } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
    expect(manifest.resources[0]!.rows.receipt).toBe(1)
    const zip = await JSZip.loadAsync(bytes)
    const all = (await Promise.all(Object.values(zip.files).filter((f) => f.name.endsWith('.jsonl')).map((f) => f.async('string')))).join('')
    expect(all).not.toContain(`${TN}-extra`)
  })

  it('se puede pedir solo lo mínimo: los recibos y la fuente, sin lo construido', async () => {
    const { source } = store()
    const { manifest } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', resourceKeys: [TN], originalKeys: [], layers: [] })
    expect(manifest.layers).toEqual(['receipt', 'sot'])
    expect(manifest.resources[0]!.rows).toEqual({ receipt: 1, sot: 3 })
  })

  it('un recurso que no se terminó de descargar no entra, y se dice por qué', async () => {
    const { source } = store()
    const { manifest, skipped } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', resourceKeys: ['es-419_gl/es-419/tq', 'x/y/z'], originalKeys: [] })
    expect(manifest.resources).toEqual([])
    expect(skipped).toEqual([
      { key: 'es-419_gl/es-419/tq', why: 'su descarga no terminó, o es de otra versión' },
      { key: 'x/y/z', why: 'no está en el catálogo' },
    ])
  })
})

describe('abrir un paquete de idioma en otro aparato', () => {
  it('deja las filas y el catálogo tal como estaban, con los trozos por capítulo incluidos', async () => {
    const { source, rows } = store()
    const { bytes } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', originalKeys: [UGNT] })
    const there = emptyTarget()
    const result = await importLanguagePack({ bytes, target: there.target })
    const packed = rows.filter((r) => ![EN_TN, `${TN}-extra`, 'warm-coverage', 'es-419/tq'].some((s) => r.key.includes(s)))
    expect([...there.rows.keys()].sort()).toEqual(packed.map((r) => r.key).sort())
    expect(there.rows.get(`tn:${TN}:tit`)).toEqual(rows.find((r) => r.key === `tn:${TN}:tit`)!.entry)
    expect([...there.catalog.keys()].sort()).toEqual([TA, TN, TPL, UGNT].sort())
    expect(result.written).toBe(packed.length)
  })

  it('dice cuánto lleva mientras abre, hasta todas sus filas', async () => {
    const { source } = store()
    const { bytes } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', originalKeys: [UGNT] })
    const seen: Array<[number, number]> = []
    const result = await importLanguagePack({ bytes, target: emptyTarget().target, batch: 2, onProgress: (done, total) => seen.push([done, total]) })
    expect(seen[0][0]).toBe(0)
    expect(seen.at(-1)).toEqual([result.written, result.written])
    expect(seen.every(([d], i) => i === 0 || d >= seen[i - 1][0])).toBe(true)
  })

  it('funciona con el catálogo de tc-study, que lista claves y guarda de a una', async () => {
    const { rows, catalog } = store()
    const cache = { getByPrefix: async (prefix: string) => rows.filter((r) => r.key >= prefix && r.key <= prefix + '\uffff') }
    const tcCatalog = { get: async (k: string) => catalog.get(k) ?? null, getAll: async () => [...catalog.keys()] }
    const { manifest } = await buildLanguagePack({ versions: VERSIONS, source: packSourceFrom({ cache, catalog: tcCatalog }), language: 'es-419', originalKeys: [] })
    expect(manifest.resources.map((r) => r.key)).toEqual([TN, TPL, TA])
    const saved = new Map<string, ResourceMetadata>()
    const there = { getByPrefix: async () => [], putRawMany: async () => {}, hasRawKeys: async () => new Set<string>() }
    const target = packTargetFrom({ cache: there, catalog: { get: async (k: string) => saved.get(k) ?? null, getAll: async () => [...saved.keys()], set: async (k: string, m: ResourceMetadata) => void saved.set(k, m) } })
    const { bytes } = await buildLanguagePack({ versions: VERSIONS, source: packSourceFrom({ cache, catalog: tcCatalog }), language: 'es-419', resourceKeys: [TN], originalKeys: [] })
    await importLanguagePack({ bytes, target, versions: VERSIONS })
    expect([...saved.keys()]).toEqual([TN])
  })

  it('una app con otra versión del procesamiento de los textos no abre el paquete; con otra versión de las citas, las reconstruye', async () => {
    const { source } = store()
    const { bytes } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
    await expect(importLanguagePack({ bytes, target: emptyTarget().target, versions: { ...VERSIONS, sot: { usjProcessing: '2.3.0-usj' } } })).rejects.toThrow(/otra versión del procesamiento/)
    const result = await importLanguagePack({ bytes, target: emptyTarget().target, versions: { ...VERSIONS, quote: { helpsQuote: 6 } } })
    expect(result.skippedLayers).toEqual(['quote'])
    expect(result.byLayer.quote).toBeUndefined()
    expect(result.byLayer.align).toBe(1)
  })

  it('un recurso que el aparato tiene en otra versión se deja como está, salvo que se pida reemplazarlo; entonces entra entero', async () => {
    const { source } = store()
    const { bytes } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
    const older = meta(TN, { release: { tag_name: 'v0', published_at: '2026-01-01T00:00:00Z' } } as never)
    const mine = { content: 'lo de la versión vieja', timestamp: 9, version: 1 }
    const kept = emptyTarget([{ key: `tn:${TN}:tit:1`, entry: mine }])
    kept.catalog.set(TN, older)
    const target = { ...kept.target, catalogRow: async (k: string) => kept.catalog.get(k) ?? null }
    const left = await importLanguagePack({ bytes, target, versions: VERSIONS })
    expect(left.skippedResources).toEqual([{ key: TN, why: 'el aparato tiene otra versión (v0#2026-01-01T00_00_00Z)' }])
    expect(left.written).toBe(0)
    expect(kept.catalog.get(TN)).toBe(older)
    const replaced = await importLanguagePack({ bytes, target, versions: VERSIONS, overwrite: true })
    expect(replaced.skippedResources).toEqual([])
    expect(kept.rows.get(`tn:${TN}:tit:1`)).not.toEqual(mine)
    expect(kept.catalog.get(TN)).not.toBe(older)
  })

  it('se puede pedir reemplazar solo algunos recursos: los demás en otra versión se dejan como están', async () => {
    const { source } = store()
    const { bytes } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', resourceKeys: [TN, TPL], originalKeys: [] })
    const older = (key: string) => meta(key, { release: { tag_name: 'v0', published_at: '2026-01-01T00:00:00Z' } } as never)
    const mine = { content: 'lo de la versión vieja', timestamp: 9, version: 1 }
    const kept = emptyTarget([
      { key: `tn:${TN}:tit:1`, entry: mine },
      { key: `scripture-usj:${TPL}:tit:1`, entry: mine },
    ])
    kept.catalog.set(TN, older(TN))
    kept.catalog.set(TPL, older(TPL))
    const target = { ...kept.target, catalogRow: async (k: string) => kept.catalog.get(k) ?? null }
    const result = await importLanguagePack({ bytes, target, versions: VERSIONS, overwrite: [TN] })
    expect(result.skippedResources.map((r) => r.key)).toEqual([TPL])
    expect(kept.rows.get(`tn:${TN}:tit:1`)).not.toEqual(mine)
    expect(kept.catalog.get(TN)).not.toEqual(older(TN))
    expect(kept.rows.get(`scripture-usj:${TPL}:tit:1`)).toEqual(mine)
    expect(kept.catalog.get(TPL)).toEqual(older(TPL))
  })

  it('el recibo de cada recurso se escribe al final, para que un paquete cortado no deje nada por completo que no lo está', async () => {
    const { source } = store()
    const { bytes } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
    const there = emptyTarget()
    await importLanguagePack({ bytes, target: there.target, batch: 2 })
    expect(there.writes.at(-1)).toBe(`resource:${TN}`)
  })

  it('lo que el aparato ya tiene se queda, salvo que se pida reemplazarlo', async () => {
    const { source } = store()
    const { bytes } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
    const mine = { content: 'lo mío', timestamp: 9, version: 1 }
    const kept = emptyTarget([{ key: `tn:${TN}:tit:1`, entry: mine }])
    const first = await importLanguagePack({ bytes, target: kept.target })
    expect(kept.rows.get(`tn:${TN}:tit:1`)).toEqual(mine)
    expect(first.keptExisting).toBe(1)
    const replaced = emptyTarget([{ key: `tn:${TN}:tit:1`, entry: mine }])
    await importLanguagePack({ bytes, target: replaced.target, overwrite: true })
    expect(replaced.rows.get(`tn:${TN}:tit:1`)).not.toEqual(mine)
  })

  it('se puede abrir solo una parte: la fuente sin lo construido', async () => {
    const { source } = store()
    const { bytes } = await buildLanguagePack({ versions: VERSIONS, source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
    const there = emptyTarget()
    const result = await importLanguagePack({ bytes, target: there.target, layers: [] })
    expect(result.byLayer).toEqual({ sot: 3, receipt: 1 })
  })

  it('un archivo que no es un paquete, o de una versión más nueva, se rechaza con una razón clara', async () => {
    const other = new JSZip()
    other.file('manifest.json', JSON.stringify({ format: 'bt-synergy-collection' }))
    await expect(readPackManifest(await other.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/no es un paquete de idioma/)
    const newer = new JSZip()
    newer.file('manifest.json', JSON.stringify({ format: 'bt-synergy-language-pack', formatVersion: '2.0.0' }))
    await expect(readPackManifest(await newer.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/versión más nueva/)
    await expect(readPackManifest(await new JSZip().generateAsync({ type: 'uint8array' }))).rejects.toThrow(/manifest\.json/)
  })
})
