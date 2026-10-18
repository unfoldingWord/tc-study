/**
 * Prepare a language from the command line and save it as a language pack.
 *
 *   bun packages/resource-pipeline/cli/prepare-language.ts --lang es-419 --out ./packs [--no-originals] [--books all|tit,rut]
 *     [--macula <folder>] [--no-lexicons] [--no-obs]
 *
 * Beside tc-study's resources (companions.ts): the language's lexicons from Door43 (`{owner}/{lang}_uhl`, `_ugl`, the
 * owner of its literal text) unless `--no-lexicons`; MACULA's sentences and referents from a folder with Taller's
 * `trees/` and `referents/` with `--macula`, in the originals pack. `--no-obs` leaves Open Bible Stories and their helps
 * out of the packs (an app that translates only the Bible).
 *
 * Runs tc-study's own pipeline (discover, download, build) into tc-study's own IndexedDB adapters, kept in memory by
 * fake-indexeddb, so the rows are byte for byte the ones the app writes; then packs them with
 * @bt-synergy/language-pack. Reads only the public Door43 catalog. Writes in `--out`:
 *
 *   {lang}.langpack.zip            the whole language, without the originals (its manifest says which ones it needs)
 *   originals.langpack.zip         UGNT and UHB, the same for every language (unless --no-originals)
 *   {lang}-base.langpack.zip       with --books: catalog, TA, TW, OBS…
 *   {lang}-{book}.langpack.zip     with --books: one per book (`all`: every book the language has)
 *   {lang}.report.json             what was found, built, blocked and packed
 */

import 'fake-indexeddb/auto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { buildLanguagePack, ORIGINAL_LANGUAGE_KEYS, packSourceFrom } from '@bt-synergy/language-pack'
import { addLexicons, addMacula, MACULA_KEYS } from './companions'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { HELPS_TEXT_VERSION } from '../src/helps/helpsCacheKeys'
import { HELPS_ALIGN_VERSION } from '../src/helps/helpsAlignCache'
import { HELPS_QUOTE_VERSION } from '../src/helps/helpsQuoteCache'
import { prepareLanguage, type PrepareLanguageProgress } from '../src/language/prepareLanguage'
import { SCRIPTURE_PREPARE_VERSION } from '../src/scripture/scripturePreparer'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const language = arg('lang')
if (!language) {
  console.error('Uso: prepare-language --lang <código> [--out <carpeta>] [--no-originals] [--books all|tit,rut]')
  process.exit(2)
}
const outDir = resolve(arg('out') ?? '.')
const includeOriginals = !process.argv.includes('--no-originals')
const booksArg = arg('books')

const cacheAdapter = new IndexedDBCacheAdapter({ dbName: 'tc-study-cache', storeName: 'cache-entries', version: 1 })
const catalogAdapter = new IndexedDBCatalogAdapter({ dbName: 'tc-study-catalog', storeName: 'catalog-entries', version: 1 })
const door43Client = getDoor43ApiClient({ baseUrl: 'https://git.door43.org', debug: false })

const started = Date.now()
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`
let lastJobsLine = 0

function report(progress: PrepareLanguageProgress) {
  if (progress.phase === 'discover') {
    console.log(`[${elapsed()}] Buscando los recursos de ${language} en Door43…`)
  } else if (progress.phase === 'download') {
    const { message } = progress
    if (message.type === 'queue-updated') {
      const p = message.payload as { totalResources: number; totalIngredients: number }
      console.log(`[${elapsed()}] Descargando ${p.totalResources} recursos (${p.totalIngredients} partes)…`)
    } else if (message.type === 'resource-complete') {
      console.log(`[${elapsed()}]   completo: ${(message.payload as { resourceKey: string }).resourceKey}`)
    }
  } else if (progress.phase === 'build') {
    const p = progress.progress
    if (p.phase === 'plan') console.log(`[${elapsed()}] ${progress.language}: ${p.jobs} trabajos por construir`)
    if (p.phase === 'jobs' && (p.done === p.total || Date.now() - lastJobsLine > 15000)) {
      lastJobsLine = Date.now()
      console.log(`[${elapsed()}] ${progress.language}: ${p.done}/${p.total} trabajos`)
    }
    if (p.phase === 'titles') console.log(`[${elapsed()}] ${progress.language}: títulos de ${p.resourceKey}`)
  }
}

const preparation = await prepareLanguage({
  language,
  cacheAdapter: cacheAdapter as never,
  catalogAdapter: catalogAdapter as never,
  door43Client: door43Client as never,
  includeOriginals,
  onProgress: report,
})

const source = packSourceFrom({ cache: cacheAdapter as never, catalog: catalogAdapter as never })

// The resources beside tc-study's (companions.ts), into the same store before packing.
const companions: Record<string, unknown> = {}
const languageRows = (await source.catalogRows()).filter((m) => m.language === language)
const literal = languageRows.find((m) => m.subject === 'Aligned Bible' && /lt$/.test(String(m.resourceId)))
if (!process.argv.includes('--no-lexicons')) {
  if (literal) {
    console.log(`[${elapsed()}] Léxicos de ${literal.owner}…`)
    companions.lexicons = await addLexicons(cacheAdapter as never, catalogAdapter as never, language, literal.owner)
    for (const l of companions.lexicons as Array<{ key: string; entries?: number; why?: string }>) {
      console.log(`[${elapsed()}]   ${l.key}: ${l.entries !== undefined ? `${l.entries} entradas` : l.why}`)
    }
  } else companions.lexicons = 'sin texto literal: no se sabe de qué dueño'
}
const maculaFolder = arg('macula')
if (maculaFolder) {
  console.log(`[${elapsed()}] MACULA desde ${maculaFolder}…`)
  companions.macula = await addMacula(cacheAdapter as never, catalogAdapter as never, resolve(maculaFolder), new Date().toISOString())
  for (const m of companions.macula as Array<{ key: string; books: number }>) console.log(`[${elapsed()}]   ${m.key}: ${m.books} libros`)
}
// Open Bible Stories and their helps left out when asked: only the Bible is translated.
const isObs = (m: { subject?: unknown }) => /OBS|Open Bible Stories/i.test(String(m.subject ?? ''))
const keyOfRow = (m: { owner?: unknown; language?: unknown; resourceId?: unknown; resourceKey?: unknown }) =>
  String(m.resourceKey ?? `${m.owner}/${m.language}/${m.resourceId}`)
const resourceKeys = process.argv.includes('--no-obs')
  ? (await source.catalogRows()).filter((m) => m.language === language && !isObs(m)).map(keyOfRow)
  : undefined

const common = {
  source,
  language,
  ...(resourceKeys ? { resourceKeys } : {}),
  versions: {
    sot: { usjProcessing: USJ_PROCESSING_VERSION },
    // An app that reads the prepared chapters without making them (Servos) must know whose they are.
    prepared: { scripturePrepare: SCRIPTURE_PREPARE_VERSION },
    quote: { helpsQuote: HELPS_QUOTE_VERSION },
    align: { helpsAlign: HELPS_ALIGN_VERSION },
    text: { helpsText: HELPS_TEXT_VERSION },
  },
  app: { name: 'resource-pipeline cli' },
}

mkdirSync(outDir, { recursive: true })
const packs: Array<{ file: string; kind: string; bytes: number; manifest: unknown; skipped: unknown[] }> = []
async function writePack(file: string, params: Partial<Parameters<typeof buildLanguagePack>[0]>) {
  const { bytes, manifest, skipped } = await buildLanguagePack({ ...common, ...params })
  writeFileSync(join(outDir, file), bytes)
  packs.push({ file, kind: manifest.kind ?? 'language', bytes: bytes.length, manifest, skipped })
  console.log(`[${elapsed()}]   ${file}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB, ${manifest.resources.length} recursos`)
  if (skipped.length) console.log(`      fuera: ${skipped.map((s) => `${s.key} (${s.why})`).join(', ')}`)
  return manifest
}

console.log(`[${elapsed()}] Armando los paquetes…`)
const languageManifest = await writePack(`${language}.langpack.zip`, { kind: 'language' })
if (includeOriginals) {
  await writePack('originals.langpack.zip', {
    kind: 'originals',
    resourceKeys: undefined,
    originalKeys: [...ORIGINAL_LANGUAGE_KEYS, ...(companions.macula ? MACULA_KEYS : [])],
  })
}
if (booksArg) {
  const base = await writePack(`${language}-base.langpack.zip`, { kind: 'base' })
  const available = [...new Set(base.resources.flatMap((r) => r.books ?? []))].sort()
  const books = booksArg === 'all' ? available : booksArg.split(',').map((b) => b.trim().toLowerCase()).filter(Boolean)
  for (const book of books) await writePack(`${language}-${book}.langpack.zip`, { kind: 'book', books: [book] })
}

writeFileSync(join(outDir, `${language}.report.json`), JSON.stringify({ preparation, companions, packs }, null, 2))

console.log(`[${elapsed()}] Listo en ${outDir}`)
for (const build of preparation.builds) {
  const j = build.jobs
  console.log(
    `  ${build.language}: ${j.finished} construidos, ${j.cached} ya estaban, ${j.blocked} bloqueados, ${j.noop} sin hacer;` +
      ` ${build.resources.filter((r) => r.complete).length}/${build.resources.length} recursos completos`
  )
}
if (languageManifest.requires?.length) {
  console.log(`  ${language} necesita: ${languageManifest.requires.map((r) => `${r.key}@${r.stamp}`).join(', ')}`)
}
