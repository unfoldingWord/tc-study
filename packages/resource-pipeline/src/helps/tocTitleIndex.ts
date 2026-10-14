/**
 * Memoized TOC title index built once per resourceKey@stamp.
 * Replaces per-title linear ingredients.find() scans.
 */

export interface TocIngredient {
  identifier?: string
  path?: string
  title?: string
}

const tocIndexCache = new Map<string, Map<string, string>>()

function normalizePath(path: string): string {
  return path.replace(/\.md$/i, '')
}

/**
 * Index titles by:
 * - identifier
 * - path without .md
 * - trailing two segments of identifier (TW bible/category/term ↔ category/term)
 */
export function buildTocTitleIndex(ingredients: readonly TocIngredient[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const ing of ingredients) {
    const title = ing.title?.trim()
    if (!title) continue

    if (ing.identifier) {
      index.set(ing.identifier, title)
      const parts = ing.identifier.split('/')
      if (parts.length >= 2) {
        index.set(`${parts[parts.length - 2]}/${parts[parts.length - 1]}`, title)
      }
    }
    if (ing.path) {
      index.set(normalizePath(ing.path), title)
    }
  }
  return index
}

export function getCachedTocTitleIndex(
  resourceKey: string,
  stamp: string,
  ingredients: readonly TocIngredient[] | null | undefined
): Map<string, string> | null {
  if (!ingredients?.length) return null
  const cacheKey = `${resourceKey}@${stamp}`
  const hit = tocIndexCache.get(cacheKey)
  if (hit) return hit
  const index = buildTocTitleIndex(ingredients)
  tocIndexCache.set(cacheKey, index)
  return index
}

/** Test-only: drop memoized indexes. */
export function resetTocTitleIndexCache(): void {
  tocIndexCache.clear()
}

export function lookupTocTitle(
  index: Map<string, string>,
  articleId: string
): string | undefined {
  return index.get(articleId) ?? index.get(normalizePath(articleId))
}
