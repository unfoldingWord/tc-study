/**
 * The code part of every part fingerprint (spec §1: "every fingerprint also includes the versions of the code that
 * computes its layers"). A part whose inputs did not change is carried from the last list with the bytes it was built
 * with, so every version of code that writes a row a part carries must be in its fingerprint: a bump of any of them
 * changes every fingerprint and the next build rebuilds every unit.
 *
 * The parts compat key names the bucket folder and holds only the versions phones must agree on (PACK_VERSIONS); the
 * code adds a hash of all the rest. The lists record it (`PartsList.code`), so a reader (delivery 3's Worker, which
 * computes fingerprints from Door43's tree) takes it from there instead of knowing these versions.
 */

import { compatKeyOf, PARTS_FORMAT_VERSION, sha256Hex, stableJson } from '@bt-synergy/language-pack'
import { HELPS_INGEST_SCHEMA } from '@bt-synergy/resource-catalog'
import { NOTES_TSV_PARSER_VERSION, QUESTIONS_TSV_PARSER_VERSION, WORDS_LINKS_TSV_PARSER_VERSION } from '@bt-synergy/resource-parsers'
import { TA_ROWS_VERSION } from '@bt-synergy/translation-academy-loader'
import { TW_ROWS_VERSION } from '@bt-synergy/translation-words-loader'
import { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS } from '@bt-synergy/usj-processor'
import { LEXICON_ROWS_VERSION, MACULA_ROWS_VERSION } from '../../cli/companions'
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
