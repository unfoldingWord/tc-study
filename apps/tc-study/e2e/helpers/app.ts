import { expect, type Page } from '@playwright/test'
import {
  buildE2EAlignmentWorkspace,
  buildE2ECacheEntries,
  buildE2ECatalogEntries,
  buildE2EHelpsWorkspace,
  buildE2ENavigationState,
} from '../fixtures/helpsContent'
import { seedIndexedDb } from './idb'

/** Wait until catalog services + resource types are ready (loading gate dismissed). */
export async function waitForCatalogReady(page: Page): Promise<void> {
  await expect(page.getByLabel('Loading catalog')).toHaveCount(0, { timeout: 45_000 })
  await expect(page.getByLabel('Resource type registration failed')).toHaveCount(0)
}

/** Collect uncaught page errors for "does not crash" assertions. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    errors.push(err.message)
  })
  return errors
}

/**
 * Seed workspace + nav + IndexedDB catalog/cache so CombinedHelps can show a TN
 * note and scripture can highlight on quote click.
 */
export async function seedHelpsWorkspace(page: Page): Promise<void> {
  const workspace = buildE2EHelpsWorkspace()
  const navigation = buildE2ENavigationState()

  await seedIndexedDb(page, {
    catalogEntries: buildE2ECatalogEntries(),
    cacheEntries: buildE2ECacheEntries(),
  })

  await page.addInitScript(
    ({ pkg, nav }) => {
      localStorage.setItem('tc-study-workspace', JSON.stringify(pkg))
      localStorage.setItem('bt-synergy:navigation-state', JSON.stringify(nav))
    },
    { pkg: workspace, nav: navigation }
  )
}

/**
 * Seed ULT + UGNT side-by-side for Paul ↔ Παῦλος token-click highlight.
 */
export async function seedAlignmentWorkspace(page: Page): Promise<void> {
  const workspace = buildE2EAlignmentWorkspace()
  const navigation = buildE2ENavigationState()

  await seedIndexedDb(page, {
    catalogEntries: buildE2ECatalogEntries(),
    cacheEntries: buildE2ECacheEntries(),
  })

  await page.addInitScript(
    ({ pkg, nav }) => {
      localStorage.setItem('tc-study-workspace', JSON.stringify(pkg))
      localStorage.setItem('bt-synergy:navigation-state', JSON.stringify(nav))
    },
    { pkg: workspace, nav: navigation }
  )
}

/**
 * Seed Arabic RTL scripture (no CombinedHelps) so nav/viewer chrome can assert `dir="rtl"`.
 */
export async function seedRtlScriptureWorkspace(page: Page): Promise<void> {
  const navigation = buildE2ENavigationState()
  const catalogEntries = buildE2ECatalogEntries().map((entry) => {
    if (entry.type !== 'scripture' || entry.resourceId !== 'ult') return entry
    return {
      ...entry,
      language: 'ar',
      languageCode: 'ar',
      languageDirection: 'rtl' as const,
    }
  })

  const workspace = {
    id: 'e2e-rtl',
    name: 'E2E RTL Workspace',
    version: '1.0.0',
    description: 'Playwright RTL seed',
    resources: [
      [
        'unfoldingWord/e2e/ult',
        {
          id: 'unfoldingWord/e2e/ult',
          key: 'unfoldingWord/e2e/ult',
          resourceKey: 'unfoldingWord/e2e/ult',
          title: 'E2E ULT',
          type: 'scripture',
          subject: 'Aligned Bible',
          owner: 'unfoldingWord',
          language: 'ar',
          languageCode: 'ar',
          languageDirection: 'rtl',
          resourceId: 'ult',
          server: 'git.door43.org',
        },
      ],
    ],
    panels: [
      {
        id: 'panel-1',
        name: 'Panel 1',
        resourceKeys: ['unfoldingWord/e2e/ult'],
        activeIndex: 0,
        position: 0,
      },
      {
        id: 'panel-2',
        name: 'Panel 2',
        resourceKeys: [] as string[],
        activeIndex: 0,
        position: 1,
      },
    ],
  }

  await seedIndexedDb(page, {
    catalogEntries,
    cacheEntries: buildE2ECacheEntries(),
  })

  await page.addInitScript(
    ({ pkg, nav }) => {
      localStorage.setItem('tc-study-workspace', JSON.stringify(pkg))
      localStorage.setItem('bt-synergy:navigation-state', JSON.stringify(nav))
    },
    { pkg: workspace, nav: navigation }
  )
}
