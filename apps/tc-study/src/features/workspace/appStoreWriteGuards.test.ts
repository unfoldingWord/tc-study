/**
 * Banlist: AppStore membership writes stay sealed (Unlock 3).
 * Layout mutations → resourceMutations → workspace → projector →
 * `appStoreMembership`. Runtime enrichment patches-by-key only
 * (`patchLoadedResources`) — never invents membership.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC_ROOT = join(import.meta.dir, '../..')

/**
 * Production files allowed to call sealed membership helpers or
 * (legacy) AppStore add/remove membership APIs. Keep minimal: membership
 * module + projector only.
 */
const MEMBERSHIP_WRITE_ALLOWLIST = new Set([
  'features/workspace/appStoreMembership.ts',
  'features/workspace/projectPanelResourcesToAppStore.ts',
])

/** Production files allowed to import `appStoreMembership`. */
const MEMBERSHIP_MODULE_IMPORT_ALLOWLIST = new Set([
  'features/workspace/appStoreMembership.ts',
  'features/workspace/projectPanelResourcesToAppStore.ts',
])

function hasAppStoreMembershipWrite(src: string): boolean {
  // Retired public store membership APIs — must not reappear as callers
  if (/useAppStore\.getState\(\)\.(addResource|addResources|removeResource)\b/.test(src)) {
    return true
  }
  if (/useAppStore\s*\(\s*(?:state|s)\s*=>\s*(?:state|s)\.(addResource|addResources|removeResource)\b/.test(src)) {
    return true
  }
  if (
    /useAppStore\.getState\(\)/.test(src) &&
    /\b(addResource|addResources|removeResource)\b/.test(src)
  ) {
    if (/useAppStore\.getState\(\)[\s\S]{0,80}\b(addResource|addResources|removeResource)\b/.test(src)) {
      return true
    }
  }
  // Sealed membership helpers — only allowlisted production files
  if (
    /\b(upsertLoadedResourceMembership|removeLoadedResourceMembership)\s*\(/.test(src)
  ) {
    return true
  }
  return false
}

function importsAppStoreMembership(src: string): boolean {
  return /from\s+['"][^'"]*appStoreMembership['"]/.test(src)
}

describe('appStoreWriteGuards', () => {
  test('public AppStore surface has no membership mutators', () => {
    const app = readFileSync(join(SRC_ROOT, 'contexts/AppContext.tsx'), 'utf8')
    expect(app).not.toMatch(/\baddResource\s*:/)
    expect(app).not.toMatch(/\baddResources\s*:/)
    expect(app).not.toMatch(/\bremoveResource\s*:/)
    expect(app).toContain('patchLoadedResources')
    expect(app).toMatch(/never stub-create|Membership must come from the projector/)
  })

  test('workspace store slices do not import or write useAppStore', () => {
    const facade = readFileSync(join(SRC_ROOT, 'features/workspace/workspaceStore.ts'), 'utf8')
    const reexport = readFileSync(join(SRC_ROOT, 'lib/stores/workspaceStore.ts'), 'utf8')
    const projection = readFileSync(
      join(SRC_ROOT, 'features/workspace/workspaceProjection.ts'),
      'utf8'
    )
    const slices = [
      'workspacePackageSlice.ts',
      'workspacePanelSlice.ts',
      'workspaceResourceSlice.ts',
      'workspacePersistence.ts',
    ]
    const wizardStore = readFileSync(join(SRC_ROOT, 'features/wizard/wizardStore.ts'), 'utf8')
    expect(wizardStore).not.toContain('useAppStore')
    expect(facade).not.toContain('useAppStore')
    expect(reexport).not.toContain('useAppStore')
    expect(projection).toContain('projectPanelResourcesToAppStore')
    expect(projection).not.toContain('useAppStore')
    for (const file of slices) {
      const src = readFileSync(join(SRC_ROOT, 'features/workspace', file), 'utf8')
      expect(src).not.toContain('useAppStore')
    }
  })

  test('membership writes are limited to allowlist', async () => {
    const glob = new Glob('**/*.{ts,tsx}')
    const offenders: string[] = []

    for await (const rel of glob.scan({ cwd: SRC_ROOT })) {
      const norm = rel.replace(/\\/g, '/')
      if (norm.includes('.test.') || norm.includes('__tests__')) continue
      if (norm.includes('node_modules')) continue
      if (MEMBERSHIP_WRITE_ALLOWLIST.has(norm)) continue

      const src = readFileSync(join(SRC_ROOT, rel), 'utf8')
      if (hasAppStoreMembershipWrite(src)) {
        offenders.push(norm)
      }
    }

    expect(offenders).toEqual([])
  })

  test('appStoreMembership imports limited to projector', async () => {
    const glob = new Glob('**/*.{ts,tsx}')
    const offenders: string[] = []

    for await (const rel of glob.scan({ cwd: SRC_ROOT })) {
      const norm = rel.replace(/\\/g, '/')
      if (norm.includes('.test.') || norm.includes('__tests__')) continue
      if (norm.includes('node_modules')) continue
      if (MEMBERSHIP_MODULE_IMPORT_ALLOWLIST.has(norm)) continue

      const src = readFileSync(join(SRC_ROOT, rel), 'utf8')
      if (importsAppStoreMembership(src)) {
        offenders.push(norm)
      }
    }

    expect(offenders).toEqual([])
  })

  test('allowlist stays projector-only (no loadReadLanguageCatalog / resourceMutations dual-writes)', () => {
    expect(MEMBERSHIP_WRITE_ALLOWLIST.has('features/read/loadReadLanguageCatalog.ts')).toBe(false)
    expect(MEMBERSHIP_WRITE_ALLOWLIST.has('features/workspace/resourceMutations.ts')).toBe(false)
    expect(MEMBERSHIP_WRITE_ALLOWLIST.has('contexts/AppContext.tsx')).toBe(false)
    const catalog = readFileSync(join(SRC_ROOT, 'features/read/loadReadLanguageCatalog.ts'), 'utf8')
    expect(catalog).toContain('patchLoadedResources')
    expect(catalog).not.toMatch(/\.addResources?\s*\(/)
    expect(catalog).not.toContain('upsertLoadedResourceMembership')
    const mutations = readFileSync(join(SRC_ROOT, 'features/workspace/resourceMutations.ts'), 'utf8')
    expect(mutations).not.toMatch(/useAppStore\.getState\(\)\.(addResource|removeResource)\b/)
    expect(mutations).not.toContain('upsertLoadedResourceMembership')
    expect(mutations).not.toContain('removeLoadedResourceMembership')
  })

  test('setAnchorResource does not stub-create missing resources', () => {
    const app = readFileSync(join(SRC_ROOT, 'contexts/AppContext.tsx'), 'utf8')
    expect(app).not.toMatch(/loadedResources\[resourceId\]\s*=\s*\{/)
    expect(app).toMatch(/never stub-create|Membership must come from the projector/)
  })

  test('applyCombinedHelpsEnsure projects via resourceMutations (not selective membership write)', () => {
    const apply = readFileSync(
      join(SRC_ROOT, 'features/helps/applyCombinedHelpsEnsure.ts'),
      'utf8'
    )
    expect(apply).toContain('projectCurrentWorkspacePanels')
    expect(apply).not.toMatch(/addResource\s*\(/)
    expect(apply).not.toContain('upsertLoadedResourceMembership')
  })

  test('projector uses sealed membership module (not public store actions)', () => {
    const projector = readFileSync(
      join(SRC_ROOT, 'features/workspace/projectPanelResourcesToAppStore.ts'),
      'utf8'
    )
    expect(projector).toContain('upsertLoadedResourceMembership')
    expect(projector).toContain('removeLoadedResourceMembership')
    expect(projector).not.toMatch(/\.addResource\s*\(/)
    expect(projector).not.toMatch(/\.removeResource\s*\(/)
  })
})
