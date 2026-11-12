import {
  createClient,
  httpSource,
  indexedDbStore,
  type BlobStore,
  type LanguagePackClient,
  type PackReader,
} from '@bt-synergy/language-pack-client'
import { trustedKeys } from './keys'
import { packsFormat, V3_ORIGIN_STAGING } from './packsFormat'

/** The format 3 database. Door43's databases (`tc-study-cache`, `tc-study-catalog`) are not opened from here. */
export const STORE_NAME_V3 = 'tc-study-packs-v3'

export type ClientDeps = {
  /** Tests inject a `fetch`; the app uses the browser's. */
  fetch?: typeof fetch
  store?: BlobStore
  trustedKeys?: Record<string, Uint8Array>
}

/** A client of format 3 packs against staging. `packsV3` is the one the app uses; this takes its parts for tests. */
export async function createPacksV3(o: ClientDeps = {}): Promise<LanguagePackClient> {
  const store = o.store ?? (await indexedDbStore({ name: STORE_NAME_V3 }))
  const source = httpSource({ base: V3_ORIGIN_STAGING, ...(o.fetch ? { fetch: o.fetch } : {}) })
  // index: none, so the reader builds a memory index on the first search (no full-text search in the app yet).
  return createClient({ store, source, trust: { trustedKeys: o.trustedKeys ?? trustedKeys() } })
}

let client: Promise<LanguagePackClient> | null = null
const readers = new Map<string, Promise<PackReader | null>>()

/**
 * The one format 3 client of this run. Throws when format 3 is off (production), before anything is opened. `o` only
 * matters on the first call (tests).
 */
export function packsV3(o?: ClientDeps): Promise<LanguagePackClient> {
  if (packsFormat() === 2) throw new Error('format 3 is off')
  client ??= createPacksV3(o).catch((e) => {
    client = null // a store that could not open is tried again next time
    throw e
  })
  return client
}

/**
 * The reader of a language, kept until `forgetReadersV3` (a reader is a snapshot of one `open()`). `null` when nothing
 * of the language is active in format 3, so a caller can fall back to Door43.
 */
export function readerV3(lang: string): Promise<PackReader | null> {
  let reader = readers.get(lang)
  if (!reader) {
    reader = packsV3()
      .then(async (c) => ((await c.status(lang)).active ? c.open(lang) : null))
      .catch((e) => {
        readers.delete(lang) // not remembered: the next call tries again
        throw e
      })
    readers.set(lang, reader)
  }
  return reader
}

/** Drops the cached readers; call it after any install or refresh. */
export function forgetReadersV3(): void {
  readers.clear()
}

/** For tests: forgets the client and the readers, as a new run would. */
export function resetPacksV3(): void {
  client = null
  readers.clear()
}
