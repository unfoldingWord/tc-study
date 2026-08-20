/**
 * Linked-panels word identity — Pipeline contract (2026-08-12).
 * Match key: \`${verseRef}:${content}:${occurrence}\`
 */
import { semanticIdFor, type UsjWordToken } from '@bt-synergy/scripture-loader'

export { semanticIdFor }
export type { UsjWordToken }

export function semanticIdKey(semanticId: string): string {
  return semanticId.toLowerCase()
}

export type ScriptureRenderToken = Pick<
  UsjWordToken,
  'semanticId' | 'content' | 'occurrence' | 'verseRef' | 'alignedOriginalWordIds'
>
