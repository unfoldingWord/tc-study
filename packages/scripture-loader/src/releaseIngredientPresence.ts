/**
 * Re-export release-absent helpers from resource-catalog (shared with TSV/helps loaders).
 * @deprecated Import from `@bt-synergy/resource-catalog` directly.
 */
export {
  ABSENT_FROM_RELEASE_KEY,
  normalizeIngredientPath,
  ingredientPresentInPathSet,
  partitionIngredientsByReleasePaths,
  pathSetFromZipFileNames,
  omitAbsentIngredients,
  readAbsentFromRelease,
  mergeAbsentFromReleaseIds,
  presentIngredientCount,
  persistAbsentFromRelease,
  fetchReleasePathSet,
  type IngredientPathRef,
} from '@bt-synergy/resource-catalog'
