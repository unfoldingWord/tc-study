/**
 * ResourceContentVerifier
 *
 * Verifies which ingredient files actually exist at the ref a resource will be
 * fetched from (prod tag or master branch).  The catalog's ingredient list can
 * include files that are absent from a published release tag, causing 404s when
 * the loader tries to fetch them.
 *
 * Only book-structured scripture resources are verified; entry-structured
 * resources (TW, TA, OBS) and combined-helps are always returned as-is.
 *
 * Results are cached in memory for the session (keyed by resourceKey@ref) so
 * the git/trees call is only made once per resource per session.
 *
 * Performance notes:
 * - The caller should pass `knownRef` (from ResourceMetadata.release.tag_name or
 *   default_branch) to avoid a redundant findRepository network call.
 * - The cache is keyed by `${resourceKey}@${ref}` and the promise is stored
 *   immediately on the first call, so parallel calls for the same resource
 *   share one in-flight request.
 */

import type { Door43ApiClient } from '@bt-synergy/door43-api'
import type { ResourceInfo } from '../../contexts/types'

export interface VerifyResult {
  /** Ingredients confirmed to exist at the fetched ref, or full ingredient list on failure. */
  verifiedIngredients: ResourceInfo['ingredients']
  /** The ref (tag or branch) that was verified against. */
  verifiedRef: string
  /** Whether the git/trees fetch succeeded.  false means fail-open (all ingredients kept). */
  treeFetched: boolean
}

type IngredientItem = NonNullable<ResourceInfo['ingredients']>[number]

// Session-level cache: key = `${resourceKey}@${ref}`
const verifyCache = new Map<string, Promise<VerifyResult>>()

/**
 * Skip verification for resource types that don't have book-level files
 * at a prod tag (TW, TA, OBS, combined-helps).
 *
 * Bible-scope book-companion types (notes = TN, words-links = TWL,
 * questions = TQ) have per-book files and MUST be verified, even though
 * their contentStructure is set to 'entry' during Phase 1 loading.
 * Only their OBS variants (obs-tn, obs-twl, obs-tq) should be skipped.
 */
function shouldSkipVerification(resource: ResourceInfo): boolean {
  const subject = String(resource.subject ?? '').toLowerCase()
  const category = String(resource.category ?? '').toLowerCase()
  const type = String(resource.type ?? '').toLowerCase()

  // Bible-scope book-companion types must be verified regardless of contentStructure
  if (type === 'notes' || type === 'words-links' || type === 'questions') {
    // Skip OBS variants only
    return subject.includes('obs') || subject.includes('open bible stories')
  }

  // For all other resources, skip if entry-structured
  if (resource.contentStructure && resource.contentStructure !== 'book') return true

  if (subject.includes('open bible stories') || subject.includes('obs')) return true
  if (category === 'obs' || type === 'obs') return true
  if (subject.includes('translation words') || subject.includes('translation academy')) return true

  return false
}

/**
 * Resolve owner, repoName and ingredient list from a ResourceInfo.
 * Returns null if the resource key is not in the expected `owner/lang/id` format.
 */
function parseResourceInfo(
  resource: ResourceInfo
): { owner: string; repoName: string; ingredients: IngredientItem[] } | null {
  const key = resource.key ?? resource.id ?? resource.resourceKey
  if (!key) return null
  const parts = String(key).split('/')
  if (parts.length !== 3) return null
  const [owner, language, resourceId] = parts
  const repoName = `${language}_${resourceId}`
  const ingredients = resource.ingredients ?? []
  return { owner, repoName, ingredients }
}

/**
 * Verify which ingredients in `resource` are actually present at the ref that
 * the ScriptureLoader will use.  Returns a `VerifyResult`; on any error the
 * full ingredient list is returned with `treeFetched: false`.
 *
 * @param resource  - The ResourceInfo whose ingredients to verify.
 * @param client    - A Door43ApiClient instance with `fetchRepoTreePaths` available.
 * @param knownRef  - The prod tag or branch already known from ResourceMetadata
 *                    (avoids a redundant findRepository network call).
 */
export async function verifyResourceContents(
  resource: ResourceInfo,
  client: Door43ApiClient,
  knownRef?: string
): Promise<VerifyResult> {
  if (shouldSkipVerification(resource)) {
    return {
      verifiedIngredients: resource.ingredients ?? [],
      verifiedRef: '',
      treeFetched: false,
    }
  }

  const parsed = parseResourceInfo(resource)
  if (!parsed || !parsed.ingredients.length) {
    return {
      verifiedIngredients: resource.ingredients ?? [],
      verifiedRef: '',
      treeFetched: false,
    }
  }

  const { owner, repoName, ingredients } = parsed
  const resourceKey = resource.key ?? resource.id

  // If the caller already knows the ref, skip the findRepository round-trip.
  // Otherwise fall back to a network lookup (same logic as ScriptureLoader).
  let ref = knownRef ?? ''
  if (!ref) {
    try {
      const repo = await client.findRepository(owner, repoName, 'prod')
      ref = repo?.release?.tag_name ?? repo?.default_branch ?? 'master'
    } catch {
      return { verifiedIngredients: ingredients, verifiedRef: '', treeFetched: false }
    }
  }

  const cacheKey = `${resourceKey}@${ref}`

  // Store the promise immediately so parallel calls share one in-flight request.
  if (verifyCache.has(cacheKey)) {
    return verifyCache.get(cacheKey)!
  }

  const promise = (async (): Promise<VerifyResult> => {
    try {
      const treePaths = await client.fetchRepoTreePaths(owner, repoName, ref)

      const verified = ingredients.filter((ing) => {
        if (!ing.path) return true // no path info — keep
        const normalized = ing.path.replace(/^\.\//, '')
        return treePaths.has(normalized)
      })

      return { verifiedIngredients: verified, verifiedRef: ref, treeFetched: true }
    } catch {
      // Fail open — don't hide books just because the tree fetch failed
      return { verifiedIngredients: ingredients, verifiedRef: ref, treeFetched: false }
    }
  })()

  verifyCache.set(cacheKey, promise)
  return promise
}

/** Clear the session cache (e.g. during tests or when resources change). */
export function clearVerifyCache(): void {
  verifyCache.clear()
}
