import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '..')

describe('catalogReadiness', () => {
  test('CatalogContext splits servicesReady vs resourceTypesReady; ready requires both', () => {
    const ctx = readFileSync(join(SRC, 'contexts/CatalogContext.tsx'), 'utf8')
    expect(ctx).toContain('servicesReady: boolean')
    expect(ctx).toContain('resourceTypesReady: boolean')
    expect(ctx).toContain('resourceTypesError: Error | null')
    expect(ctx).toContain('ready: boolean')
    expect(ctx).toContain('markResourceTypesReady')
    expect(ctx).toContain('markResourceTypesFailed')
    expect(ctx).toContain('export function useCatalogReady')
    expect(ctx).toContain('return useCatalog().ready')
    expect(ctx).toMatch(/const ready = servicesReady && resourceTypesReady/)
    expect(ctx).toMatch(/setServicesReady\(true\)/)
    // Must not treat services construction alone as catalog ready
    expect(ctx).not.toMatch(/setReady\(true\)/)
  })

  test('ResourceTypeInitializer reports ready upward and fails closed on error', () => {
    const init = readFileSync(join(SRC, 'components/ResourceTypeInitializer.tsx'), 'utf8')
    expect(init).toContain('markResourceTypesReady()')
    expect(init).toContain('markResourceTypesFailed(error)')
    // Fail-closed: every listed export must resolve; incompleteness cannot silently ready
    expect(init).toContain('collectRequiredPluginDefs')
    expect(init).toContain('assertAllPluginsRegistered')
    expect(init).toContain('RESOURCE_TYPE_PLUGIN_EXPORTS')
    expect(init).toContain('PANEL_ENTRY_PLUGIN_EXPORTS')
    expect(init).toContain('panelEntryRegistry.register')
    expect(init).toContain('assertAllPanelEntriesRegistered')
    expect(init).toContain('setActiveRegistries')
    expect(init).toContain('reensureCurrentWorkspaceCompositions')
    const registerAt = init.lastIndexOf('panelEntryRegistry.register')
    const bindAt = init.lastIndexOf('setActiveRegistries')
    const reensureAt = init.indexOf('reensureCurrentWorkspaceCompositions()')
    const readyAt = init.indexOf('markResourceTypesReady()')
    expect(bindAt).toBeGreaterThan(registerAt)
    expect(reensureAt).toBeGreaterThan(bindAt)
    expect(readyAt).toBeGreaterThan(reensureAt)
    expect(init).not.toMatch(/if\s*\(\s*!def\?\.id\s*\)\s*continue/)
    // Fail-closed: catch only reports failure, never marks ready
    const catchBlock = init.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/)
    expect(catchBlock?.[0] ?? '').toContain('markResourceTypesFailed')
    expect(catchBlock?.[0] ?? '').not.toContain('markResourceTypesReady')
  })

  test('ready comments describe app services + types, not catalog downloaded', () => {
    const ctx = readFileSync(join(SRC, 'contexts/CatalogContext.tsx'), 'utf8')
    const init = readFileSync(join(SRC, 'components/ResourceTypeInitializer.tsx'), 'utf8')
    expect(ctx).toMatch(/services \+ types/i)
    expect(ctx).toMatch(/not ["']?catalog downloaded/i)
    expect(init).toMatch(/not ["']?catalog downloaded/i)
  })

  test('App does not reference __catalogInitialized__ window flag', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    expect(app).toContain('useCatalogReady')
    expect(app).not.toContain('__catalogInitialized__')
    expect(app).not.toContain('window.__catalog')
  })

  test('App mounts ResourceTypeInitializer before catalogReady gate; gates Routes', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    expect(app).toContain('!catalogReady')
    expect(app).toContain('Loading catalog')
    expect(app).toContain('useResourceTypesError')
    expect(app).toContain('Resource type registration failed')

    const initIdx = app.indexOf('<ResourceTypeInitializer')
    const gateIdx = app.indexOf('!catalogReady')
    const routesIdx = app.indexOf('<Routes>')
    expect(initIdx).toBeGreaterThan(-1)
    expect(gateIdx).toBeGreaterThan(-1)
    expect(routesIdx).toBeGreaterThan(-1)
    // Initializer must mount even when not ready (before Routes)
    expect(initIdx).toBeLessThan(routesIdx)
    expect(gateIdx).toBeLessThan(routesIdx)
  })

  test('main bootstrap does not gate on __catalogInitialized__', () => {
    const main = readFileSync(join(SRC, 'main.tsx'), 'utf8')
    expect(main).not.toContain('__catalogInitialized__')
  })
})
