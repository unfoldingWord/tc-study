/**
 * USFM → ProcessedScripture.
 *
 * Default: @bt-synergy/usj-processor (USJ replace path).
 * Opt-out: @bt-synergy/usfm-processor via dynamic import (transitional rollback only).
 *
 * TODO(sunset): ProcessedScripture is a temporary projection DTO for TokenRenderer /
 * CombinedHelps. Target: drop usfm-js dependency; migrate callers to USJ-native
 * identity or keep a thin projection with an explicit removal date once
 * CombinedHelps/semantic-ID consumers are migrated (hard part).
 */

import type { ProcessedScripture, USFMProcessingOptions, USFMProcessor } from '@bt-synergy/usfm-processor'
import type { USJProcessor } from '@bt-synergy/usj-processor'
import { USJProcessor as USJProcessorCtor } from '@bt-synergy/usj-processor'

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
  return existing ?? new USJProcessorCtor()
}

/** Lazy-load legacy usfm-js path so the default USJ bundle does not need it eagerly. */
async function resolveUsfmProcessor(existing?: USFMProcessor): Promise<USFMProcessor> {
  if (existing) return existing
  const { USFMProcessor } = await import('@bt-synergy/usfm-processor')
  return new USFMProcessor()
}

/**
 * Process a USFM string into ProcessedScripture via the selected pipeline.
 * Callers / cache always receive the same ProcessedScripture shape (temporary DTO).
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
      console.log('[scripture-loader] USE_USJ_PIPELINE=on — processing via USJProcessor (default)')
    }
    const usjProcessor = await resolveUsjProcessor(params.usjProcessor)
    const { scripture } = await usjProcessor.processUSFM(usfmText, bookId, bookName, opts)
    return scripture
  }

  if (debug) {
    console.log(
      '[scripture-loader] USE_USJ_PIPELINE=off — legacy USFMProcessor (usfm-js rollback)'
    )
  }
  const usfmProcessor = await resolveUsfmProcessor(params.usfmProcessor)
  return usfmProcessor.processUSFM(usfmText, bookId, bookName, opts)
}
