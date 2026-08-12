/**
 * Dual-path USFM → ProcessedScripture.
 * Flag off: @bt-synergy/usfm-processor (default, byte-stable).
 * Flag on: @bt-synergy/usj-processor (USJ adapter).
 */

import type { ProcessedScripture, USFMProcessingOptions } from '@bt-synergy/usfm-processor'
import { USFMProcessor } from '@bt-synergy/usfm-processor'
import { USJProcessor } from '@bt-synergy/usj-processor'

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

/**
 * Process a USFM string into ProcessedScripture via the selected pipeline.
 * Callers / cache always receive the same ProcessedScripture shape.
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
    if (debug) {
      console.log('[scripture-loader] USE_USJ_PIPELINE=on — processing via USJProcessor')
    }
    const usjProcessor = params.usjProcessor ?? new USJProcessor()
    const { scripture } = await usjProcessor.processUSFM(usfmText, bookId, bookName, opts)
    return scripture
  }

  if (debug) {
    console.log('[scripture-loader] USE_USJ_PIPELINE=off — processing via USFMProcessor')
  }
  const usfmProcessor = params.usfmProcessor ?? new USFMProcessor()
  return usfmProcessor.processUSFM(usfmText, bookId, bookName, opts)
}
