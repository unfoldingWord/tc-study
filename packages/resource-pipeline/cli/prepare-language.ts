/**
 * Prepare a language from the command line and save it as a language pack.
 *
 *   bun packages/resource-pipeline/cli/prepare-language.ts --lang es-419 --out ./packs [--no-originals] [--books all|tit,rut]
 *     [--macula <folder>] [--no-lexicons] [--lexicons-ref <ref>] [--no-obs]
 *
 * Beside tc-study's resources (companions.ts): the language's lexicons from Door43 (`{owner}/{lang}_uhl`, `_ugl`, the
 * owner of its literal text) unless `--no-lexicons`, read from the ref `--lexicons-ref` (default `master`); MACULA's sentences and referents from a folder with Taller's
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
import { requireFreshBuilds } from './freshBuilds'
import { prepareAndPack } from '../src/language/prepareAndPack'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const language = arg('lang')
if (!language) {
  console.error('Uso: prepare-language --lang <código> [--out <carpeta>] [--no-originals] [--books all|tit,rut]')
  process.exit(2)
}
// Packs made with code compiled before its last change are not this code's packs.
requireFreshBuilds(['@bt-synergy/resource-pipeline', '@bt-synergy/language-pack', '@bt-synergy/cache-adapter-indexeddb', '@bt-synergy/catalog-adapter-indexeddb'])
const booksArg = arg('books')

await prepareAndPack({
  language,
  outDir: arg('out') ?? '.',
  originals: !process.argv.includes('--no-originals'),
  books: booksArg ? (booksArg === 'all' ? 'all' : booksArg.split(',')) : undefined,
  macula: arg('macula'),
  lexicons: process.argv.includes('--no-lexicons') ? false : { ref: arg('lexicons-ref') ?? 'master' },
  obs: !process.argv.includes('--no-obs'),
  log: console.log,
})
