/**
 * Arch guard: resource-types must not depend on resource-panels.
 * Loader contracts use catalog ResourceMetadata SoT only.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PKG_JSON = join(import.meta.dir, '..', 'package.json')

describe('resource-types package boundary', () => {
  test('package.json does not depend on @bt-synergy/resource-panels', () => {
    const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8')) as {
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
