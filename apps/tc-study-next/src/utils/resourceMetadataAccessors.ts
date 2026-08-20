/**
 * Canonical accessors for resource metadata shapes (top-level vs legacy contentMetadata).
 */

export function getIngredients(resource: unknown): unknown[] | undefined {
  if (!resource || typeof resource !== 'object') return undefined
  const r = resource as Record<string, any>
  const ingredients = r.ingredients ?? r.contentMetadata?.ingredients
  return Array.isArray(ingredients) ? ingredients : undefined
}

export function getContentStructure(
  resource: unknown
): 'book' | 'entry' | string | undefined {
  if (!resource || typeof resource !== 'object') return undefined
  const r = resource as Record<string, any>
  return r.contentStructure ?? r.contentMetadata?.contentStructure
}
