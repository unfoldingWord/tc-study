/**
 * @bt-synergy/scripture-resource
 * 
 * Scripture resource type definition with v2.0 API (automatic enhancement).
 * 
 * Pattern: Viewers stay in the app (need app context), resource definitions in packages.
 * 
 * @example
 * ```typescript
 * // In your app:
 * import { createScriptureResourceType } from '@bt-synergy/scripture-resource'
 * import { ScriptureViewer } from './components/resources/ScriptureViewer'
 * 
 * export const scriptureResourceType = createScriptureResourceType(ScriptureViewer)
 * 
 * // Register:
 * resourceTypeRegistry.register(scriptureResourceType)
 * ```
 */

// Factory function - provide your viewer, get back complete resource type
export { createScriptureResourceType } from './createResourceType'

// Loader (if needed separately)
export { ScriptureLoader } from './loader'

// Signal types
export * from './signals'

// For convenience, also export the resource type definition itself
// (but apps should use createScriptureResourceType instead)
export { scriptureResourceType } from './resourceType'

