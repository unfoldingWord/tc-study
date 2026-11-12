/**
 * USFM → USJ SoT → view model / temporary ProcessedScripture projection.
 *
 * Sole process path: @bt-synergy/usj-processor.
 *
 * Prefer processUsfmToUsjResult() for new code (returns viewModel + cache payload).
 * processUsfmToScripture() remains for TokenRenderer / CombinedHelps until they migrate.
 */

import {
  USJProcessor,
  type ProcessedScripture,
  type USJProcessingOptions,
  type USJProcessResult,
  type UsjScriptureCacheContent,
} from '@bt-synergy/usj-processor'

const DEFAULT_OPTIONS: USJProcessingOptions = {
  includeAlignments: true,
  includeWordTokens: true,
  includeParagraphs: true,
}

export interface ProcessUsfmParams {
  usfmText: string
  bookId: string
  bookName?: string
  options?: USJProcessingOptions
  /** Optional shared processor instance (avoids re-construct per call) */
  usjProcessor?: USJProcessor
  debug?: boolean
}

async function resolveUsjProcessor(existing?: USJProcessor): Promise<USJProcessor> {
  return existing ?? new USJProcessor()
}

export interface ProcessUsfmToUsjResult extends USJProcessResult {
  /** Ready-to-store scripture-usj: payload */
  cacheContent: UsjScriptureCacheContent
}

/**
 * A backslash at the end of a line, with no marker after it, is not USFM: the parser throws on it ("Invalid marker") and
 * the whole book is lost. Drop it and say so, so the source can be fixed (BSOJ/ar_arst 57-TIT.usfm had two in Nov 2026,
 * on the line after `\mt` in chapters 2 and 3, and blocked the Arabic packs).
 */
export function withoutStrayBackslashes(usfm: string, where = ''): string {
  let dropped = 0
  const out = usfm.replace(/\\(?=[ \t]*(?:\r?\n|$))/g, () => {
    dropped++
    return ''
  })
  if (dropped) console.warn(`⚠️ [scripture-loader] ${where}: dropped ${dropped} stray backslash(es) with no marker after them`)
  return out
}

/**
 * Sole process path: USFM → USJ + AlignmentMap → UsjScriptureViewModel.
 * Also returns temporary ProcessedScripture projection + cache payload.
 */
export async function processUsfmToUsjResult(
  params: ProcessUsfmParams
): Promise<ProcessUsfmToUsjResult> {
  const {
    usfmText,
    bookId,
    bookName = bookId.toUpperCase(),
    options = DEFAULT_OPTIONS,
    debug = false,
  } = params

  if (debug) {
    console.log('[scripture-loader] processing via USJProcessor → UsjScriptureViewModel')
  }

  const usjProcessor = await resolveUsjProcessor(params.usjProcessor)
  const opts: USJProcessingOptions = { ...DEFAULT_OPTIONS, ...options }
  const result = await usjProcessor.processUSFM(withoutStrayBackslashes(usfmText, bookId), bookId, bookName, opts)
  const cacheContent = usjProcessor.toUsjCacheContent(result, bookId, bookName)
  return { ...result, cacheContent }
}

/**
 * Process a USFM string into ProcessedScripture (USJ projection).
 *
 * @deprecated Prefer processUsfmToUsjResult().viewModel for new consumers.
 */
export async function processUsfmToScripture(
  params: ProcessUsfmParams
): Promise<ProcessedScripture> {
  const result = await processUsfmToUsjResult(params)
  return result.scripture
}
