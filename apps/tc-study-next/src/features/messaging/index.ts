/**
 * App-level messaging ownership helpers.
 *
 * Container + STATE APIs live on `@bt-synergy/resource-panels` (single public
 * import surface). This barrel only exports tc-study ownership policy helpers
 * that sit above that package — not a second façade for linked-panels.
 */

export {
  isScriptureTokensOwner,
} from './scriptureTokensOwnership'
