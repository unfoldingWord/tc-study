/**
 * USFM → USJ SoT → view model / temporary ProcessedScripture projection.
 *
 * Default: @bt-synergy/usj-processor (USJ replaces usfm-js).
 * Opt-out: @bt-synergy/usfm-processor via dynamic import (transitional rollback only).
 *
 * Prefer processUsfmToUsjResult() for new code (returns viewModel + cache payload).
 * processUsfmToScripture() remains for TokenRenderer / CombinedHelps until they migrate.
 */

import type { ProcessedScripture, USFMProcessingOptions, USFMProcessor } from '@bt-synergy/usfm-processor'
import {
  USJProcessor,
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
  useUsjPipeline: boolean
  options?: USFMProcessingOptions
  /** Optional shared processor instances (avoids re-construct per call) */
  usfmProcessor?: USFMProcessor
  usjProcessor?: USJProcessor
  debug?: boolean
}

async function resolveUsjProcessor(existing?: USJProcessor): Promise<USJProcessor> {
  return existing ?? new USJProcessor()
}

/** Lazy-load legacy usfm-js path so the default USJ bundle does not need it eagerly. */
async function resolveUsfmProcessor(existing?: USFMProcessor): Promise<USFMProcessor> {
  if (existing) return existing
  const { USFMProcessor } = await import('@bt-synergy/usfm-processor')
  return new USFMProcessor()
}

export interface ProcessUsfmToUsjResult extends USJProcessResult {
  /** Ready-to-store scripture-usj: payload */
  cacheContent: UsjScriptureCacheContent
}

/**
 * Default process path: USFM → USJ + AlignmentMap → UsjScriptureViewModel.
 * Also returns temporary ProcessedScripture projection + cache payload.
 */
export async function processUsfmToUsjResult(
  params: Omit<ProcessUsfmParams, 'useUsjPipeline'> & { useUsjPipeline?: true }
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
 * Process a USFM string into ProcessedScripture via the selected pipeline.
 * Default = USJ projection. Opt-out = legacy usfm-js.
 *
 * @deprecated Prefer processUsfmToUsjResult().viewModel for new consumers.
 */
export async function processUsfmToScripture(
  params: ProcessUsfmParams
): Promise<ProcessedScripture> {
  const {
    usfmText,
    bookId,
    bookName = bookId.toUpperCase(),
    useUsjPipeline,
    options = DEFAULT_OPTIONS,
    debug = false,
  } = params

  const opts: USFMProcessingOptions = { ...DEFAULT_OPTIONS, ...options }

  if (useUsjPipeline) {
    const result = await processUsfmToUsjResult({
      usfmText,
      bookId,
      bookName,
      options: opts,
      usjProcessor: params.usjProcessor,
      debug,
    })
    return result.scripture
  }

  if (debug) {
    console.log(
      '[scripture-loader] USE_USJ_PIPELINE=off — legacy USFMProcessor (usfm-js rollback)'
    )
  }
  const usfmProcessor = await resolveUsfmProcessor(params.usfmProcessor)
  return usfmProcessor.processUSFM(usfmText, bookId, bookName, opts)
}
