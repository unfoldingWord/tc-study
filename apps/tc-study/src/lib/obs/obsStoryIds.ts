/**
 * OBS story id resolution shared by ObsLoader prefetch and completeness checks.
 *
 * Door43 OBS catalog entries are usually a single directory ingredient
 * (`identifier: "obs", path: "./content", is_dir: true`). Prefetch still
 * stores per-story keys `obs:{resourceKey}:{01..50}` — completeness must
 * expand the same way or the receipt never marks complete and bg-dl loops.
 */

import { normalizeObsStoryId } from './parseObsMarkdown'

/** Canonical OBS story count (Open Bible Stories). */
export const OBS_STORY_COUNT = 50

/**
 * Story ids to prefetch / verify for an OBS resource.
 * Prefer numeric ingredient identifiers; otherwise expand to 01..50 when any
 * ingredients exist (directory-only manifests). Empty ingredients → [].
 */
export function resolveObsStoryIds(
  ingredients: Array<{ identifier?: string }> | null | undefined
): string[] {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return []

  const numeric: string[] = []
  for (const ing of ingredients) {
    const id = ing.identifier
    if (id != null && /^\d+$/.test(String(id))) {
      numeric.push(normalizeObsStoryId(String(id)))
    }
  }
  if (numeric.length > 0) {
    return [...new Set(numeric)]
  }

  return Array.from({ length: OBS_STORY_COUNT }, (_, i) =>
    normalizeObsStoryId(String(i + 1))
  )
}

/** Cache key written by ObsLoader for a story blob. */
export function obsStoryCacheKey(resourceKey: string, storyId: string): string {
  return `obs:${resourceKey}:${normalizeObsStoryId(storyId)}`
}
