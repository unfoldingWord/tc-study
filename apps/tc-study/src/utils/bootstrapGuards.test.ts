import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '..')

describe('bootstrapGuards', () => {
  test('App waits on useCatalogReady instead of window __catalogInitialized__', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    expect(app).toContain('useCatalogReady')
    expect(app).not.toContain('__catalogInitialized__')
  })

  test('catalogReady gate requires ResourceTypeInitializer reporting (not services alone)', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    const ctx = readFileSync(join(SRC, 'contexts/CatalogContext.tsx'), 'utf8')
    expect(app).toContain('<ResourceTypeInitializer')
    expect(ctx).toContain('resourceTypesReady')
    expect(ctx).toMatch(/servicesReady && resourceTypesReady/)
  })

  test('Read and Studio do not wrap NavigationProvider/AppProvider', () => {
    const read = readFileSync(join(SRC, 'pages/Read.tsx'), 'utf8')
    const studio = readFileSync(join(SRC, 'pages/Studio.tsx'), 'utf8')
    expect(read).not.toContain('NavigationProvider')
    expect(read).not.toContain('AppProvider')
    expect(studio).not.toContain('NavigationProvider')
    expect(studio).not.toContain('AppProvider')
  })

  test('App owns NavigationProvider and AppProvider once', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    expect(app).toContain('NavigationProvider')
    expect(app).toContain('AppProvider')
    const navCount = (app.match(/<NavigationProvider/g) || []).length
    const appCount = (app.match(/<AppProvider/g) || []).length
    expect(navCount).toBe(1)
    expect(appCount).toBe(1)
  })

  test('main-thread Door43 uses getDoor43ApiClient singleton (CatalogContext not new)', () => {
    const ctx = readFileSync(join(SRC, 'contexts/CatalogContext.tsx'), 'utf8')
    expect(ctx).toContain('getDoor43ApiClient')
    expect(ctx).not.toMatch(/new\s+Door43ApiClient\s*\(/)
    // Workers may construct their own lifetime; only main-thread CatalogContext is gated here
    const worker = readFileSync(join(SRC, 'workers/backgroundDownload.worker.ts'), 'utf8')
    expect(worker).toMatch(/new\s+Door43ApiClient\s*\(/)
  })
})

