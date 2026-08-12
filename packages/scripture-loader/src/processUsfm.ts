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
  type USFMProcessingOptions,
  type USJProcessResult,
  type UsjScriptureCacheContent,
} from '@bt-synergy/usj-processor'

const DEFAULT_OPTIONS: USFMProcessingOptions = {
  includeAlignments: true,
  includeWordTokens: true,
  includeParagraphs: true,
}

export interface ProcessUsfmParams {
  usfmText: string
  bookId: string
  bookName?: string
  options?: USFMProcessingOptions
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
  const opts: USFMProcessingOptions = { ...DEFAULT_OPTIONS, ...options }
  const result = await usjProcessor.processUSFM(usfmText, bookId, bookName, opts)
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
