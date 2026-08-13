import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

const FORBIDDEN = [
  '__catalogManager__',
  '__resourceTypesInitialized__',
  '__migrateResourceIngredients__',
  '__catalogInitialized__',
]

describe('windowGlobalsGuards', () => {
  test('production src has no window bootstrap/migration flags', async () => {
    const glob = new Glob('**/*.{ts,tsx}')
    const offenders: string[] = []
    for await (const path of glob.scan(ROOT)) {
      const rel = path.replace(/\\/g, '/')
      if (rel.includes('.test.') || rel.includes('__tests__')) continue
      if (rel.includes('node_modules')) continue
      const src = readFileSync(join(ROOT, path), 'utf8')
      for (const flag of FORBIDDEN) {
        if (src.includes(flag)) {
          offenders.push(`${rel} contains ${flag}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
