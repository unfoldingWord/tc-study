/**
 * Catalog ingredients can list books that are absent from a published release
 * tag (Door43 catalog vs git tree mismatch). Treat those as release-absent —
 * not download failures — so completeness can settle without re-fetching zips.
 */

export const ABSENT_FROM_RELEASE_KEY = 'absentFromRelease' as const

export type IngredientPathRef = {
  identifier?: string
  path?: string
}

/** Normalize ingredient path for zip/tree membership checks. */
export function normalizeIngredientPath(path: string | undefined | null): string | null {
  if (!path || typeof path !== 'string') return null
  return path.replace(/^\.\//, '')
}

/** True when a zip/tree path set contains this ingredient file. */
export function ingredientPresentInPathSet(
  ingredient: IngredientPathRef,
  pathSet: Set<string> | ReadonlySet<string>
): boolean {
  const normalized = normalizeIngredientPath(ingredient.path)
  if (!normalized) return true // no path — cannot prove absence
  if (pathSet.has(normalized)) return true
  for (const p of pathSet) {
    if (p.endsWith('/' + normalized) || p.endsWith(normalized)) return true
  }
  return false
}

/**
 * Split ingredients into those present in the release path set vs absent.
 * Ingredients without a path stay in `present` (fail-open).
 */
export function partitionIngredientsByReleasePaths<T extends IngredientPathRef>(
  ingredients: readonly T[],
  pathSet: Set<string> | ReadonlySet<string>
): { present: T[]; absent: T[] } {
  const present: T[] = []
  const absent: T[] = []
  for (const ingredient of ingredients) {
    if (ingredientPresentInPathSet(ingredient, pathSet)) present.push(ingredient)
    else absent.push(ingredient)
  }
  return { present, absent }
}

/** Build a path set from JSZip `files` keys (or any path list). */
export function pathSetFromZipFileNames(fileNames: Iterable<string>): Set<string> {
  const paths = new Set<string>()
  for (const name of fileNames) {
    if (!name || name.endsWith('/')) continue
    paths.add(name)
    const slash = name.lastIndexOf('/')
    if (slash >= 0) paths.add(name.slice(slash + 1))
  }
  return paths
}

/** Drop absent identifiers from an ingredient list (catalog prune). */
export function omitAbsentIngredients<T extends IngredientPathRef>(
  ingredients: readonly T[],
  absentIds: ReadonlySet<string>
): T[] {
  if (absentIds.size === 0) return [...ingredients]
  return ingredients.filter((ing) => {
    const id = ing.identifier?.toLowerCase()
    return !id || !absentIds.has(id)
  })
}

/** Read `absentFromRelease` ids from resource:{key} metadata (lowercased unique). */
export function readAbsentFromRelease(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return []
  const raw = (metadata as Record<string, unknown>)[ABSENT_FROM_RELEASE_KEY]
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of raw) {
    if (typeof id !== 'string' || !id) continue
    const lower = id.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    out.push(id)
  }
  return out
}

/** Merge prior + newly discovered absent ids (preserve first-seen casing). */
export function mergeAbsentFromReleaseIds(
  prior: readonly string[],
  next: readonly string[]
): string[] {
  const out = [...prior]
  const seen = new Set(prior.map((id) => id.toLowerCase()))
  for (const id of next) {
    if (typeof id !== 'string' || !id) continue
    const lower = id.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    out.push(id)
  }
  return out
}

/** Expected present count after excluding release phantoms. */
export function presentIngredientCount(
  ingredientCount: number,
  absentIds: readonly string[]
): number {
  return Math.max(0, ingredientCount - absentIds.length)
}

type CacheGetSet = {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
}

type CatalogSet = {
  set?: (key: string, value: unknown) => Promise<void>
}

type PrunableMetadata = {
  contentMetadata?: {
    ingredients?: IngredientPathRef[]
    books?: unknown
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Persist absent-from-release ids on `resource:{key}` and optionally prune
 * matching catalog ingredients so completeness walks stop expecting them.
 */
export async function persistAbsentFromRelease(options: {
  cacheAdapter: CacheGetSet
  catalogAdapter?: CatalogSet | null
  resourceKey: string
  /** Catalog metadata (ResourceMetadata or pruned shape). */
  metadata?: unknown
  absentIds: readonly string[]
  logLabel?: string
}): Promise<string[]> {
  const {
    cacheAdapter,
    catalogAdapter,
    resourceKey,
    metadata: metadataRaw,
    absentIds,
    logLabel = 'loader',
  } = options
  const metadata =
    metadataRaw && typeof metadataRaw === 'object'
      ? (metadataRaw as PrunableMetadata)
      : null
  if (absentIds.length === 0) return readAbsentFromRelease(
    ((await cacheAdapter.get(`resource:${resourceKey}`)) as { metadata?: unknown } | null)
      ?.metadata
  )

  const absentSet = new Set(absentIds.map((id) => id.toLowerCase()))
  if (catalogAdapter?.set && metadata?.contentMetadata?.ingredients?.length) {
    const ingredients = metadata.contentMetadata.ingredients
    const next = omitAbsentIngredients(ingredients, absentSet)
    if (next.length !== ingredients.length) {
      try {
        await catalogAdapter.set(resourceKey, {
          ...metadata,
          contentMetadata: {
            ...metadata.contentMetadata,
            ingredients: next,
            books: next.map((i) => i.identifier).filter(Boolean),
          },
        })
      } catch (error) {
        console.warn(
          `⚠️ [${logLabel}] Could not prune absent ingredients for ${resourceKey}:`,
          error
        )
      }
    }
  }

  const resourceCacheKey = `resource:${resourceKey}`
  const prior = (await cacheAdapter.get(resourceCacheKey)) as {
    content?: unknown
    metadata?: Record<string, unknown>
    type?: unknown
    cachedAt?: unknown
  } | null
  const priorAbsent = readAbsentFromRelease(prior?.metadata)
  const merged = mergeAbsentFromReleaseIds(priorAbsent, absentIds)
  await cacheAdapter.set(resourceCacheKey, {
    content: prior?.content ?? {},
    metadata: {
      ...(prior?.metadata && typeof prior.metadata === 'object' ? prior.metadata : {}),
      [ABSENT_FROM_RELEASE_KEY]: merged,
    },
    ...(prior?.type ? { type: prior.type } : {}),
    ...(prior?.cachedAt ? { cachedAt: prior.cachedAt } : {}),
  })
  return merged
}

/** Repo tree paths for a release — used to skip zip when only phantoms remain. */
export async function fetchReleasePathSet(
  door43Client: {
    fetchRepoTreePaths?: (
      owner: string,
      repoName: string,
      ref: string
    ) => Promise<Set<string> | string[] | null | undefined>
  } | null | undefined,
  owner: string,
  repoName: string,
  ref: string
): Promise<Set<string> | null> {
  const fetchPaths = door43Client?.fetchRepoTreePaths
  if (typeof fetchPaths !== 'function') return null
  try {
    const paths = await fetchPaths.call(door43Client, owner, repoName, ref)
    if (paths instanceof Set) return paths
    if (Array.isArray(paths)) return new Set(paths)
    return null
  } catch {
    return null
  }
}
