import { describe, expect, it } from 'bun:test'
import JSZip from 'jszip'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { buildLanguagePack, importLanguagePack, readPackManifest } from './pack'
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
    ...extra,
  }) as unknown as ResourceMetadata

const row = (key: string, content: unknown = { key }): CacheRow => ({ key, entry: { content, timestamp: 1, version: 1 } })

/** A store with what tc-study keeps for an es-419 Titus, the Greek it is built on, and things of other resources. */
function store() {
  const rows: CacheRow[] = [
    row(`resource:${TN}`, { releaseStamp: 'v1#2026-10-01T00_00_00Z' }),
    row(`tn:${TN}:tit`, { _chunkedBook: true, chapters: [1, 2] }),
    row(`tn:${TN}:tit:1`),
    row(`tn:${TN}:tit:2`),
    row(`prepared:notes:${TN}:tit:nav`),
    row(`prepared:notes:${TN}:tit:1:full`),
    row(`helps-quote:${TN}@v1#2026:${UGNT}@v1+2.2.0-usj:tit:1`),
    row(`helps-align:${TN}@v1#2026:${UGNT}@v1+2.2.0-usj:${TPL}@v1+3000220:tit:1`),
    row(`resource:${TPL}`),
    row(`scripture-usj:${TPL}:tit`),
    row(`scripture-usj:${TPL}:tit:1`),
    row(`prepared:scripture:${TPL}:tit:1:full`),
    row(`resource:${TA}`),
    row(`${TA}/translate/figs-metaphor`),
    row(`helps-text:ta-title:${TA}@v1:translate/figs-metaphor`, 'Metáfora'),
    row(`resource:${UGNT}`),
    row(`scripture-usj:${UGNT}:tit:1`),
    // Not of the pack: another language, and a resource whose key starts like ours.
    row(`resource:${EN_TN}`),
    row(`tn:${EN_TN}:tit`),
    row(`prepared:notes:${EN_TN}:tit:nav`),
    row(`resource:${TN}-extra`),
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
    const { bytes, manifest, skipped } = await buildLanguagePack({ source, language: 'es-419', originalKeys: [UGNT], now: new Date('2026-10-14T00:00:00Z') })
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
    expect(skipped.map((s) => s.key).sort()).toEqual(['es-419_gl/es-419/tq'])
    const zip = await JSZip.loadAsync(bytes)
    const all = (await Promise.all(Object.values(zip.files).filter((f) => f.name.endsWith('.jsonl')).map((f) => f.async('string')))).join('')
    expect(all).not.toContain(EN_TN)
    expect(all).not.toContain(`${TN}-extra`)
    expect(all).not.toContain('warm-coverage')
  })

  it('un recurso cuya clave empieza igual que la de otro no se cuela en el paquete', async () => {
    const { source } = store()
    const { bytes, manifest } = await buildLanguagePack({ source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
    expect(manifest.resources[0]!.rows.receipt).toBe(1)
    const zip = await JSZip.loadAsync(bytes)
    const all = (await Promise.all(Object.values(zip.files).filter((f) => f.name.endsWith('.jsonl')).map((f) => f.async('string')))).join('')
    expect(all).not.toContain(`${TN}-extra`)
  })

  it('se puede pedir solo lo mínimo: los recibos y la fuente, sin lo construido', async () => {
    const { source } = store()
    const { manifest } = await buildLanguagePack({ source, language: 'es-419', resourceKeys: [TN], originalKeys: [], layers: [] })
    expect(manifest.layers).toEqual(['receipt', 'sot'])
    expect(manifest.resources[0]!.rows).toEqual({ receipt: 1, sot: 3 })
  })

  it('un recurso que no se terminó de descargar no entra, y se dice por qué', async () => {
    const { source } = store()
    const { manifest, skipped } = await buildLanguagePack({ source, language: 'es-419', resourceKeys: ['es-419_gl/es-419/tq', 'x/y/z'], originalKeys: [] })
    expect(manifest.resources).toEqual([])
    expect(skipped).toEqual([
      { key: 'es-419_gl/es-419/tq', why: 'no se terminó de descargar (no tiene recibo)' },
      { key: 'x/y/z', why: 'no está en el catálogo' },
    ])
  })
})

describe('abrir un paquete de idioma en otro aparato', () => {
  it('deja las filas y el catálogo tal como estaban, con los trozos por capítulo incluidos', async () => {
    const { source, rows } = store()
    const { bytes } = await buildLanguagePack({ source, language: 'es-419', originalKeys: [UGNT] })
    const there = emptyTarget()
    const result = await importLanguagePack({ bytes, target: there.target })
    const packed = rows.filter((r) => ![EN_TN, `${TN}-extra`, 'warm-coverage'].some((s) => r.key.includes(s)))
    expect([...there.rows.keys()].sort()).toEqual(packed.map((r) => r.key).sort())
    expect(there.rows.get(`tn:${TN}:tit`)).toEqual(rows.find((r) => r.key === `tn:${TN}:tit`)!.entry)
    expect([...there.catalog.keys()].sort()).toEqual([TA, TN, TPL, UGNT].sort())
    expect(result.written).toBe(packed.length)
  })

  it('el recibo de cada recurso se escribe al final, para que un paquete cortado no deje nada por completo que no lo está', async () => {
    const { source } = store()
    const { bytes } = await buildLanguagePack({ source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
    const there = emptyTarget()
    await importLanguagePack({ bytes, target: there.target, batch: 2 })
    expect(there.writes.at(-1)).toBe(`resource:${TN}`)
  })

  it('lo que el aparato ya tiene se queda, salvo que se pida reemplazarlo', async () => {
    const { source } = store()
    const { bytes } = await buildLanguagePack({ source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
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
    const { bytes } = await buildLanguagePack({ source, language: 'es-419', resourceKeys: [TN], originalKeys: [] })
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
