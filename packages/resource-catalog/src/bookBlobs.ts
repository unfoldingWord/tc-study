/**
 * Per-book git blob shas in the catalog row.
 *
 * Derived cache rows (helps-quote, helps-align) are stamped with the sha of the book's own
 * file instead of the release, so a release that did not touch a book leaves its rows valid.
 * A download records the shas once per release tag; `bookContentStamp` reads them.
 */

import { normalizeIngredientPath, type IngredientPathRef } from './releaseIngredientPresence'

/**
 * For each ingredient with an identifier, the sha of its file in the release tree.
 * Books absent from the tree, and blobs the tree gave no sha for (`''`), are left out so
 * their stamp falls back to the release stamp.
 */
export function bookBlobsFromTree(
  tree: ReadonlyMap<string, string>,
  ingredients: ReadonlyArray<IngredientPathRef>
): Record<string, string> {
  const blobs: Record<string, string> = {}
  for (const ingredient of ingredients) {
    const book = ingredient.identifier?.trim().toLowerCase()
    const path = normalizeIngredientPath(ingredient.path)
    if (!book || !path) continue
    const sha = tree.get(path)
    if (sha) blobs[book] = sha
  }
  return blobs
}

type BlobsRow = {
  owner?: string
  language?: string
  resourceId?: string
  version?: string
  release?: { tag_name?: string }
  locations?: Array<{ path?: string }>
  contentMetadata?: {
    ingredients?: IngredientPathRef[]
    bookBlobs?: Record<string, string>
    bookBlobsRef?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Repository name: the last segment of the row's network location, else `{language}_{id}`. */
function repoNameOf(row: BlobsRow): string | null {
  const fromLocation = row.locations?.[0]?.path?.split('/').filter(Boolean).pop()
  if (fromLocation) return fromLocation
  return row.language && row.resourceId ? `${row.language}_${row.resourceId}` : null
}

/**
 * Read the release tree once and write each book's blob sha onto the catalog row.
 * `current` when the row already holds blobs read at its release tag; `skipped` when there
 * is nothing to record or Door43 could not be asked. Never throws: stamps then simply fall
 * back to the release stamp.
 */
export async function recordBookBlobs(o: {
  door43Client:
    | {
        fetchRepoTreeBlobs?(owner: string, repo: string, ref: string): Promise<Map<string, string>>
      }
    | null
    | undefined
  catalogAdapter: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
  }
  resourceKey: string
}): Promise<'recorded' | 'current' | 'skipped'> {
  try {
    const row = (await o.catalogAdapter.get(o.resourceKey)) as BlobsRow | null | undefined
    if (!row || typeof row !== 'object') return 'skipped'

    // Same tag `resourceContentStamp` reads
    const tag = row.release?.tag_name?.trim() || row.version?.trim() || ''
    if (!tag) return 'skipped'
    if (row.contentMetadata?.bookBlobsRef === tag) return 'current'

    const client = o.door43Client
    const ingredients = (row.contentMetadata?.ingredients ?? []).filter((i) => i.identifier)
    const repo = repoNameOf(row)
    if (!client?.fetchRepoTreeBlobs || ingredients.length === 0 || !row.owner || !repo) {
      return 'skipped'
    }

    const tree = await client.fetchRepoTreeBlobs(row.owner, repo, tag)
    const bookBlobs = bookBlobsFromTree(tree, ingredients)
    if (Object.keys(bookBlobs).length === 0) return 'skipped'

    await o.catalogAdapter.set(o.resourceKey, {
      ...row,
      contentMetadata: { ...row.contentMetadata, bookBlobs, bookBlobsRef: tag },
    })
    return 'recorded'
  } catch {
    return 'skipped'
  }
}
