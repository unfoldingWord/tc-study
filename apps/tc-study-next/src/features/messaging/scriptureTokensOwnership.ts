/**
 * Single-owner policy for RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS.
 *
 * Multiple scripture viewers must not last-writer-wins the shared token stream.
 * Owner priority: lastActiveScriptureResourceId → anchorResourceId → none (bootstrap).
 *
 * When both lastActive and anchor are null, nobody may publish. ScriptureViewer
 * registers lastActive (and typically anchor) on mount; until then there is no
 * owner — avoids a multi-writer race during simultaneous first mounts.
 */

export interface ScriptureTokensOwnerInput {
  resourceId: string
  lastActiveScriptureResourceId: string | null
  anchorResourceId: string | null
}

/** True when this scripture resource may publish SCRIPTURE_TOKENS. */
export function isScriptureTokensOwner(input: ScriptureTokensOwnerInput): boolean {
  const { resourceId, lastActiveScriptureResourceId, anchorResourceId } = input
  if (lastActiveScriptureResourceId != null) {
    return lastActiveScriptureResourceId === resourceId
  }
  if (anchorResourceId != null) {
    return anchorResourceId === resourceId
  }
  // Bootstrap: no registered owner yet — deny all (single-owner until set)
  return false
}
