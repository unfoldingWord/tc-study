/**
 * Linked-panels word identity — authoritative USJ contract (Pipeline 2026-08-12).
 *
 * Match key: `${verseRef}:${content}:${occurrence}`
 * Prefer UsjWordToken.semanticId from UsjScriptureViewModel; do not invent a new schema.
 */

import {
  semanticIdFor,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'

export { semanticIdFor }
export type { UsjWordToken }

/** Case-insensitive key for Set membership / highlight matching. */
export function semanticIdKey(semanticId: string): string {
  return semanticId.toLowerCase()
}

/** Highlightable token fields used by VerseRenderer / tokenHighlight. */
export type ScriptureRenderToken = Pick<
  UsjWordToken,
  'semanticId' | 'content' | 'occurrence' | 'verseRef' | 'alignedOriginalWordIds'
>
