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
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { addLexicons, addMacula, MACULA_KEYS } from '../../cli/companions'
import { HELPS_TEXT_VERSION } from '../helps/helpsCacheKeys'
import { HELPS_ALIGN_VERSION } from '../helps/helpsAlignCache'
import { HELPS_QUOTE_VERSION } from '../helps/helpsQuoteCache'
import { SCRIPTURE_PREPARE_VERSION } from '../scripture/scripturePreparer'
import { isObs, keyOfRow } from './door43Stamps'
import { prepareLanguage, type PrepareLanguageProgress } from './prepareLanguage'

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
  /** The lexicons are read from this ref of their Door43 repositories; `false` leaves them out. */
  lexicons: false | { ref: string }
  /** `false` leaves Open Bible Stories and their helps out (an app that translates only the Bible). */
  obs: boolean
  log?: (line: string) => void
}): Promise<PreparedPacks> {
  const language = o.language
  const outDir = resolve(o.outDir)
  const say = o.log ?? (() => {})

  const cacheAdapter = new IndexedDBCacheAdapter({ dbName: 'tc-study-cache', storeName: 'cache-entries', version: 1 })
  const catalogAdapter = new IndexedDBCatalogAdapter({ dbName: 'tc-study-catalog', storeName: 'catalog-entries', version: 1 })
  const door43Client = getDoor43ApiClient({ baseUrl: 'https://git.door43.org', debug: false })

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
  })

  const source = packSourceFrom({ cache: cacheAdapter as never, catalog: catalogAdapter as never })

  // The resources beside tc-study's (cli/companions.ts), into the same store before packing.
  const companions: Record<string, unknown> = {}
  const languageRows = (await source.catalogRows()).filter((m) => m.language === language)
  const literal = languageRows.find((m) => m.subject === 'Aligned Bible' && /lt$/.test(String(m.resourceId)))
  if (o.lexicons) {
    if (literal) {
      say(`[${elapsed()}] Léxicos de ${literal.owner}…`)
      companions.lexicons = await addLexicons(cacheAdapter as never, catalogAdapter as never, language, literal.owner, o.lexicons.ref)
      for (const l of companions.lexicons as Array<{ key: string; entries?: number; why?: string }>) {
        say(`[${elapsed()}]   ${l.key}: ${l.entries !== undefined ? `${l.entries} entradas` : l.why}`)
      }
    } else companions.lexicons = 'sin texto literal: no se sabe de qué dueño'
  }
  if (o.macula) {
    say(`[${elapsed()}] MACULA desde ${o.macula}…`)
    companions.macula = await addMacula(cacheAdapter as never, catalogAdapter as never, resolve(o.macula), new Date().toISOString())
    for (const m of companions.macula as Array<{ key: string; books: number }>) say(`[${elapsed()}]   ${m.key}: ${m.books} libros`)
  }
  // Open Bible Stories and their helps left out when asked: only the Bible is translated.
  const resourceKeys = o.obs ? undefined : (await source.catalogRows()).filter((m) => m.language === language && !isObs(m)).map(keyOfRow)

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

  say(`[${elapsed()}] Listo en ${outDir}`)
  for (const build of preparation.builds) {
    const j = build.jobs
    say(
      `  ${build.language}: ${j.finished} construidos, ${j.cached} ya estaban, ${j.blocked} bloqueados, ${j.noop} sin hacer;` +
        ` ${build.resources.filter((r) => r.complete).length}/${build.resources.length} recursos completos`
    )
  }
  if (languagePack.manifest.requires?.length) {
    say(`  ${language} necesita: ${languagePack.manifest.requires.map((r) => `${r.key}@${r.stamp}`).join(', ')}`)
  }

  return { language: languagePack, ...(originalsPack ? { originals: originalsPack } : {}), report: reportJson }
}
