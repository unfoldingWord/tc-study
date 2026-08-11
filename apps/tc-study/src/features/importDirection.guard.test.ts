/**
 * Static guard: features/ must not import from components/ (inverted deps).
 * Allowlist covers viewer composition seams that intentionally stay in components.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FEATURES_ROOT = import.meta.dir

/** Relative to src/features/ — intentional composition over component viewers. */
const ALLOWLIST = new Set([
  'read/resolveViewerForResource.tsx',
])

const IMPORT_SPEC_RE = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g

function isTestFile(rel: string): boolean {
  return rel.includes('.test.') || rel.includes('__tests__') || rel.endsWith('.guard.test.ts')
}

function importsComponents(spec: string): boolean {
  if (!spec.startsWith('.')) return false
  // Match ../../components/... or ../components/... style relative paths
  return /(^|\/)components(\/|$)/.test(spec)
}

describe('features import direction', () => {
  test('features/** must not import from components/** (except allowlist)', async () => {
    const glob = new Glob('**/*.{ts,tsx}')
    const offenders: string[] = []

    for await (const path of glob.scan(FEATURES_ROOT)) {
      const rel = path.replace(/\\/g, '/')
      if (isTestFile(rel)) continue
      if (ALLOWLIST.has(rel)) continue

      const src = readFileSync(join(FEATURES_ROOT, path), 'utf8')
      IMPORT_SPEC_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = IMPORT_SPEC_RE.exec(src))) {
        const spec = match[1]!
        if (importsComponents(spec)) {
          offenders.push(`${rel} → ${spec}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
