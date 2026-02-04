/**
 * Auto-registration for internal resource types
 * 
 * This utility automatically discovers and registers all resource types
 * defined in the `src/resourceTypes/` directory.
 * 
 * Each resource type directory should export a `ResourceTypeDefinition`
 * from its `index.ts` file.
 */

import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'

/**
 * Automatically register all internal resource types
 * 
 * This function uses Vite's `import.meta.glob` to dynamically discover
 * and import all resource type modules.
 * 
 * @param registry The resource type registry to register with
 */
export async function autoRegisterResourceTypes(
  registry: ResourceTypeRegistry
): Promise<void> {
  // Use Vite's glob import to find all resource type index files
  // Excludes this autoRegister.ts file and any test files
  const resourceTypeModules = import.meta.glob<{
    [key: string]: any
  }>('./**/index.ts', {
    eager: false, // Lazy load to handle errors gracefully
  })

  const registrationPromises: Promise<void>[] = []

  for (const [path, importFn] of Object.entries(resourceTypeModules)) {
    // Skip this file and the main index.ts
    if (path.includes('autoRegister') || path === './index.ts') continue
    
    registrationPromises.push(
      (async () => {
        try {
          const module = await importFn()
          
          // Look for exported resource type definitions
          // Convention: export should be named `{name}ResourceType`
          for (const [key, value] of Object.entries(module)) {
            if (
              key.endsWith('ResourceType') &&
              value &&
              typeof value === 'object' &&
              'id' in value &&
              'displayName' in value
            ) {
              // This looks like a ResourceTypeDefinition
              console.log(`[AutoRegister] Registering internal resource type: ${value.id}`)
              registry.register(value)
            }
          }
        } catch (error) {
          console.warn(`[AutoRegister] Failed to load resource type from ${path}:`, error)
        }
      })()
    )
  }

  await Promise.all(registrationPromises)
}

/**
 * Get a list of all internal resource type paths
 * (useful for debugging)
 */
export function listInternalResourceTypes(): string[] {
  const resourceTypeModules = import.meta.glob('./**/index.ts', {
    eager: false,
  })

  return Object.keys(resourceTypeModules)
    .filter((path) => !path.includes('autoRegister'))
    .map((path) => path.replace('./', 'src/resourceTypes/'))
}
