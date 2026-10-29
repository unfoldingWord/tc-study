/**
 * Prepare a language from the command line and save it as a language pack.
 *
 *   bun packages/resource-pipeline/cli/prepare-language.ts --lang es-419 --out ./packs [--no-originals] [--books all|tit,rut]
 *     [--macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>]]
 *     [--no-lexicons] [--lexicons-ref <ref>] [--no-obs]
 *
 * Beside tc-study's resources (companions.ts): the language's lexicons from Door43 (`{owner}/{lang}_uhl`, `_ugl`, the
 * owner of its literal text) unless `--no-lexicons`, read from the ref `--lexicons-ref` (default `master`); MACULA's sentences and referents from a folder with Taller's
 * `trees/` and `referents/` with `--macula`, in the originals pack. `--no-obs` leaves Open Bible Stories and their helps
 * out of the packs (an app that translates only the Bible).
 *
 * MACULA's rows are stamped as publish-language stamps them (cli/maculaIdentity.ts): `--macula-commit` defaults to the
 * last commit that touched the folder's `trees/` and `referents/`, `--macula-date` to that commit's date. Apps compare
 * that stamp with production's to decide whether MACULA changed: a build date there would offer every app the same
 * MACULA again. A folder that is not a git checkout needs both flags.
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
import { resolve } from 'node:path'
import { requireFreshBuilds } from './freshBuilds'
import { maculaDateUtc, maculaIdentity, maculaStamp, type MaculaIdentity } from './maculaIdentity'
import { prepareAndPack } from '../src/language/prepareAndPack'

type PrepareAndPackOptions = Parameters<typeof prepareAndPack>[0]
type ReadMaculaIdentity = (folder: string, given: { commit?: string; date?: string }) => MaculaIdentity

export class UsageError extends Error {}

export const USAGE =
  'Uso: prepare-language --lang <código> [--out <carpeta>] [--no-originals] [--books all|tit,rut] ' +
  '[--macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>]] [--no-lexicons] [--lexicons-ref <ref>] [--no-obs]'

type PrepareLanguageDeps = {
  requireFreshBuilds: typeof requireFreshBuilds
  prepareAndPack: typeof prepareAndPack
  readMaculaIdentity: ReadMaculaIdentity
  log: (line: string) => void
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  if (i < 0) return undefined
  const value = argv[i + 1]
  if (value === undefined || value.startsWith('--')) throw new UsageError(`Falta el valor de --${name}`)
  return value
}

export function optionsFromArgs(argv: string[], readMaculaIdentity: ReadMaculaIdentity = maculaIdentity): { options: PrepareAndPackOptions; maculaIdentity?: MaculaIdentity } {
  const language = arg(argv, 'lang')
  if (!language) throw new UsageError('Falta --lang <código>')
  const originals = !argv.includes('--no-originals')

  const maculaArg = arg(argv, 'macula')
  const maculaCommit = arg(argv, 'macula-commit')
  const maculaDate = arg(argv, 'macula-date')
  if ((maculaCommit || maculaDate) && !maculaArg) throw new UsageError('--macula-commit y --macula-date requieren --macula <taller>/public')
  // A short sha would stamp fewer characters than production's ten, and look like another MACULA.
  if (maculaCommit && !/^[0-9a-f]{40}$/.test(maculaCommit)) {
    throw new UsageError(`--macula-commit no es un commit (40 caracteres hexadecimales): ${JSON.stringify(maculaCommit)}`)
  }
  if (maculaDate) {
    try {
      maculaDateUtc(maculaDate)
    } catch {
      throw new UsageError(`--macula-date no es una fecha ISO 8601: ${JSON.stringify(maculaDate)}`)
    }
  }
  const maculaFolder = maculaArg ? resolve(maculaArg) : undefined

  // MACULA goes only in the originals pack: without it, its stamp is never written.
  let identity: MaculaIdentity | undefined
  if (maculaFolder && originals) {
    try {
      identity = readMaculaIdentity(maculaFolder, { commit: maculaCommit, date: maculaDate })
    } catch (e) {
      throw new UsageError(
        `No se pudo leer el commit de MACULA en ${maculaFolder}: ${e instanceof Error ? e.message : String(e)}. ` +
          'Pasa --macula-commit <sha> y --macula-date <iso>.'
      )
    }
  }

  const booksArg = arg(argv, 'books')
  return {
    ...(identity ? { maculaIdentity: identity } : {}),
    options: {
      language,
      outDir: arg(argv, 'out') ?? '.',
      originals,
      books: booksArg ? (booksArg === 'all' ? 'all' : booksArg.split(',')) : undefined,
      macula: maculaFolder,
      ...(identity ? { maculaStamp: maculaStamp(identity) } : {}),
      lexicons: argv.includes('--no-lexicons') ? false : { ref: arg(argv, 'lexicons-ref') ?? 'master' },
      obs: !argv.includes('--no-obs'),
    },
  }
}

export async function runPrepareLanguage(argv: string[], deps: Partial<PrepareLanguageDeps> = {}): Promise<void> {
  const d: PrepareLanguageDeps = {
    requireFreshBuilds,
    prepareAndPack,
    readMaculaIdentity: maculaIdentity,
    log: console.log,
    ...deps,
  }
  const { options, maculaIdentity: identity } = optionsFromArgs(argv, d.readMaculaIdentity)
  if (identity) d.log(`MACULA: ${identity.commit} (${identity.date})`)
  // Packs made with code compiled before its last change are not this code's packs.
  d.requireFreshBuilds(['@bt-synergy/resource-pipeline', '@bt-synergy/language-pack', '@bt-synergy/cache-adapter-indexeddb', '@bt-synergy/catalog-adapter-indexeddb'])
  await d.prepareAndPack({ ...options, log: d.log })
}

// `main` is Bun's; this package's type check has no Bun types.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  try {
    await runPrepareLanguage(process.argv.slice(2))
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    console.error(e.message)
    console.error(USAGE)
    process.exit(2)
  }
}
