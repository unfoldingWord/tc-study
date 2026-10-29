/**
 * Opens language packs (`@bt-synergy/language-pack`) into this app's own stores, so a language reads with no internet.
 *
 * The stores are the ones the app reads with (`tc-study-cache`, `tc-study-catalog`): neither keeps rows in memory, so
 * what a pack writes is read at once, with no reload. Originals go first, so the quotes of the other packs find them.
 */

import {
  importLanguagePack,
  packTargetFrom,
  readPackManifest,
  type CatalogStore,
  type ImportPackResult,
  type PackKind,
  type PackManifest,
  type RawCacheStore,
} from '@bt-synergy/language-pack'
import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { PACK_VERSIONS } from '@bt-synergy/resource-pipeline/language/packVersions'

export type PackFile = { name: string; bytes: Uint8Array | ArrayBuffer }

/** The receipt rows (`resource:{key}`) a pack may need to replace. */
export interface ReceiptStore {
  get(key: string): Promise<unknown>
  delete(key: string): Promise<void>
}

export type PackStores = { cache: RawCacheStore & ReceiptStore; catalog: CatalogStore }

/**
 * - `not-a-pack`: no pack manifest could be read (not a zip, not a pack, or a pack format newer than this app).
 * - `other-version`: made with another source-text processing; this app would throw its rows away.
 * - `no-space`: the device ran out of storage while writing it.
 * - `damaged`: the pack broke while it was being written; resources it finished have receipts, the rest do not.
 */
export type PackRefusal = 'not-a-pack' | 'other-version' | 'no-space' | 'damaged'

export type OpenedPack =
  | { name: string; kind: PackKind; result: ImportPackResult; ms: number }
  | { name: string; refused: PackRefusal; detail: string }

export type PackProgress = { name: string; index: number; count: number; done: number; total: number }

export type OpenPacksOptions = {
  onProgress?: (progress: PackProgress) => void
  /** Replace what the device already has. Off: the device keeps its rows and the pack fills the gaps. */
  overwrite?: boolean
}

const OPEN_ORDER: Record<PackKind, number> = { originals: 0, language: 1, base: 2, book: 3 }

const kindOf = (manifest: PackManifest): PackKind => manifest.kind ?? 'language'

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Same rule as the importer: a field both sides state, with another value. */
function otherSourceVersion(manifest: PackManifest): boolean {
  const theirs = manifest.versions?.sot
  if (!theirs) return false
  return Object.entries(PACK_VERSIONS.sot).some(([name, mine]) => name in theirs && String(theirs[name]) !== String(mine))
}

function isCompleteReceipt(entry: unknown): boolean {
  return (entry as { metadata?: { downloadComplete?: unknown } } | null)?.metadata?.downloadComplete === true
}

/**
 * A failed or cut-short download leaves a receipt that is not complete. The importer keeps rows the device has, so
 * that marker would keep the pack's receipt out and the resource would stay incomplete with all its rows here.
 */
async function dropUnfinishedReceipts(stores: PackStores, manifest: PackManifest): Promise<void> {
  for (const resource of manifest.resources) {
    if (!resource.rows.receipt) continue
    const mine = await stores.catalog.get(resource.key)
    if (mine && resourceContentStamp(mine) !== resource.stamp) continue
    const key = `resource:${resource.key}`
    const entry = await stores.cache.get(key)
    if (entry && !isCompleteReceipt(entry)) await stores.cache.delete(key)
  }
}

async function bytesOf(file: File | PackFile): Promise<PackFile> {
  if (!('arrayBuffer' in file)) return file
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
}

/** Opens each pack in turn; the result lists the opened packs in the order they were opened, then the refused ones. */
export async function openLanguagePacks(
  stores: PackStores,
  files: ReadonlyArray<File | PackFile>,
  options: OpenPacksOptions = {}
): Promise<OpenedPack[]> {
  const unreadable: OpenedPack[] = []
  const readable: Array<PackFile & { manifest: PackManifest }> = []
  for (const file of files) {
    const pack = await bytesOf(file)
    try {
      readable.push({ ...pack, manifest: await readPackManifest(pack.bytes) })
    } catch (error) {
      unreadable.push({ name: pack.name, refused: 'not-a-pack', detail: messageOf(error) })
    }
  }
  readable.sort((a, b) => OPEN_ORDER[kindOf(a.manifest)] - OPEN_ORDER[kindOf(b.manifest)])

  const target = packTargetFrom(stores)
  const opened: OpenedPack[] = []
  for (const [index, { name, bytes, manifest }] of readable.entries()) {
    if (otherSourceVersion(manifest)) {
      opened.push({
        name,
        refused: 'other-version',
        detail: `sot ${JSON.stringify(manifest.versions?.sot)} / ${JSON.stringify(PACK_VERSIONS.sot)}`,
      })
      continue
    }
    const started = Date.now()
    try {
      await dropUnfinishedReceipts(stores, manifest)
      const result = await importLanguagePack({
        bytes,
        target,
        versions: PACK_VERSIONS,
        overwrite: options.overwrite ?? false,
        onProgress: (done, total) => options.onProgress?.({ name, index, count: readable.length, done, total }),
      })
      opened.push({ name, kind: kindOf(manifest), result, ms: Date.now() - started })
    } catch (error) {
      const noSpace = (error as { name?: unknown } | null)?.name === 'QuotaExceededError'
      opened.push({ name, refused: noSpace ? 'no-space' : 'damaged', detail: messageOf(error) })
    }
  }
  return [...opened, ...unreadable]
}
