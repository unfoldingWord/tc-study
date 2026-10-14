/**
 * Making a language pack from an app's cache and catalog, and opening one into another.
 *
 * Zip layout:
 *
 *   manifest.json                          PackManifest
 *   catalog.json                           [{ key, metadata }] for every resource of the pack
 *   rows/{layer}/{resource}.jsonl          one `{"key":…,"entry":…}` per line, raw as the cache keeps it
 *
 * The file names are only for people looking inside; the real key is in each row and in the catalog list.
 */

import JSZip from 'jszip'
import { resourceContentStamp, type ResourceMetadata } from '@bt-synergy/resource-catalog'
import { ORIGINAL_LANGUAGE_KEYS, belongsTo, fileSafe, scansFor } from './keys'
import {
  ALL_LAYERS,
  PACK_FORMAT,
  PACK_FORMAT_VERSION,
  REQUIRED_LAYERS,
  type CacheRow,
  type PackLayer,
  type PackManifest,
  type PackManifestResource,
  type PackResourceRole,
  type PackSource,
  type PackTarget,
} from './types'

const keyOf = (metadata: ResourceMetadata): string =>
  metadata.resourceKey || `${metadata.owner}/${metadata.language}/${metadata.resourceId}`

/** Every row of one resource in the store, by layer. Rows found by two scans are counted once. */
export async function rowsOfResource(source: PackSource, resourceKey: string, layers: readonly PackLayer[]): Promise<Map<PackLayer, CacheRow[]>> {
  const out = new Map<PackLayer, CacheRow[]>()
  const seen = new Set<string>()
  for (const scan of scansFor(resourceKey)) {
    if (!layers.includes(scan.layer)) continue
    for (const row of await source.rowsByPrefix(scan.prefix)) {
      if (seen.has(row.key) || !belongsTo(row.key, resourceKey, scan)) continue
      seen.add(row.key)
      const list = out.get(scan.layer) ?? []
      list.push(row)
      out.set(scan.layer, list)
    }
  }
  return out
}

export type BuildPackParams = {
  source: PackSource
  language: string
  /** The resources to pack; by default every resource of `language` the catalog has, with a receipt in the store. */
  resourceKeys?: string[]
  /** Original-language scriptures to add (by default UGNT and UHB, when the store has them). `[]` adds none. */
  originalKeys?: string[]
  /** Which layers to carry; the receipts and the source of truth always go. */
  layers?: readonly PackLayer[]
  createdBy?: string
  app?: { name: string; version?: string }
  now?: Date
}

/**
 * A language pack as zip bytes, ready to save to a file. A resource of the list that the catalog does not know, or
 * that has no receipt in the store (it was never fully downloaded), is left out and said in `skipped`.
 */
export async function buildLanguagePack(params: BuildPackParams): Promise<{ bytes: Uint8Array; manifest: PackManifest; skipped: Array<{ key: string; why: string }> }> {
  const { source, language } = params
  const layers = [...new Set([...REQUIRED_LAYERS, ...(params.layers ?? ALL_LAYERS)])]
  const catalog = params.resourceKeys ? null : await source.catalogRows()
  const wanted: Array<{ key: string; role: PackResourceRole }> = [
    ...(params.resourceKeys ?? catalog!.filter((m) => m.language === language).map(keyOf)).map((key) => ({ key, role: 'language' as const })),
    ...(params.originalKeys ?? ORIGINAL_LANGUAGE_KEYS).map((key) => ({ key, role: 'original' as const })),
  ]

  const zip = new JSZip()
  const resources: PackManifestResource[] = []
  const catalogOut: Array<{ key: string; metadata: ResourceMetadata }> = []
  const skipped: Array<{ key: string; why: string }> = []
  const packed = new Set<string>()

  for (const { key, role } of wanted) {
    if (packed.has(key)) continue
    const metadata = await source.catalogRow(key)
    if (!metadata) {
      if (role === 'language') skipped.push({ key, why: 'no está en el catálogo' })
      continue
    }
    const byLayer = await rowsOfResource(source, key, layers)
    if (!byLayer.get('receipt')?.length) {
      // An original language the store never had is not news; a resource of the language that is half there is.
      if (role === 'language') skipped.push({ key, why: 'no se terminó de descargar (no tiene recibo)' })
      continue
    }
    packed.add(key)
    catalogOut.push({ key, metadata })
    const rows: Partial<Record<PackLayer, number>> = {}
    for (const [layer, list] of byLayer) {
      rows[layer] = list.length
      zip.file(`rows/${layer}/${fileSafe(key)}.jsonl`, list.map((row) => JSON.stringify(row)).join('\n') + '\n')
    }
    resources.push({ key, role, stamp: resourceContentStamp(metadata), subject: metadata.subject, title: metadata.title, rows })
  }

  const manifest: PackManifest = {
    format: PACK_FORMAT,
    formatVersion: PACK_FORMAT_VERSION,
    language,
    createdAt: (params.now ?? new Date()).toISOString(),
    ...(params.createdBy ? { createdBy: params.createdBy } : {}),
    ...(params.app ? { app: params.app } : {}),
    layers,
    resources,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('catalog.json', JSON.stringify(catalogOut))
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return { bytes, manifest, skipped }
}

/** What a pack says about itself, without opening its rows: to show the person what it brings before importing. */
export async function readPackManifest(bytes: Uint8Array | ArrayBuffer): Promise<PackManifest> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file('manifest.json')
  if (!file) throw new Error('Este archivo no es un paquete de idioma: no tiene manifest.json.')
  const manifest = JSON.parse(await file.async('string')) as PackManifest
  if (manifest.format !== PACK_FORMAT) throw new Error(`Este archivo no es un paquete de idioma (formato «${String(manifest.format)}»).`)
  if (Number(String(manifest.formatVersion).split('.')[0]) > Number(PACK_FORMAT_VERSION.split('.')[0])) {
    throw new Error(`Este paquete es de una versión más nueva (${manifest.formatVersion}). Actualice la app para abrirlo.`)
  }
  return manifest
}

export type ImportPackParams = {
  bytes: Uint8Array | ArrayBuffer
  target: PackTarget
  /** Only these layers (the receipts and the source of truth always come). */
  layers?: readonly PackLayer[]
  /** Replace rows the store already has. Off by default: what the device has stays, and the pack fills the gaps. */
  overwrite?: boolean
  /** Rows written per batch. */
  batch?: number
}

export type ImportPackResult = {
  manifest: PackManifest
  written: number
  keptExisting: number
  byLayer: Partial<Record<PackLayer, number>>
}

/**
 * Opens a pack into an app's store. Catalog rows go first, then receipts last of all for each resource, so a pack cut
 * short never leaves a receipt saying "complete" for a resource whose rows did not all arrive.
 */
export async function importLanguagePack(params: ImportPackParams): Promise<ImportPackResult> {
  const { target } = params
  const manifest = await readPackManifest(params.bytes)
  const zip = await JSZip.loadAsync(params.bytes)
  const layers = new Set<PackLayer>([...REQUIRED_LAYERS, ...(params.layers ?? manifest.layers)])
  const batch = params.batch ?? 200
  const result: ImportPackResult = { manifest, written: 0, keptExisting: 0, byLayer: {} }

  const catalogFile = zip.file('catalog.json')
  if (catalogFile) await target.putCatalogRows(JSON.parse(await catalogFile.async('string')))

  const order: PackLayer[] = ['sot', 'prepared', 'quote', 'align', 'text', 'receipt']
  for (const resource of manifest.resources) {
    for (const layer of order) {
      if (!layers.has(layer) || !resource.rows[layer]) continue
      const file = zip.file(`rows/${layer}/${fileSafe(resource.key)}.jsonl`)
      if (!file) throw new Error(`Al paquete le falta una parte: ${layer} de ${resource.key}.`)
      const rows = (await file.async('string'))
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as CacheRow)
      for (let i = 0; i < rows.length; i += batch) {
        let slice = rows.slice(i, i + batch)
        if (!params.overwrite && target.existingKeys) {
          const have = await target.existingKeys(slice.map((row) => row.key))
          result.keptExisting += slice.filter((row) => have.has(row.key)).length
          slice = slice.filter((row) => !have.has(row.key))
        }
        if (!slice.length) continue
        await target.putRows(slice)
        result.written += slice.length
        result.byLayer[layer] = (result.byLayer[layer] ?? 0) + slice.length
      }
    }
  }
  return result
}
