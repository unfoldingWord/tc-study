/**
 * Prepare a language with tc-study's own pipeline and pack it: what `cli/prepare-language.ts` does, as a function a
 * publisher can call (and a test replace). The caller supplies an IndexedDB (fake-indexeddb in Node) and checks that
 * the packages it reads are freshly built; this never exits the process.
 *
 * Writes in `outDir` the same files the command does (see the header of cli/prepare-language.ts) and returns the bytes
 * of the language pack and of the originals pack, so they can go on without reading the files again.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { buildLanguagePack, ORIGINAL_LANGUAGE_KEYS, packSourceFrom, type PackManifest } from '@bt-synergy/language-pack'
import { addLexicons, addMacula, lexiconOwnerOf, MACULA_KEYS } from '../../cli/companions'
import { isObs, keyOfRow, literalTextOf } from './door43Stamps'
import { closeAndDelete } from './fakeDatabases'
import { addOriginalsIndex } from './originalsIndex'
import { PACK_VERSIONS } from './packVersions'
import { prepareLanguage, type DiscoverInto, type PrepareLanguageProgress } from './prepareLanguage'

// tc-study's own database names, so the rows are keyed as the app keys them.
const CACHE_DB = 'tc-study-cache'
const CATALOG_DB = 'tc-study-catalog'

function builtNow(): { version: string; publishedAt: string } {
  const now = new Date().toISOString()
  return { version: now.slice(0, 10), publishedAt: now }
}

type PackResult = { file: string; bytes: Uint8Array; manifest: PackManifest; skipped: Array<{ key: string; why: string }> }

export type PreparedPacks = {
  language: PackResult
  originals?: PackResult
  /** What `{lang}.report.json` holds: what was found, built, blocked and packed. */
  report: unknown
}

export async function prepareAndPack(o: {
  language: string
  outDir: string
  originals: boolean
  /** `all` (every book the language has) or the books to pack one by one; none leaves the per-book packs out. */
  books?: 'all' | string[]
  /** A folder with Taller's `trees/` and `referents/`: MACULA goes in the originals pack. */
  macula?: string
  /**
   * MACULA's stamp in the packs (for a publisher: its commit and the commit's date); the build date when absent, which
   * makes every rebuild's originals look newer to the apps that hold them.
   */
  maculaStamp?: { version: string; publishedAt: string }
  /** The lexicons are read from this ref of their Door43 repositories; `false` leaves them out. */
  lexicons: false | { ref: string }
  /** `false` leaves Open Bible Stories and their helps out (an app that translates only the Bible). */
  obs: boolean
  log?: (line: string) => void
  /** Test hooks: a fake Door43, its catalog, the lexicons' HTTP and the databases' names. The command uses none. */
  door43Client?: unknown
  discover?: DiscoverInto
  fetch?: (url: string) => Promise<Response>
  databases?: { cache: string; catalog: string }
}): Promise<PreparedPacks> {
  const language = o.language
  const outDir = resolve(o.outDir)
  const say = o.log ?? (() => {})

  const dbNames = o.databases ?? { cache: CACHE_DB, catalog: CATALOG_DB }
  const cacheAdapter = new IndexedDBCacheAdapter({ dbName: dbNames.cache, storeName: 'cache-entries', version: 1 })
  const catalogAdapter = new IndexedDBCatalogAdapter({ dbName: dbNames.catalog, storeName: 'catalog-entries', version: 1 })
  const door43Client = o.door43Client ?? getDoor43ApiClient({ baseUrl: 'https://git.door43.org', debug: false })

  const started = Date.now()
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`
  let lastJobsLine = 0

  function report(progress: PrepareLanguageProgress) {
    if (progress.phase === 'discover') {
      say(`[${elapsed()}] Buscando los recursos de ${language} en Door43…`)
    } else if (progress.phase === 'download') {
      const { message } = progress
      if (message.type === 'queue-updated') {
        const p = message.payload as { totalResources: number; totalIngredients: number }
        say(`[${elapsed()}] Descargando ${p.totalResources} recursos (${p.totalIngredients} partes)…`)
      } else if (message.type === 'resource-complete') {
        say(`[${elapsed()}]   completo: ${(message.payload as { resourceKey: string }).resourceKey}`)
      }
    } else if (progress.phase === 'build') {
      const p = progress.progress
      if (p.phase === 'plan') say(`[${elapsed()}] ${progress.language}: ${p.jobs} trabajos por construir`)
      if (p.phase === 'jobs' && (p.done === p.total || Date.now() - lastJobsLine > 15000)) {
        lastJobsLine = Date.now()
        say(`[${elapsed()}] ${progress.language}: ${p.done}/${p.total} trabajos`)
      }
      if (p.phase === 'titles') say(`[${elapsed()}] ${progress.language}: títulos de ${p.resourceKey}`)
    }
  }

  const preparation = await prepareLanguage({
    language,
    cacheAdapter: cacheAdapter as never,
    catalogAdapter: catalogAdapter as never,
    door43Client: door43Client as never,
    includeOriginals: o.originals,
    onProgress: report,
    ...(o.discover ? { discover: o.discover } : {}),
  })

  const source = packSourceFrom({ cache: cacheAdapter as never, catalog: catalogAdapter as never })

  // The resources beside tc-study's (cli/companions.ts), into the same store before packing.
  const companions: Record<string, unknown> = {}
  const languageRows = (await source.catalogRows()).filter((m) => m.language === language)
  const literal = literalTextOf(languageRows, language)
  if (o.lexicons) {
    if (literal) {
      const owner = lexiconOwnerOf(language, literal.owner)
      say(`[${elapsed()}] Léxicos de ${owner}…`)
      companions.lexicons = await addLexicons(cacheAdapter as never, catalogAdapter as never, language, owner, o.lexicons.ref, o.fetch)
      for (const l of companions.lexicons as Array<{ key: string; entries?: number; why?: string }>) {
        say(`[${elapsed()}]   ${l.key}: ${l.entries !== undefined ? `${l.entries} entradas` : l.why}`)
      }
    } else companions.lexicons = 'sin texto literal: no se sabe de qué dueño'
  }
  if (o.macula) {
    say(`[${elapsed()}] MACULA desde ${o.macula}…`)
    companions.macula = await addMacula(cacheAdapter as never, catalogAdapter as never, resolve(o.macula), o.maculaStamp ?? builtNow(), say)
    for (const m of companions.macula as Array<{ key: string; books: number }>) say(`[${elapsed()}]   ${m.key}: ${m.books} libros`)
  }
  // Open Bible Stories and their helps left out when asked: only the Bible is translated.
  const resourceKeys = o.obs ? undefined : (await source.catalogRows()).filter((m) => m.language === language && !isObs(m)).map(keyOfRow)

  const common = {
    source,
    language,
    ...(resourceKeys ? { resourceKeys } : {}),
    versions: PACK_VERSIONS,
    app: { name: 'resource-pipeline cli' },
  }

  mkdirSync(outDir, { recursive: true })
  const packs: Array<{ file: string; kind: string; bytes: number; manifest: unknown; skipped: unknown[] }> = []
  async function writePack(file: string, params: Partial<Parameters<typeof buildLanguagePack>[0]>): Promise<PackResult> {
    const { bytes, manifest, skipped } = await buildLanguagePack({ ...common, ...params })
    writeFileSync(join(outDir, file), bytes)
    packs.push({ file, kind: manifest.kind ?? 'language', bytes: bytes.length, manifest, skipped })
    say(`[${elapsed()}]   ${file}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB, ${manifest.resources.length} recursos`)
    if (skipped.length) say(`      fuera: ${skipped.map((s) => `${s.key} (${s.why})`).join(', ')}`)
    return { file, bytes, manifest, skipped }
  }

  say(`[${elapsed()}] Armando los paquetes…`)
  const languagePack = await writePack(`${language}.langpack.zip`, { kind: 'language' })
  let originalsPack: PackResult | undefined
  if (o.originals) {
    // Into the store only now: the packs written before take no original, and the base and book packs after take none.
    for (const index of await addOriginalsIndex({ cache: cacheAdapter, catalog: catalogAdapter }, ORIGINAL_LANGUAGE_KEYS)) {
      if (index.reason) say(`[${elapsed()}] Índice de palabras de ${index.key}: 0 libros (${index.reason})`)
      else say(`[${elapsed()}] Índice de palabras de ${index.key}: ${index.books} libros, ${index.rows} filas`)
    }
    originalsPack = await writePack('originals.langpack.zip', {
      kind: 'originals',
      resourceKeys: undefined,
      originalKeys: [...ORIGINAL_LANGUAGE_KEYS, ...(companions.macula ? MACULA_KEYS : [])],
    })
  }
  if (o.books) {
    const base = await writePack(`${language}-base.langpack.zip`, { kind: 'base' })
    const available = [...new Set(base.manifest.resources.flatMap((r) => r.books ?? []))].sort()
    const books = o.books === 'all' ? available : o.books.map((b) => b.trim().toLowerCase()).filter(Boolean)
    for (const book of books) await writePack(`${language}-${book}.langpack.zip`, { kind: 'book', books: [book] })
  }

  const reportJson = { preparation, companions, packs }
  writeFileSync(join(outDir, `${language}.report.json`), JSON.stringify(reportJson, null, 2))
  // The packs are bytes now; the store would otherwise stay in memory through the views step, which opens its own.
  await closeAndDelete([cacheAdapter, catalogAdapter], [dbNames.cache, dbNames.catalog], say)

  say(`[${elapsed()}] Listo en ${outDir}`)
  for (const build of preparation.builds) {
    const j = build.jobs
    say(
      `  ${build.language}: ${j.finished} construidos, ${j.cached} ya estaban, ${j.blocked} bloqueados, ${j.noop} sin hacer, ${j.failed} fallidos;` +
        ` ${build.resources.filter((r) => r.complete).length}/${build.resources.length} recursos completos`
    )
    for (const f of build.failures) say(`    falló ${f.job}: ${f.error}`)
  }
  if (languagePack.manifest.requires?.length) {
    say(`  ${language} necesita: ${languagePack.manifest.requires.map((r) => `${r.key}@${r.stamp}`).join(', ')}`)
  }

  return { language: languagePack, ...(originalsPack ? { originals: originalsPack } : {}), report: reportJson }
}
