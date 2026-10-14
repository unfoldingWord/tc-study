/**
 * Prepare a language from the command line and save it as a language pack.
 *
 *   bun packages/resource-pipeline/cli/prepare-language.ts --lang es-419 --out ./packs [--no-originals]
 *
 * Runs tc-study's own pipeline (discover, download, build) into tc-study's own IndexedDB adapters, kept in memory by
 * fake-indexeddb, so the rows are byte for byte the ones the app writes; then packs them with
 * @bt-synergy/language-pack. Reads only the public Door43 catalog. Writes `{lang}.langpack.zip` and
 * `{lang}.report.json` in `--out`.
 */

import 'fake-indexeddb/auto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { buildLanguagePack, packSourceFrom } from '@bt-synergy/language-pack'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { HELPS_TEXT_VERSION } from '../src/helps/helpsCacheKeys'
import { HELPS_ALIGN_VERSION } from '../src/helps/helpsAlignCache'
import { HELPS_QUOTE_VERSION } from '../src/helps/helpsQuoteCache'
import { prepareLanguage, type PrepareLanguageProgress } from '../src/language/prepareLanguage'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const language = arg('lang')
if (!language) {
  console.error('Uso: prepare-language --lang <código> [--out <carpeta>] [--no-originals]')
  process.exit(2)
}
const outDir = resolve(arg('out') ?? '.')
const includeOriginals = !process.argv.includes('--no-originals')

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

console.log(`[${elapsed()}] Armando el paquete…`)
const { bytes, manifest, skipped } = await buildLanguagePack({
  source: packSourceFrom({ cache: cacheAdapter as never, catalog: catalogAdapter as never }),
  language,
  versions: {
    sot: { usjProcessing: USJ_PROCESSING_VERSION },
    quote: { helpsQuote: HELPS_QUOTE_VERSION },
    align: { helpsAlign: HELPS_ALIGN_VERSION },
    text: { helpsText: HELPS_TEXT_VERSION },
  },
  app: { name: 'resource-pipeline cli' },
})

mkdirSync(outDir, { recursive: true })
const zipPath = join(outDir, `${language}.langpack.zip`)
writeFileSync(zipPath, bytes)
writeFileSync(
  join(outDir, `${language}.report.json`),
  JSON.stringify({ preparation, pack: { manifest, skipped, bytes: bytes.length } }, null, 2)
)

console.log(`[${elapsed()}] Listo: ${zipPath} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`)
for (const build of preparation.builds) {
  const j = build.jobs
  console.log(
    `  ${build.language}: ${j.finished} construidos, ${j.cached} ya estaban, ${j.blocked} bloqueados, ${j.noop} sin hacer;` +
      ` ${build.resources.filter((r) => r.complete).length}/${build.resources.length} recursos completos`
  )
}
if (skipped.length) console.log(`  fuera del paquete: ${skipped.map((s) => `${s.key} (${s.why})`).join(', ')}`)
