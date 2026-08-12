/**
 * Pure helpers for SCRIPTURE_TOKENS STATE shape (owner scripture → CombinedHelps).
 * Kept free of React so USJ soak / underline tests can exercise the same path.
 *
 * USJ-only: prefer UsjScriptureViewModel via scripture-loader helpers.
 */

export {
  extractUsjBroadcastTokens,
  type BroadcastScriptureToken,
} from '@bt-synergy/scripture-loader'

/** @deprecated Prefer extractUsjBroadcastTokens(viewModel, …) */
export { extractUsjBroadcastTokens as extractOptimizedTokens } from '@bt-synergy/scripture-loader'
