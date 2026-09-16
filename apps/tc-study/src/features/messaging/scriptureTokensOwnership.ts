/**
 * Single-owner policy for RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS.
 *
 * Multiple scripture viewers must not last-writer-wins the shared token stream.
 * Owner priority: lastActiveScriptureResourceId → anchorResourceId → none (bootstrap).
 *
 * When both lastActive and anchor are null, nobody may publish. ScriptureViewer
 * registers lastActive (and typically anchor) on mount; until then there is no
 * owner — avoids a multi-writer race during simultaneous first mounts.
 *
 * Mode-switch pitfall: switching the focused scripture panel back to helps can
 * leave lastActive === anchor === the unmounting id. Helps then never receives a
 * fresh SCRIPTURE_TOKENS publish (hydrate may also be empty after chapter nav)
 * and quote chips settle to ol-fallback until a full reload remounts scripture.
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

/**
 * Pick another loaded scripture instance to inherit SCRIPTURE_TOKENS ownership
 * when the current owner unmounts (helps mode-switch).
 */
export function pickSuccessorScriptureResourceId(
  leavingResourceId: string,
  candidateIds: Iterable<string>
): string | null {
  for (const id of candidateIds) {
    if (id && id !== leavingResourceId) return id
  }
  return null
}

/**
 * After a scripture viewer unmounts, never keep lastActive pointing at itself
 * (that happens when the leaving panel was also the anchor). Prefer anchor when
 * it is a different live id, else an explicit successor, else null so a still-
 * mounted scripture can reclaim.
 */
export function resolveLastActiveAfterScriptureUnmount(args: {
  leavingResourceId: string
  lastActiveScriptureResourceId: string | null
  anchorResourceId: string | null
  successorResourceId: string | null
}): string | null {
  const {
    leavingResourceId,
    lastActiveScriptureResourceId,
    anchorResourceId,
    successorResourceId,
  } = args
  if (lastActiveScriptureResourceId !== leavingResourceId) {
    return lastActiveScriptureResourceId
  }
  if (anchorResourceId && anchorResourceId !== leavingResourceId) {
    return anchorResourceId
  }
  return successorResourceId
}

/** True when lastActive/anchor points at a resource that is no longer live scripture. */
export function isOrphanScriptureTokensPointer(
  pointerId: string | null | undefined,
  liveScriptureResourceIds: ReadonlySet<string>
): boolean {
  if (pointerId == null || pointerId === '') return false
  return !liveScriptureResourceIds.has(pointerId)
}

/**
 * Still-mounted scripture should publish SCRIPTURE_TOKENS when lastActive was
 * cleared or left pointing at a removed panel (helps mode-switch).
 */
export function shouldClaimScriptureTokensOwnership(args: {
  resourceId: string
  lastActiveScriptureResourceId: string | null
  liveScriptureResourceIds: ReadonlySet<string>
}): boolean {
  if (!args.liveScriptureResourceIds.has(args.resourceId)) return false
  const last = args.lastActiveScriptureResourceId
  if (last == null) return true
  return isOrphanScriptureTokensPointer(last, args.liveScriptureResourceIds)
}
