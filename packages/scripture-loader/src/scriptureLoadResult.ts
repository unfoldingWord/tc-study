/**
 * First-class loader result for Viewer (view model) + Helps (ProcessedScripture).
 */

import type { ProcessedScripture, UsjScriptureViewModel } from '@bt-synergy/usj-processor'

export interface ScriptureLoadResult {
  /** Preferred runtime SoT view (identity + alignments). */
  viewModel: UsjScriptureViewModel
  /**
   * Transitional projection for CombinedHelps / TokenRenderer.
   * Same identity fields via wordTokens; sunset when UI migrates.
   */
  scripture: ProcessedScripture
  /** True when rebuilt from scripture-usj: cache (real USJ + AlignmentMap). */
  fromUsjCache: boolean
}
