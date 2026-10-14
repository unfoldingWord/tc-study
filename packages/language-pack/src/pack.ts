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
import {
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  isMatchingIngestReceipt,
  resourceContentStamp,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import { ORIGINAL_LANGUAGE_KEYS, belongsTo, bookOfRow, fileSafe, isBookScoped, originalOfDerivedRow, scansFor } from './keys'
import {
  ALL_LAYERS,
  PACK_FORMAT,
  PACK_FORMAT_VERSION,
  REQUIRED_LAYERS,
  type CacheRow,
  type PackLayer,
  type PackKind,
  type PackManifest,
  type PackManifestResource,
  type PackRequirement,
  type PackResourceRole,
  type PackSource,
  type PackTarget,
  type PackVersions,
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
  /**
   * Original-language scriptures to add. By default none, except in an `originals` pack, which takes UGNT and UHB
   * when the store has them: they go apart because they are the same for every language.
   */
  originalKeys?: string[]
  /** What the pack holds (see `PackKind`). Default `language`. */
  kind?: PackKind
  /** `book` packs: the books to bring (any case). */
  books?: string[]
  /** DEFLATE level, 1–9. Default 9: a pack is made once and copied many times. */
  compressionLevel?: number
  /** Which layers to carry; the receipts and the source of truth always go. */
  layers?: readonly PackLayer[]
  createdBy?: string
  app?: { name: string; version?: string }
  /** The app's processing versions, by layer; `sot.usjProcessing` is also what scripture receipts are checked with. */
  versions?: PackVersions
  now?: Date
}

/**
 * Whether the store has a receipt saying the resource is complete for the release its catalog row names: stamped,
 * `downloadComplete: true`, and the ingest schema of this app. A receipt left by a failed download, or by a release
 * the catalog no longer names, does not count: the device that opens the pack would try to download it again.
 */
function completeReceipt(receipt: CacheRow | undefined, metadata: ResourceMetadata, versions: PackVersions | undefined): boolean {
  if (!receipt) return false
  const usj = versions?.sot?.usjProcessing
  const schema = ingestSchemaForResourceType(String((metadata as { type?: string }).type ?? ''), usj === undefined ? undefined : String(usj))
  return isMatchingIngestReceipt(receipt.entry, expectedIngestReleaseStamp(metadata), schema)
}

/**
 * A language pack as zip bytes, ready to save to a file. A resource of the list that the catalog does not know, or
 * that has no receipt in the store (it was never fully downloaded), is left out and said in `skipped`.
 */
export async function buildLanguagePack(params: BuildPackParams): Promise<{ bytes: Uint8Array; manifest: PackManifest; skipped: Array<{ key: string; why: string }> }> {
  const { source, language } = params
  const kind: PackKind = params.kind ?? 'language'
  const books = kind === 'book' ? new Set((params.books ?? []).map((b) => b.toLowerCase())) : null
  if (books && books.size === 0) throw new Error('Un paquete de libro necesita al menos un libro.')
  const layers = [...new Set([...REQUIRED_LAYERS, ...(params.layers ?? ALL_LAYERS)])]
  const catalog = params.resourceKeys || kind === 'originals' ? null : await source.catalogRows()
  const languageKeys = kind === 'originals' ? [] : (params.resourceKeys ?? catalog!.filter((m) => m.language === language).map(keyOf))
  const wanted: Array<{ key: string; role: PackResourceRole }> = [
    ...languageKeys.map((key) => ({ key, role: 'language' as const })),
    ...(params.originalKeys ?? (kind === 'originals' ? ORIGINAL_LANGUAGE_KEYS : [])).map((key) => ({ key, role: 'original' as const })),
  ]

  const zip = new JSZip()
  const resources: PackManifestResource[] = []
  const catalogOut: Array<{ key: string; metadata: ResourceMetadata }> = []
  const skipped: Array<{ key: string; why: string }> = []
  const packed = new Set<string>()
  const requires = new Map<string, PackRequirement>()

  for (const { key, role } of wanted) {
    if (packed.has(key)) continue
    const metadata = await source.catalogRow(key)
    if (!metadata) {
      if (role === 'language') skipped.push({ key, why: 'no está en el catálogo' })
      continue
    }
    // Originals in an `originals` pack always go whole; a book pack carries only the book-scoped resources.
    const bookScoped = role === 'language' && isBookScoped(metadata as { type?: unknown; subject?: unknown })
    if (kind === 'book' && !bookScoped) continue
    const byLayer = await rowsOfResource(source, key, layers)
    if (!completeReceipt(byLayer.get('receipt')?.[0], metadata, params.versions)) {
      // An original language the store never had is not news; a resource of the language that is half there is.
      if (role === 'language' || byLayer.get('receipt')?.length) {
        skipped.push({ key, why: byLayer.get('receipt')?.length ? 'su descarga no terminó, o es de otra versión' : 'no se terminó de descargar (no tiene recibo)' })
      }
      continue
    }
    const storeBooks = bookScoped
      ? [...new Set((byLayer.get('sot') ?? []).map((row) => bookOfRow(row.key, 'sot', key)).filter((b): b is string => Boolean(b)))].sort()
      : undefined

    // What of the resource goes in this pack.
    let carried = byLayer
    if (kind === 'book') {
      carried = new Map()
      for (const [layer, list] of byLayer) {
        if (layer === 'receipt' || layer === 'text') continue
        const kept = list.filter((row) => books!.has(bookOfRow(row.key, layer, key) ?? ''))
        if (kept.length) carried.set(layer, kept)
      }
      if (!carried.get('sot')?.length) {
        skipped.push({ key, why: `no tiene ${[...books!].join(', ')}` })
        continue
      }
    } else if (kind === 'base' && bookScoped) {
      carried = new Map()
    }

    packed.add(key)
    catalogOut.push({ key, metadata })
    const rows: Partial<Record<PackLayer, number>> = {}
    for (const [layer, list] of carried) {
      rows[layer] = list.length
      zip.file(`rows/${layer}/${fileSafe(key)}.jsonl`, list.map((row) => JSON.stringify(row)).join('\n') + '\n')
      if (layer !== 'quote' && layer !== 'align') continue
      for (const row of list) {
        const original = originalOfDerivedRow(row.key)
        if (original) requires.set(`${original.key}@${original.stamp}`, original)
      }
    }
    resources.push({
      key,
      role,
      stamp: resourceContentStamp(metadata),
      subject: metadata.subject,
      title: metadata.title,
      rows,
      ...(storeBooks ? { books: storeBooks } : {}),
    })
  }

  const manifest: PackManifest = {
    format: PACK_FORMAT,
    formatVersion: PACK_FORMAT_VERSION,
    language,
    kind,
    ...(books ? { books: [...books].sort() } : {}),
    ...(requires.size ? { requires: [...requires.values()].sort((a, b) => a.key.localeCompare(b.key)) } : {}),
    createdAt: (params.now ?? new Date()).toISOString(),
    ...(params.createdBy ? { createdBy: params.createdBy } : {}),
    ...(params.app ? { app: params.app } : {}),
    layers,
    ...(params.versions ? { versions: params.versions } : {}),
    resources,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('catalog.json', JSON.stringify(catalogOut))
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: params.compressionLevel ?? 9 },
  })
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
  /** This app's processing versions, by layer, to compare with the pack's (see `PackManifest.versions`). */
  versions?: PackVersions
}

export type ImportPackResult = {
  manifest: PackManifest
  written: number
  keptExisting: number
  byLayer: Partial<Record<PackLayer, number>>
  /**
   * Layers left out: built with another processing version than this app's, or (quotes and aligned quotes) against
   * another release of an original than the device has. They are rebuilt from the source.
   */
  skippedLayers: PackLayer[]
  /**
   * The originals the pack's quotes need, and whether the device has them: `present` (same release), `in-pack`,
   * `missing` (the rows are kept and will match once that originals pack is opened), or `other-release`.
   */
  originals: Array<PackRequirement & { status: 'present' | 'in-pack' | 'missing' | 'other-release' }>
  /** Resources the device already had in another release, left as they were (without `overwrite`). */
  skippedResources: Array<{ key: string; why: string }>
}

/** The layers whose versions differ between the pack and this app. */
function differingLayers(pack: PackVersions | undefined, mine: PackVersions | undefined): PackLayer[] {
  if (!pack || !mine) return []
  const out: PackLayer[] = []
  for (const layer of Object.keys(mine) as PackLayer[]) {
    const a = pack[layer]
    const b = mine[layer]
    if (!a || !b) continue
    if (Object.keys(b).some((name) => name in a && String(a[name]) !== String(b[name]))) out.push(layer)
  }
  return out
}

/**
 * Opens a pack into an app's store. Catalog rows go first, then receipts last of all for each resource, so a pack cut
 * short never leaves a receipt saying "complete" for a resource whose rows did not all arrive.
 */
export async function importLanguagePack(params: ImportPackParams): Promise<ImportPackResult> {
  const { target } = params
  const manifest = await readPackManifest(params.bytes)
  const zip = await JSZip.loadAsync(params.bytes)
  const differ = differingLayers(manifest.versions, params.versions)
  if (differ.some((layer) => REQUIRED_LAYERS.includes(layer))) {
    throw new Error('Este paquete se hizo con otra versión del procesamiento de los textos. Esta app lo descartaría: hace falta un paquete hecho con la misma versión de la app.')
  }
  const layers = new Set<PackLayer>([...REQUIRED_LAYERS, ...(params.layers ?? manifest.layers)])
  for (const layer of differ) layers.delete(layer)
  const batch = params.batch ?? 200
  const result: ImportPackResult = { manifest, written: 0, keptExisting: 0, byLayer: {}, skippedLayers: [...differ], skippedResources: [], originals: [] }

  const catalogFile = zip.file('catalog.json')
  const catalog = catalogFile ? (JSON.parse(await catalogFile.async('string')) as Array<{ key: string; metadata: ResourceMetadata }>) : []

  // Quotes and aligned quotes name the original release they were built against. With another release on the device
  // they would never be read: leave them out. Without the original yet, keep them: they match once it arrives.
  for (const required of manifest.requires ?? []) {
    const inPack = catalog.find((row) => row.key === required.key)
    const mine = inPack ? null : target.catalogRow ? await target.catalogRow(required.key) : null
    const status = inPack && resourceContentStamp(inPack.metadata) === required.stamp
      ? 'in-pack'
      : !mine
        ? 'missing'
        : resourceContentStamp(mine) === required.stamp
          ? 'present'
          : 'other-release'
    result.originals.push({ ...required, status })
    if (status !== 'other-release') continue
    for (const layer of ['quote', 'align'] as const) {
      if (!layers.delete(layer)) continue
      if (!result.skippedLayers.includes(layer)) result.skippedLayers.push(layer)
    }
  }

  // Each resource comes whole or not at all: its catalog row, its rows and its receipt belong to one release. When
  // the device has the same release, the pack fills the gaps; with another one, the pack replaces it only on request.
  const replace = new Set<string>()
  const skip = new Set<string>()
  for (const row of catalog) {
    const mine = target.catalogRow ? await target.catalogRow(row.key) : null
    if (!mine) continue
    if (resourceContentStamp(mine) === resourceContentStamp(row.metadata)) continue
    if (params.overwrite) replace.add(row.key)
    else {
      skip.add(row.key)
      result.skippedResources.push({ key: row.key, why: `el aparato tiene otra versión (${resourceContentStamp(mine)})` })
    }
  }
  await target.putCatalogRows(catalog.filter((row) => !skip.has(row.key)))

  const order: PackLayer[] = ['sot', 'prepared', 'quote', 'align', 'text', 'receipt']
  for (const resource of manifest.resources) {
    if (skip.has(resource.key)) continue
    const overwrite = params.overwrite || replace.has(resource.key)
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
        if (!overwrite && target.existingKeys) {
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
