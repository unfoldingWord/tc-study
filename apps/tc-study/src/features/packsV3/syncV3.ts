import { ClientError, type ClientErrorCode, type LanguagePackClient, type PackReader } from '@bt-synergy/language-pack-client'
import {
  buildIngestReceiptFromCatalog,
  ingestSchemaForResourceType,
  isMatchingIngestReceipt,
  readIngestReceiptMeta,
  resourceContentStamp,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import { PACK_VERSIONS } from '@bt-synergy/resource-pipeline/language/packVersions'
import { catalogRowsV3, ingredientOf, type CatalogEntryRow } from './catalogRowsV3'
import { forgetReadersV3 } from './client'
import { articleRows } from './rows/articleRows'
import { helpsRows } from './rows/helpsRows'
import { obsRows } from './rows/obsRows'
import { origRows, scriptureRows, type Row } from './rows/scriptureRows'

/** The methods of the cache adapter `CatalogContext` creates (`IndexedDBCacheAdapter`) that a sync uses. Rows go in as they are (`putRawMany`). */
export interface CacheAdapter {
  get(key: string): Promise<unknown>
  getByPrefix(prefix: string): Promise<{ key: string; entry: unknown }[]>
  putRawMany(rows: { key: string; entry: unknown }[]): Promise<void>
  deleteMany(keys: string[]): Promise<void>
}
/** The methods of the catalog adapter (`IndexedDBCatalogAdapter`) that a sync uses. */
export interface CatalogAdapter {
  get(key: string): Promise<ResourceMetadata | null>
  set(key: string, metadata: ResourceMetadata): Promise<void>
}

export type SyncProgress = { lang: string; unit: string; done: number; total: number }
export type SyncOutcome =
  | { kind: 'done'; books: string[] }
  | { kind: 'no-pack' }
  | { kind: 'offline' }
  | { kind: 'failed'; code: ClientErrorCode; retryAfter?: number }
export type SyncDeps = {
  client: LanguagePackClient
  cache: CacheAdapter
  catalog: CatalogAdapter
  signal?: AbortSignal
  onProgress?: (p: SyncProgress) => void
}

/** `downloadMethod` of the receipts this sync writes, so a later sync deletes only its own. */
export const FORMAT3_DOWNLOAD_METHOD = 'format3'
/** Bookkeeping: what the rows of a language were written from. Not a Door43 row; nothing else reads it. */
export const syncRecordKey = (lang: string): string => `packs-v3:sync:${lang}`

type SyncRecord = {
  /** Unit id -> the revisions its rows were written from. */
  units: Record<string, string>
  /** Resource key -> the books of it that have rows. */
  resBooks: Record<string, string[]>
  /** Resource key -> the class of unit that carries it (`book`, `orig`, `art:tw`, `art:ta`, `obs`). */
  resClass: Record<string, string>
}

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort()
const unitClass = (id: string): string => (id.startsWith('art:') ? id.split(':').slice(0, 2).join(':') : id.split(':')[0]!)

/** The resource a row of a unit belongs to, from its key. `undefined` for a row that is not one of a resource (`helps-text:`). */
function resOf(key: string): string | undefined {
  if (key.startsWith('helps-text:')) return undefined
  const m = /^(?:scripture-usj|tn|tq|twl|obs):([^:]+)/.exec(key)
  if (m) return m[1]
  return key.split('/').slice(0, 3).join('/') // an article: `{owner}/{lang}/{id}/{entry}`
}

function outcomeOf(e: unknown): SyncOutcome {
  if (!(e instanceof ClientError)) throw e
  if (e.code === 'E_NO_PACK') return { kind: 'no-pack' }
  if (e.code === 'E_NETWORK' && globalThis.navigator?.onLine === false) return { kind: 'offline' }
  return { kind: 'failed', code: e.code, ...(e.retryAfter !== undefined ? { retryAfter: e.retryAfter } : {}) }
}

const entryContent = (entry: unknown): SyncRecord | undefined => (entry as { content?: SyncRecord } | null)?.content

/** Deletes the rows of the book that a new revision makes stale: the unit's own, and every derived row of the book, so the warm worker makes them again. */
async function dropBook(cache: CacheAdapter, book: string, resources: string[]): Promise<void> {
  const ofBook = new RegExp(`:${book}(:|$)`)
  const keys: string[] = []
  for (const prefix of ['prepared:', 'helps-quote:', 'helps-align:']) {
    for (const r of await cache.getByPrefix(prefix)) if (ofBook.test(r.key)) keys.push(r.key)
  }
  for (const res of resources) {
    for (const kind of ['scripture-usj', 'tn', 'tq', 'twl']) {
      for (const r of await cache.getByPrefix(`${kind}:${res}:${book}`)) if (ofBook.test(r.key)) keys.push(r.key)
    }
  }
  if (keys.length > 0) await cache.deleteMany(keys)
}

/** Deletes the rows of whole resources (articles, OBS) that a new revision replaces. */
async function dropResources(cache: CacheAdapter, resources: string[]): Promise<void> {
  const keys: string[] = []
  for (const res of resources) {
    for (const prefix of [`${res}/`, `obs:${res}:`, `tn:${res}:`, `tq:${res}:`, `twl:${res}:`]) {
      for (const r of await cache.getByPrefix(prefix)) keys.push(r.key)
    }
    for (const kind of ['tw-title', 'tw-preview', 'ta-title']) for (const r of await cache.getByPrefix(`helps-text:${kind}:${res}@`)) keys.push(r.key)
  }
  if (keys.length > 0) await cache.deleteMany(keys)
}

/** The row to write for a resource: Door43's own when it holds the same release (its `published_at` is part of the stamp its derived rows carry), else the one of the format. */
function merged(base: CatalogEntryRow, existing: ResourceMetadata | null, books: string[]): ResourceMetadata {
  const sameRelease = existing?.release?.tag_name !== undefined && existing.release.tag_name === base.metadata.release?.tag_name
  const bookSet = (xs: string[] | undefined) => [...(xs ?? [])]
  if (!existing || !sameRelease) {
    const held = sorted([...(base.metadata.contentMetadata?.downloadedIngredients ?? []), ...books])
    return { ...base.metadata, contentMetadata: { ...base.metadata.contentMetadata, ingredients: held.map(ingredientOf), downloadedIngredients: held, books: held } }
  }
  const held = sorted([...bookSet(existing.contentMetadata?.downloadedIngredients), ...books])
  return {
    ...existing,
    availability: { ...existing.availability, offline: true },
    contentMetadata: {
      ...existing.contentMetadata,
      downloadedIngredients: held,
      ingredients: existing.contentMetadata?.ingredients?.length ? existing.contentMetadata.ingredients : held.map(ingredientOf),
    },
  }
}

type Unit = { id: string; sig: string; book?: string; build: () => Promise<Row[]> }

async function syncNow(lang: string, want: { books: string[]; articles?: 'all' }, deps: SyncDeps): Promise<SyncOutcome> {
  const { client, cache, catalog, signal, onProgress } = deps
  const opts = signal ? { signal } : {}
  try {
    await client.refresh(lang, opts)
  } catch (e) {
    return outcomeOf(e)
  }

  const books = sorted(want.books.map((b) => b.toLowerCase()))
  const idOf = (key: string): string => key.slice(key.indexOf('/') + 1)
  let failure: SyncOutcome | undefined
  try {
    const units = want.articles === 'all' ? (await client.status(lang)).units.filter((u) => idOf(u.key).startsWith('art:')).map((u) => u.key) : []
    await client.install(lang, { books, ...(units.length > 0 ? { units } : {}) }, { ...opts, onProgress: (p) => onProgress?.({ lang, unit: p.key, done: p.done, total: p.total }) })
  } catch (e) {
    failure = outcomeOf(e)
    if (failure.kind === 'no-pack') return failure
  }

  // Rows are written only for what the library activated: a unit cut short by a failure has none.
  const reader: PackReader = await client.open(lang)
  const status = await client.status(lang)
  const listed = status.units.map((u) => ({ id: idOf(u.key), installed: u.installed }))
  const recordRow = await cache.get(syncRecordKey(lang))
  const stored = entryContent(recordRow)
  const record: SyncRecord = { units: { ...stored?.units }, resBooks: { ...stored?.resBooks }, resClass: { ...stored?.resClass } }

  // The catalog rows as they will be: the stamp of a resource's helps-text rows is that of its row.
  const base = catalogRowsV3(reader)
  const existing = new Map<string, ResourceMetadata | null>()
  for (const r of base) existing.set(r.key, await catalog.get(r.key))
  const stampOf = (res: string | undefined): string => {
    const row = base.find((r) => r.key === res)
    return resourceContentStamp(row ? merged(row, existing.get(row.key) ?? null, []) : undefined)
  }

  // The library re-activates every unit under a new catalog's revision, changed or not, so the revision says nothing about
  // a unit. What its rows were written from is the content of its segments: a digest of what the reader decoded.
  const sigOf = async (...ids: string[]): Promise<string> => {
    const parts: unknown[] = []
    for (const id of ids) parts.push((await reader.segments(id))?.map((s) => [s.h, s.t]) ?? null)
    const text = JSON.stringify(parts, (_k, v: unknown) => (v instanceof Uint8Array ? `0x${Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('')}` : typeof v === 'bigint' ? `${v}n` : v))
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  const todo: Unit[] = []
  for (const b of books) {
    if (reader.installed(`orig:${b}`)) todo.push({ id: `orig:${b}`, sig: await sigOf(`orig:${b}`), book: b, build: () => origRows(reader, b) })
  }
  for (const b of books) {
    if (reader.installed(`book:${b}`)) {
      todo.push({ id: `book:${b}`, sig: await sigOf(`book:${b}`, `orig:${b}`), book: b, build: async () => [...(await scriptureRows(reader, b)), ...(await helpsRows(reader, b))] })
    }
  }
  for (const u of listed.filter((l) => l.installed && l.id.startsWith('art:') && reader.installed(l.id))) {
    const group = u.id.slice('art:'.length)
    todo.push({
      id: u.id,
      sig: await sigOf(u.id),
      build: async () => articleRows(reader, group, { stamp: stampOf((await reader.articles(group))?.[0]?.res) }),
    })
  }
  if (reader.installed('obs')) todo.push({ id: 'obs', sig: await sigOf('obs'), build: () => obsRows(reader) })

  const written: string[] = []
  const writeRecord = () => cache.putRawMany([{ key: syncRecordKey(lang), entry: { content: record } }])
  let n = 0
  try {
    for (const unit of todo) {
      onProgress?.({ lang, unit: unit.id, done: n++, total: todo.length })
      const before = record.units[unit.id]
      if (before === unit.sig) continue
      const rows = await unit.build()
      const resources = sorted(rows.flatMap((r) => resOf(r.key) ?? []))
      if (before !== undefined) {
        // A new revision: the rows of the unit and what derives from them go before the new rows come.
        if (unit.book !== undefined) await dropBook(cache, unit.book, sorted([...resources, ...Object.keys(record.resBooks).filter((r) => record.resClass[r] === unitClass(unit.id) && record.resBooks[r]!.includes(unit.book!))]))
        else await dropResources(cache, resources)
      }
      await cache.putRawMany(rows.map((r) => ({ key: r.key, entry: r.value })))
      for (const res of resources) {
        record.resClass[res] = unitClass(unit.id)
        if (unit.book !== undefined) record.resBooks[res] = sorted([...(record.resBooks[res] ?? []), unit.book])
      }
      record.units[unit.id] = unit.sig
      written.push(unit.id)
      await writeRecord()
    }
  } finally {
    if (written.length > 0) forgetReadersV3()
  }
  onProgress?.({ lang, unit: 'rows', done: todo.length, total: todo.length })

  // Catalog entries of what has rows, then the receipts of the resources that are whole.
  const rows = new Map<string, ResourceMetadata>()
  for (const r of base) {
    if (record.resClass[r.key] === undefined) continue
    const row = merged(r, existing.get(r.key) ?? null, record.resBooks[r.key] ?? [])
    rows.set(r.key, row)
    if (written.length > 0) await catalog.set(r.key, row)
  }
  const receipts: { key: string; entry: unknown }[] = []
  const staleReceipts: string[] = []
  for (const [res, row] of rows) {
    const carrying = listed.filter((l) => unitClass(l.id) === record.resClass[res])
    const whole = carrying.length > 0 && carrying.every((l) => l.installed && record.units[l.id] !== undefined)
    const key = `resource:${res}`
    const have = await cache.get(key)
    if (!whole) {
      if (readIngestReceiptMeta(have)?.downloadMethod === FORMAT3_DOWNLOAD_METHOD) staleReceipts.push(key)
      continue
    }
    const schema = ingestSchemaForResourceType(row.type, String(PACK_VERSIONS.sot.usjProcessing))
    const stamp = resourceContentStamp(row)
    if (stamp === 'nostamp' || isMatchingIngestReceipt(have, stamp, schema)) continue
    const metadata = buildIngestReceiptFromCatalog(row, { ingestSchema: schema, downloadMethod: FORMAT3_DOWNLOAD_METHOD })
    if (metadata) receipts.push({ key, entry: { content: {}, metadata } })
  }
  if (staleReceipts.length > 0) await cache.deleteMany(staleReceipts)
  if (receipts.length > 0) await cache.putRawMany(receipts)

  return failure ?? { kind: 'done', books: books.filter((b) => reader.installed(`book:${b}`)) }
}

const tails = new Map<string, Promise<void>>()

/**
 * Brings a language's format 3 pack into the rows the panels read (`tc-study-cache`, `tc-study-catalog`). Order: `refresh`;
 * `install` of the books asked for (the library adds their original and what they need); the rows of each activated unit
 * (books with their helps, originals, article groups, OBS) and their catalog entries and receipts. A unit whose revision
 * changed has its rows, and the derived `prepared:`, `helps-quote:` and `helps-align:` rows of its book, deleted before the
 * new ones come. A cut network keeps every row written and says `failed`; the next sync fetches only what is missing.
 * One sync of a language runs at a time: a second call waits for the first.
 */
export function syncLanguageV3(lang: string, want: { books: string[]; articles?: 'all' }, deps: SyncDeps): Promise<SyncOutcome> {
  const run = (tails.get(lang) ?? Promise.resolve()).then(() => syncNow(lang, want, deps))
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  tails.set(lang, tail)
  void tail.then(() => {
    if (tails.get(lang) === tail) tails.delete(lang)
  })
  return run
}
