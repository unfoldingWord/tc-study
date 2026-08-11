/**
 * Arch guard: @bt-synergy/resource-types must not depend on resource-panels.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RESOURCE_TYPES_PKG = join(
  import.meta.dir,
  '../../../../packages/resource-types/package.json'
)

describe('resource-types ↛ resource-panels', () => {
  test('workspace package.json has no resource-panels dependency', () => {
    const pkg = JSON.parse(readFileSync(RESOURCE_TYPES_PKG, 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    const all = {
      ...pkg.dependencies,
      ...pkg.peerDependencies,
      ...pkg.devDependencies,
    }

    expect(all['@bt-synergy/resource-panels']).toBeUndefined()
    expect(all['@bt-synergy/resource-catalog']).toBeDefined()
  })
})
