import {
  compositionBaseKey,
  resourceMatchesConsumedType,
  type HelpsScope,
} from './compositionInjection'
import {
  compositionsForEnsure,
  matchesCompositionPersistId,
  type CompositionEnsureSpec,
} from './ensureCompositions'

export interface PanelResourceRef {
  key: string
  type?: string
}

function compositionsForScope(
  scope: HelpsScope,
  compositions: CompositionEnsureSpec[]
): CompositionEnsureSpec[] {
  return compositions.filter((c) => (c.groupId ?? c.scope ?? 'scripture') === scope)
}

function presentCompositionKeys(
  resources: PanelResourceRef[],
  compositions: CompositionEnsureSpec[]
): string[] {
  const keys: string[] = []
  for (const composition of compositions) {
    if (!composition.persistId) continue
    for (const r of resources) {
      if (matchesCompositionPersistId(r.key, composition.persistId) && !keys.includes(r.key)) {
        keys.push(r.key)
      }
    }
  }
  return keys
}

/**
 * Shared Read/Studio policy: prefer composition persist ids and do not paint
 * raw consumed resource keys when a composition instance is present.
 *
 * hideConsumed is not ownership — this is a residual for stale membership only.
 */
export function orderHelpsPanelKeys(
  resources: PanelResourceRef[],
  scope: HelpsScope,
  compositions: CompositionEnsureSpec[] = compositionsForEnsure()
): { visibleKeys: string[]; activeKey: string | null; hiddenKeys: string[] } {
  const scoped = compositionsForScope(scope, compositions)
  const preferred = presentCompositionKeys(resources, scoped)
  const hideTypes = new Set<string>()
  for (const composition of scoped) {
    if (!preferred.some((key) => composition.persistId && matchesCompositionPersistId(key, composition.persistId))) {
      continue
    }
    for (const typeId of composition.consumes) hideTypes.add(typeId)
  }

  const hiddenKeys: string[] = []
  const visibleKeys: string[] = []

  const typeByBase = new Map<string, string>()
  for (const r of resources) {
    if (!r.type) continue
    typeByBase.set(compositionBaseKey(r.key), r.type)
  }

  for (const r of resources) {
    const isPreferred = preferred.includes(r.key)
    const type = r.type ?? typeByBase.get(compositionBaseKey(r.key))
    const isConsumed =
      !isPreferred &&
      [...hideTypes].some((typeId) => resourceMatchesConsumedType(type, typeId))
    if (isConsumed) {
      hiddenKeys.push(r.key)
      continue
    }
    visibleKeys.push(r.key)
  }

  if (preferred.length > 0) {
    const presentPreferred = preferred.filter((k) => visibleKeys.includes(k))
    if (presentPreferred.length > 0) {
      const rest = visibleKeys.filter((k) => !presentPreferred.includes(k))
      return {
        visibleKeys: [...presentPreferred, ...rest],
        activeKey: presentPreferred[0] ?? null,
        hiddenKeys,
      }
    }
  }

  return {
    visibleKeys,
    activeKey: visibleKeys[0] ?? null,
    hiddenKeys,
  }
}

export function applyDualScopeHelpsPolicy(
  resources: PanelResourceRef[],
  compositions: CompositionEnsureSpec[] = compositionsForEnsure()
): {
  visibleKeys: string[]
  activeKey: string | null
  hiddenKeys: string[]
} {
  const scripture = orderHelpsPanelKeys(resources, 'scripture', compositions)
  const obs = orderHelpsPanelKeys(resources, 'obs', compositions)
  const hidden = new Set([...scripture.hiddenKeys, ...obs.hiddenKeys])
  const orderedPreferred = presentCompositionKeys(resources, compositions).filter(
    (id) => !hidden.has(id)
  )
  const rest = resources
    .map((r) => r.key)
    .filter((k) => !hidden.has(k) && !orderedPreferred.includes(k))
  const visibleKeys = [...orderedPreferred, ...rest]
  return {
    visibleKeys,
    activeKey: orderedPreferred[0] ?? visibleKeys[0] ?? null,
    hiddenKeys: [...hidden],
  }
}
