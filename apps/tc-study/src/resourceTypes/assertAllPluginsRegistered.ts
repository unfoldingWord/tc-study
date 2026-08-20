/**
 * Fail-closed completeness check for resource type plugin registration.
 *
 * Every id in `expectedIds` must appear in `registeredIds`. Incomplete
 * registration must throw so callers never mark `resourceTypesReady`.
 */
function assertExpectedIdsRegistered(
  label: string,
  expectedIds: readonly string[],
  registeredIds: readonly string[]
): void {
  const registered = new Set(registeredIds)
  const missing = expectedIds.filter((id) => !registered.has(id))
  if (missing.length > 0) {
    throw new Error(`${label} registration incomplete; missing ids: ${missing.join(', ')}`)
  }
}

export function assertAllPluginsRegistered(
  expectedIds: readonly string[],
  registeredIds: readonly string[]
): void {
  assertExpectedIdsRegistered('Resource type plugin', expectedIds, registeredIds)
}

export function assertAllCompositionsRegistered(
  expectedIds: readonly string[],
  registeredIds: readonly string[]
): void {
  assertExpectedIdsRegistered('Composition', expectedIds, registeredIds)
}

export function assertAllPanelEntriesRegistered(
  expectedIds: readonly string[],
  registeredIds: readonly string[]
): void {
  assertExpectedIdsRegistered('Panel entry', expectedIds, registeredIds)
}

export function assertAllPanelModesRegistered(
  expectedIds: readonly string[],
  registeredIds: readonly string[]
): void {
  assertExpectedIdsRegistered('Panel mode', expectedIds, registeredIds)
}

/**
 * Resolve required plugin defs from a module export map.
 * Fail-closed: every listed export name must yield a def with a string `id`.
 */
export function collectRequiredPluginDefs(
  exportNames: readonly string[],
  plugins: Record<string, unknown>
): Array<{ id: string }> {
  const missing: string[] = []
  const defs: Array<{ id: string }> = []

  for (const exportName of exportNames) {
    const def = plugins[exportName] as { id?: unknown } | undefined
    if (!def || typeof def.id !== 'string' || def.id.length === 0) {
      missing.push(exportName)
      continue
    }
    defs.push(def as { id: string })
  }

  if (missing.length > 0) {
    throw new Error(
      `Resource type plugin exports missing or invalid: ${missing.join(', ')}`
    )
  }

  return defs
}
