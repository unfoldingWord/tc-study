/**
 * The code part of every part fingerprint (spec §1: "every fingerprint also includes the versions of the code that
 * computes its layers"). A part whose inputs did not change is carried from the last list with the bytes it was built
 * with, so every version of code that writes a row a part carries must be in its fingerprint: a bump of any of them
 * changes every fingerprint and the next build rebuilds every unit.
 *
 * The parts compat key names the bucket folder and holds only the versions phones must agree on (PACK_VERSIONS); the
 * code adds a hash of all the rest. The lists record it (`PartsList.code`), so a reader (delivery 3's Worker, which
 * computes fingerprints from Door43's tree) takes it from there instead of knowing these versions.
 *
 * Besides the constants: the installed version of every third-party package the rows go through (the USFM parser,
 * the markdown pipeline, the zip reader, the store) and of everything those depend on, read from node_modules when the
 * build starts, since an upgrade can change rows with no constant moving; and a sample of the stamps keys carry, so a
 * change of their format moves the code too.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compatKeyOf, PARTS_FORMAT_VERSION, sha256Hex, stableJson } from '@bt-synergy/language-pack'
import { bookContentStamp, HELPS_INGEST_SCHEMA, resourceContentStamp } from '@bt-synergy/resource-catalog'
import { NOTES_TSV_PARSER_VERSION, QUESTIONS_TSV_PARSER_VERSION, WORDS_LINKS_TSV_PARSER_VERSION } from '@bt-synergy/resource-parsers'
import { TA_ROWS_VERSION } from '@bt-synergy/translation-academy-loader'
import { TW_ROWS_VERSION } from '@bt-synergy/translation-words-loader'
import { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS } from '@bt-synergy/usj-processor'
import { LEXICON_ROWS_VERSION, lexiconStampOf, MACULA_ROWS_VERSION } from '../../cli/companions'
import { ACADEMY_PREPARE_VERSION } from '../academy/academyPreparer'
import { HELPS_ALIGN_VERSION } from '../helps/helpsAlignCache'
import { HELPS_TEXT_VERSION } from '../helps/helpsCacheKeys'
import { HELPS_QUOTE_VERSION } from '../helps/helpsQuoteCache'
import { OBS_ROWS_VERSION } from '../loaders/ObsLoader'
import { MARKDOWN_HAST_VERSION } from '../markdown/markdownToHast'
import { NOTES_PREPARE_VERSION } from '../notes/notesPreparer'
import { OBS_NOTES_PREPARE_VERSION } from '../obs/obsNotesPreparer'
import { OBS_PREPARE_VERSION } from '../obs/obsPreparer'
import { OBS_QUESTIONS_PREPARE_VERSION } from '../obs/obsQuestionsPreparer'
import { QUESTIONS_PREPARE_VERSION } from '../questions/questionsPreparer'
import { SCRIPTURE_PREPARE_SCHEMA, SCRIPTURE_PREPARE_VERSION } from '../scripture/scripturePreparer'
import { WORDS_PREPARE_VERSION } from '../words/wordsPreparer'
import { WORDS_LINKS_PREPARE_VERSION } from '../wordsLinks/wordsLinksPreparer'
import { ARTICLE_TITLES_VERSION } from './buildLanguageArtifacts'
import { PACK_VERSIONS } from './packVersions'

/** The workspace's packages folder (`packages/`). */
const PACKAGES = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * The third-party packages whose code shapes the rows a part carries, by the workspace package that imports them;
 * what they depend on is followed from there (`installedVersions`).
 */
export const ROW_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  // USFM → USJ: every scripture and original row, and the alignments the quotes are made from.
  'usj-processor': ['@usfm-tools/parser', '@usfm-tools/usj-core'],
  // markdownToHast (every helps preparer's hast); the zips the build hashes; the store every row is written to and
  // read back from (fake-indexeddb's structured clone).
  'resource-pipeline': ['unified', 'remark-parse', 'remark-gfm', 'remark-rehype', 'jszip', 'fake-indexeddb'],
  // The loaders read their files from the release zips with JSZip.
  'scripture-loader': ['jszip'],
  'translation-notes-loader': ['jszip'],
  'translation-questions-loader': ['jszip'],
  'translation-words-links-loader': ['jszip'],
  'translation-words-loader': ['jszip'],
  'translation-academy-loader': ['jszip'],
}

/** Third-party dependencies of the row producers that no row comes from, and why (partsCode.test.ts asks). */
export const NOT_ROW_DEPENDENCIES: Readonly<Record<string, string>> = {
  '@usfm-tools/types': 'types only (and followed anyway: the parser depends on it)',
  pako: "language-pack's part gzip: the bytes around the rows, not the rows (a carried part decodes to the same rows)",
  react: 'the screens of catalog-manager and resource-types, never imported by a build',
  marked: "a peer resource-parsers never imports",
}

/** Workspace packages the row producers depend on that partsCode.test.ts does not scan, and why. */
export const NOT_SCANNED: Readonly<Record<string, string>> = {
  'resource-cache': 'only its types are imported; the store is cache-adapter-indexeddb, which is scanned',
}

/** The folder of package `name` as Node resolves it from `from` (each `node_modules` up the tree), its links followed. */
function packageDir(name: string, from: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    if (dirname(dir) === dir) return null
  }
}

type PackageJson = {
  name: string
  version: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/**
 * `npm <name>` → the installed version of each package of ROW_DEPENDENCIES and of each package they depend on, read
 * from node_modules (several installed versions of one name: all of them, sorted; `@types/` left out, they run no
 * code). A root that is not installed
 * throws: a build cannot say which code made its rows.
 */
export function installedVersions(): Record<string, string> {
  const found = new Map<string, Set<string>>()
  const seen = new Set<string>()
  const queue: Array<{ name: string; from: string; required: boolean; by: string }> = Object.entries(ROW_DEPENDENCIES).flatMap(
    ([pkg, deps]) => deps.map((name) => ({ name, from: join(PACKAGES, pkg), required: true, by: pkg }))
  )
  while (queue.length) {
    const { name, from, required, by } = queue.shift()!
    // Type declarations run no code.
    if (name.startsWith('@types/')) continue
    const dir = packageDir(name, from)
    if (!dir) {
      if (required) throw new Error(`${name} (a dependency of ${by}) is not installed: run bun install`)
      continue
    }
    if (seen.has(dir)) continue
    seen.add(dir)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson
    found.set(pkg.name, (found.get(pkg.name) ?? new Set()).add(pkg.version))
    for (const dep of Object.keys(pkg.dependencies ?? {})) queue.push({ name: dep, from: dir, required: true, by: pkg.name })
    // Optional and peer dependencies count when installed: they may be what runs.
    for (const dep of Object.keys({ ...pkg.optionalDependencies, ...pkg.peerDependencies })) queue.push({ name: dep, from: dir, required: false, by: pkg.name })
  }
  return Object.fromEntries([...found].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, vs]) => [`npm ${name}`, [...vs].sort().join(' ')]))
}

/** A fixed catalog row whose stamps partsCodeVersions holds: the format of the stamps keys carry is code too. */
export const STAMP_SAMPLE = {
  version: 'v2:a|b@c',
  release: { tag_name: 'v2:a|b@c', published_at: '2026-01-02T03:04:05Z' },
  contentMetadata: { bookBlobs: { rut: 'ce013625030ba8dba906f756967f9e9ca394464a' }, bookBlobsRef: 'v2:a|b@c' },
}

/** Every version of code whose output a part carries, by the constant's name. */
export function partsCodeVersions(): Record<string, string | number> {
  return {
    // Source rows: scripture (USJ, its chapters), the TSV helps, articles, stories, lexicons, MACULA.
    USJ_PROCESSING_VERSION,
    'USJ_TOOL_VERSIONS.parser': USJ_TOOL_VERSIONS.parser,
    'USJ_TOOL_VERSIONS.usjCore': USJ_TOOL_VERSIONS.usjCore,
    HELPS_INGEST_SCHEMA,
    NOTES_TSV_PARSER_VERSION,
    QUESTIONS_TSV_PARSER_VERSION,
    WORDS_LINKS_TSV_PARSER_VERSION,
    TW_ROWS_VERSION,
    TA_ROWS_VERSION,
    OBS_ROWS_VERSION,
    LEXICON_ROWS_VERSION,
    MACULA_ROWS_VERSION,
    // Prepared rows.
    SCRIPTURE_PREPARE_SCHEMA,
    SCRIPTURE_PREPARE_VERSION,
    MARKDOWN_HAST_VERSION,
    NOTES_PREPARE_VERSION,
    WORDS_LINKS_PREPARE_VERSION,
    QUESTIONS_PREPARE_VERSION,
    WORDS_PREPARE_VERSION,
    ACADEMY_PREPARE_VERSION,
    OBS_PREPARE_VERSION,
    OBS_NOTES_PREPARE_VERSION,
    OBS_QUESTIONS_PREPARE_VERSION,
    // Quotes, alignments, titles.
    HELPS_QUOTE_VERSION,
    HELPS_ALIGN_VERSION,
    HELPS_TEXT_VERSION,
    ARTICLE_TITLES_VERSION,
    // The stamps keys and rows carry, for a fixed row.
    'stamp resourceContentStamp': resourceContentStamp(STAMP_SAMPLE),
    'stamp bookContentStamp': bookContentStamp(STAMP_SAMPLE, 'RUT'),
    'stamp bookContentStamp, no blob': bookContentStamp(STAMP_SAMPLE, 'jon'),
    'stamp lexiconStampOf': lexiconStampOf({ sha: '0123456789abcdef0123456789abcdef01234567', date: '2026-07-01T00:00:00Z' }),
    // Third-party code on the row path, as installed.
    ...installedVersions(),
  }
}

/**
 * Exported version and schema constants of the row producers that are not code a part's rows come from, and why
 * (partsCode.test.ts finds every such constant: each is in `partsCodeVersions` or here).
 */
export const NOT_ROW_CODE: Readonly<Record<string, string>> = {
  PARTS_FORMAT_VERSION: 'in the code already: the compat key it starts with is made with it',
  PACK_FORMAT_VERSION: 'whole packs (f1.1), not parts',
  FINGERPRINT_VERSION: 'in every fingerprint already (its `v`); it versions the rules, not the rows',
  WARM_COVERAGE_VERSION: "the app's `warm-coverage:` bookkeeping row, which no part carries",
  PACK_VERSIONS: 'in the code already: the compat key is made of it (and each of its values is here by its own name)',
  VIEWS_SCHEMA: "the MCP views' schema (writeMcpViews), not parts",
}

/** `<compat>+<16 hex>`: the compat key, and the first 16 hex of the sha256 of the versions' stable JSON. */
export async function partsCodeOf(compat: string, versions: Record<string, string | number>): Promise<string> {
  const hash = await sha256Hex(new TextEncoder().encode(stableJson(versions)))
  return `${compat}+${hash.slice(0, 16)}`
}

/** The code of this build: what every part fingerprint and both lists (`PartsList.code`) carry. */
export async function partsCode(): Promise<string> {
  return partsCodeOf(compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS), partsCodeVersions())
}
