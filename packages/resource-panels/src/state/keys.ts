/**
 * Canonical STATE keys used by BT Synergy resource viewers.
 *
 * STATE messages supersede by `stateKey` (latest wins per key). Multi-publisher
 * channels use **per-publisher keys** (TN vs TWL) so writers never last-writer-wins
 * each other; receivers merge. Single-stream channels (`SCRIPTURE_TOKENS`) use a
 * **single-owner policy** enforced by the app (see tc-study scriptureTokensOwnership).
 */
export const RESOURCE_STATE_KEYS = {
  /** Scripture viewer → helps/words: current verse-range tokens (single owner) */
  SCRIPTURE_TOKENS: 'current-scripture-tokens',
  /** Translation Notes → scripture underline groups */
  NOTES_TOKEN_GROUPS_TN: 'current-notes-token-groups-tn',
  /** Translation Words Links → scripture underline groups */
  NOTES_TOKEN_GROUPS_TWL: 'current-notes-token-groups-twl',
  /** TN / CombinedHelps (tn rows) → OBS frame quote underlining */
  OBS_FRAME_QUOTES_TN: 'current-obs-frame-quotes-tn',
  /** TWL / CombinedHelps (twl rows) → OBS frame quote underlining */
  OBS_FRAME_QUOTES_TWL: 'current-obs-frame-quotes-twl',
} as const

export type ResourceStateKey =
  (typeof RESOURCE_STATE_KEYS)[keyof typeof RESOURCE_STATE_KEYS]

/** OBS quote keys that ObsViewer merges (TN + TWL). */
export const OBS_FRAME_QUOTES_KEYS = [
  RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TN,
  RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TWL,
] as const

export type ObsFrameQuotesStateKey = (typeof OBS_FRAME_QUOTES_KEYS)[number]
