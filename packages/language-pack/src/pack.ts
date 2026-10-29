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
  bookContentStamp,
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  isMatchingIngestReceipt,
  resourceContentStamp,
  type BookStampSource,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import { ORIGINAL_LANGUAGE_KEYS, belongsTo, bookOfRow, fileSafe, isBookScoped, originalOfDerivedRow, scansFor } from './keys'
import { chunksOf, linesFrom } from './lines'
import { SHARED_UNIT, bookUnit } from './parts/partsList'
import { REGISTER_PREFIX, resourceOfSlotId, unitOfSlotId } from './parts/register'
import {
  ALL_LAYERS,
  OPTIONAL_LAYERS,
  PACK_FORMAT,
  PACK_FORMAT_VERSION,
  REQUIRED_LAYERS,
  readsLayer,
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
      // Row keys stamp the original per book (a blob stamp, mostly), so `requires` names the release of each original
      // this store has, once per original; the import checks each row against its own book.
      for (const row of list) {
        const original = originalOfDerivedRow(row.key)
        if (!original || requires.has(original.key)) continue
        const originalMeta = await source.catalogRow(original.key)
        requires.set(original.key, { key: original.key, stamp: originalMeta ? resourceContentStamp(originalMeta) : original.stamp })
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

/**
 * A pack's catalog list and every row it carries, without opening it into a store: for checks that compare a pack
 * with something else. Each layer is read a line at a time from the zip's stream.
 */
export async function readPack(bytes: Uint8Array | ArrayBuffer): Promise<{
  manifest: PackManifest
  catalog: Array<{ key: string; metadata: ResourceMetadata }>
  rows(): AsyncGenerator<{ resource: string; layer: PackLayer; row: CacheRow }>
}> {
  const manifest = await readPackManifest(bytes)
  const zip = await JSZip.loadAsync(bytes)
  const catalogFile = zip.file('catalog.json')
  const catalog = catalogFile ? (JSON.parse(await catalogFile.async('string')) as Array<{ key: string; metadata: ResourceMetadata }>) : []
  async function* rows() {
    for (const resource of manifest.resources) {
      for (const layer of Object.keys(resource.rows) as PackLayer[]) {
        if (!resource.rows[layer]) continue
        const file = zip.file(`rows/${layer}/${fileSafe(resource.key)}.jsonl`)
        if (!file) throw new Error(`The pack lacks ${layer} of ${resource.key}`)
        for await (const line of linesFrom(chunksOf(file))) yield { resource: resource.key, layer, row: JSON.parse(line) as CacheRow }
      }
    }
  }
  return { manifest, catalog, rows }
}

export type ImportPackParams = {
  bytes: Uint8Array | ArrayBuffer
  target: PackTarget
  /** Only these layers (the receipts and the source of truth always come). */
  layers?: readonly PackLayer[]
  /**
   * Replace rows the store already has. Off by default: what the device has stays, and the pack fills the gaps. A list
   * of resource keys replaces only those (an app that opens a newer release of one resource and keeps the rest).
   */
  overwrite?: boolean | readonly string[]
  /** Rows written per batch. */
  batch?: number
  /**
   * This app's processing versions, by layer, to compare with the pack's (see `PackManifest.versions`). An optional
   * layer (`OPTIONAL_LAYERS`) comes only when they state it with the pack's values (`readsLayer`).
   */
  versions?: PackVersions
  /** When the pack is opened; rows with a cache lifetime start it again from here. */
  now?: Date
  /** Told after every batch: the rows gone through (written or kept) of all the pack's rows to open. */
  onProgress?: (done: number, total: number) => void
}

/**
 * Quote and align rows carry `expiresAt` (a 30-day bound on cache growth, not a statement about their content: their
 * keys hold the releases they were built from). A pack can travel for months before it is opened, and the IndexedDB
 * adapter deletes a row past `expiresAt` when it reads it, so each lifetime starts again when the pack is opened.
 */
function restartLifetime(row: CacheRow, now: number): CacheRow {
  const entry = row.entry as { expiresAt?: unknown; timestamp?: unknown } | null
  if (!entry || typeof entry !== 'object' || typeof entry.expiresAt !== 'string' || typeof entry.timestamp !== 'number') return row
  const lifetime = Date.parse(entry.expiresAt) - entry.timestamp
  if (!Number.isFinite(lifetime) || lifetime <= 0) return row
  return { key: row.key, entry: { ...entry, timestamp: now, expiresAt: new Date(now + lifetime).toISOString() } }
}

export type ImportPackResult = {
  manifest: PackManifest
  written: number
  keptExisting: number
  byLayer: Partial<Record<PackLayer, number>>
  /**
   * Layers left out: built with another processing version than this app's, and rebuilt from the source; then each
   * optional layer the pack has rows of that this app does not read (`readsLayer`).
   */
  skippedLayers: PackLayer[]
  /**
   * The originals the pack's quotes need, and whether the device has them: `present` (same release), `in-pack`,
   * `missing` (the rows are kept and will match once that originals pack is opened), or `other-release`. Another
   * release drops only the rows of the books whose file changed (`droppedRows`).
   */
  originals: Array<PackRequirement & { status: 'present' | 'in-pack' | 'missing' | 'other-release' }>
  /** Resources the device already had in another release, left as they were (without `overwrite`). */
  skippedResources: Array<{ key: string; why: string }>
  /**
   * Quote and aligned-quote rows left out, by resource and layer: built against an original's book that differs from
   * the device's (another blob, or another release when no blob was recorded). The app rebuilds them.
   */
  droppedRows: Record<string, Partial<Record<PackLayer, number>>>
}

/** The layers whose versions differ between the pack and this app. Optional layers go by `readsLayer` instead. */
function differingLayers(pack: PackVersions | undefined, mine: PackVersions | undefined): PackLayer[] {
  if (!pack || !mine) return []
  const out: PackLayer[] = []
  for (const layer of Object.keys(mine) as PackLayer[]) {
    if (OPTIONAL_LAYERS.includes(layer)) continue
    const a = pack[layer]
    const b = mine[layer]
    if (!a || !b) continue
    if (Object.keys(b).some((name) => name in a && String(a[name]) !== String(b[name]))) out.push(layer)
  }
  return out
}

/** Whether `overwrite` asks to replace what the store has of a resource. */
const replacing = (overwrite: ImportPackParams['overwrite'], key: string): boolean =>
  Array.isArray(overwrite) ? overwrite.includes(key) : overwrite === true

/**
 * Gives up the parts slots (`parts-slot:` register rows) of a resource that a pack is about to overwrite, in the units
 * it writes: the books given (all of them when null) and the shared unit. Left in place, the register would go on
 * saying those slots hold the parts' release over the pack's rows, and the next `applyParts` would stamp the pack's
 * rows with that release and call them complete. Without the slots, the next plan downloads them again, and their
 * first-time cleanup replaces the pack's rows. A target without `transactRaw` cannot apply parts, so it has no register.
 */
async function forgetSlots(target: PackTarget, resourceKey: string, books: string[] | null): Promise<void> {
  if (!target.transactRaw) return
  const units = books ? new Set([SHARED_UNIT, ...books.map((book) => bookUnit(book.toLowerCase()))]) : null
  await target.transactRaw({ keys: [], prefixes: [REGISTER_PREFIX] }, (found) => ({
    puts: [],
    deletes: (found.prefixKeys.get(REGISTER_PREFIX) ?? []).filter((key) => {
      const id = key.slice(REGISTER_PREFIX.length)
      return resourceOfSlotId(id) === resourceKey && (!units || units.has(unitOfSlotId(id)))
    }),
  }))
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
  // Every pack names its optional layers, rows or not: one is said to be skipped only when the pack has rows of it.
  const unread = OPTIONAL_LAYERS.filter((layer) => layers.has(layer) && !readsLayer(layer, params.versions, manifest.versions))
  for (const layer of unread) layers.delete(layer)
  const batch = params.batch ?? 200
  const result: ImportPackResult = {
    manifest,
    written: 0,
    keptExisting: 0,
    byLayer: {},
    skippedLayers: [...differ, ...unread.filter((layer) => manifest.resources.some((resource) => resource.rows[layer]))],
    skippedResources: [],
    originals: [],
    droppedRows: {},
  }

  const catalogFile = zip.file('catalog.json')
  const catalog = catalogFile ? (JSON.parse(await catalogFile.async('string')) as Array<{ key: string; metadata: ResourceMetadata }>) : []

  // Each resource comes whole or not at all: its catalog row, its rows and its receipt belong to one release. When
  // the device has the same release, the pack fills the gaps; with another one, the pack replaces it only on request.
  const replace = new Set<string>()
  const skip = new Set<string>()
  for (const row of catalog) {
    const mine = target.catalogRow ? await target.catalogRow(row.key) : null
    if (!mine) continue
    if (resourceContentStamp(mine) === resourceContentStamp(row.metadata)) continue
    if (replacing(params.overwrite, row.key)) replace.add(row.key)
    else {
      skip.add(row.key)
      result.skippedResources.push({ key: row.key, why: `el aparato tiene otra versión (${resourceContentStamp(mine)})` })
    }
  }
  await target.putCatalogRows(catalog.filter((row) => !skip.has(row.key)))

  // The original each quote row will be read against here: the pack's copy when the device takes it, else the
  // device's own; null while neither has it.
  const originalsHere = new Map<string, Promise<ResourceMetadata | null>>()
  const originalHere = (key: string): Promise<ResourceMetadata | null> => {
    let found = originalsHere.get(key)
    if (!found) {
      const inPack = catalog.find((row) => row.key === key && !skip.has(row.key))
      found = inPack ? Promise.resolve(inPack.metadata) : target.catalogRow ? target.catalogRow(key) : Promise.resolve(null)
      originalsHere.set(key, found)
    }
    return found
  }

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
  }

  // Quotes and aligned quotes name the original's book they were built against (its blob stamp, or its release
  // stamp). A row whose book differs here would never be read: leave it out, alone; the rest of its layer comes. Without
  // the original yet, keep it: it matches once the original arrives. The stamp's `+{usj}` part is the `sot` version,
  // whose mismatch refuses the whole pack above, so the book stamp alone is compared (olBookStamp lives in
  // resource-pipeline, which imports this package).
  const builtOnOriginalHere = async (row: CacheRow): Promise<boolean> => {
    const original = originalOfDerivedRow(row.key)
    if (!original) return true
    const meta = await originalHere(original.key)
    return !meta || bookContentStamp(meta as BookStampSource, original.book) === original.stamp
  }

  const order: PackLayer[] = ['sot', 'prepared', 'quote', 'align', 'text', 'index', 'receipt']
  const total = manifest.resources
    .filter((resource) => !skip.has(resource.key))
    .reduce((n, resource) => n + order.filter((layer) => layers.has(layer)).reduce((m, layer) => m + (resource.rows[layer] ?? 0), 0), 0)
  let done = 0
  params.onProgress?.(0, total)
  for (const resource of manifest.resources) {
    if (skip.has(resource.key)) continue
    const overwrite = replacing(params.overwrite, resource.key) || replace.has(resource.key)
    // Before any of its rows: a pack cut short then leaves the slots to plan again, never claimed over the pack's rows.
    if (overwrite && order.some((layer) => layers.has(layer) && resource.rows[layer])) {
      await forgetSlots(target, resource.key, manifest.kind === 'book' ? (manifest.books ?? []) : null)
    }
    for (const layer of order) {
      if (!layers.has(layer) || !resource.rows[layer]) continue
      const file = zip.file(`rows/${layer}/${fileSafe(resource.key)}.jsonl`)
      if (!file) throw new Error(`Al paquete le falta una parte: ${layer} de ${resource.key}.`)
      const opened = (params.now ?? new Date()).getTime()
      // A batch at a time, from the zip's stream: the layer is never held whole in memory.
      const flush = async (rows: CacheRow[]) => {
        let slice = rows
        done += slice.length
        if (layer === 'quote' || layer === 'align') {
          const kept: CacheRow[] = []
          for (const row of slice) if (await builtOnOriginalHere(row)) kept.push(row)
          if (kept.length < slice.length) {
            const dropped = (result.droppedRows[resource.key] ??= {})
            dropped[layer] = (dropped[layer] ?? 0) + slice.length - kept.length
          }
          slice = kept
        }
        if (!overwrite && target.existingKeys) {
          const have = await target.existingKeys(slice.map((row) => row.key))
          result.keptExisting += slice.filter((row) => have.has(row.key)).length
          slice = slice.filter((row) => !have.has(row.key))
        }
        if (slice.length) {
          await target.putRows(slice)
          result.written += slice.length
          result.byLayer[layer] = (result.byLayer[layer] ?? 0) + slice.length
        }
        params.onProgress?.(Math.min(done, total), total)
      }
      let pending: CacheRow[] = []
      for await (const line of linesFrom(chunksOf(file))) {
        pending.push(restartLifetime(JSON.parse(line) as CacheRow, opened))
        if (pending.length < batch) continue
        await flush(pending)
        pending = []
      }
      if (pending.length) await flush(pending)
    }
  }
  return result
}
