import type { Page, Route } from '@playwright/test'

/** Minimal Door43 language list for deterministic LanguagePicker / App bootstrap. */
export const MOCK_LANGUAGES = [
  { lc: 'e2e', ln: 'E2E Language', ang: 'E2E Language', ld: 'ltr' },
  { lc: 'en', ln: 'English', ang: 'English', ld: 'ltr' },
  /** RTL language for nav/viewer direction smoke */
  { lc: 'ar', ln: 'Arabic', ang: 'Arabic', ld: 'rtl' },
]

const TIT_INGREDIENT = {
  identifier: 'tit',
  path: './tit.usfm',
  title: 'Titus',
}

/**
 * Flat catalog/search entry shape.
 * Works for both `loadReadLanguageCatalog` (catalogIdentity) and wizard
 * `addDoor43CatalogResults` (uses result when `language` string is present).
 */
export const MOCK_CATALOG_SEARCH = [
  {
    name: 'e2e_ult',
    repo_name: 'e2e_ult',
    owner: 'unfoldingWord',
    language: 'e2e',
    identifier: 'ult',
    abbreviation: 'ult',
    id: 'ult',
    title: 'E2E ULT',
    subject: 'Aligned Bible',
    ingredients: [TIT_INGREDIENT],
    release: { tag_name: 'v1' },
  },
]

/** Repo tree blobs so ingredient verification does not write verifiedIngredients=[]. */
const MOCK_REPO_TREE = {
  tree: [
    { path: 'tit.usfm', type: 'blob' },
    { path: 'manifest.yaml', type: 'blob' },
  ],
  truncated: false,
}

const DOOR43_ROUTE = '**/git.door43.org/**'

function jsonOk(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data }),
  }
}

function jsonBody(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  }
}

async function fulfillDoor43Success(route: Route): Promise<void> {
  const url = route.request().url()
  const method = route.request().method()

  if (method !== 'GET' && method !== 'HEAD') {
    await route.fulfill(jsonOk(null))
    return
  }

  if (url.includes('/api/v1/catalog/list/languages')) {
    await route.fulfill(jsonOk(MOCK_LANGUAGES))
    return
  }

  if (url.includes('/api/v1/catalog/search')) {
    await route.fulfill(jsonOk(MOCK_CATALOG_SEARCH))
    return
  }

  if (url.includes('/api/v1/catalog/list/owners')) {
    await route.fulfill(
      jsonOk([{ username: 'unfoldingWord', login: 'unfoldingWord', full_name: 'unfoldingWord' }])
    )
    return
  }

  // Ingredient verification (fetchRepoTreePaths) — must include book paths or
  // verifiedIngredients becomes [] and Read filters out every scripture panel.
  if (url.includes('/git/trees/')) {
    await route.fulfill(jsonBody(MOCK_REPO_TREE))
    return
  }

  // Default: empty OK so stray Door43 calls (enrichment raw files, etc.) do not hang
  await route.fulfill(jsonOk([]))
}

/**
 * Stub Door43 HTTP so E2E does not depend on the live catalog.
 * Covers language list, owners, catalog search, and git tree verification.
 */
export async function mockDoor43Network(page: Page): Promise<void> {
  await page.route(DOOR43_ROUTE, fulfillDoor43Success)
}

/**
 * Door43 catalog endpoints return 5xx — used for negative / failure-UI journeys.
 * Call `heal()` then Retry to assert recovery against success responses.
 */
export async function mockDoor43NetworkFailure(page: Page): Promise<{ heal: () => void }> {
  let failing = true

  await page.route(DOOR43_ROUTE, async (route) => {
    const url = route.request().url()
    const isCatalogApi =
      url.includes('/api/v1/catalog/list/languages') ||
      url.includes('/api/v1/catalog/search') ||
      url.includes('/api/v1/catalog/list/owners')

    if (failing && isCatalogApi) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, message: 'E2E simulated Door43 failure' }),
      })
      return
    }

    await fulfillDoor43Success(route)
  })

  return {
    heal: () => {
      failing = false
    },
  }
}
