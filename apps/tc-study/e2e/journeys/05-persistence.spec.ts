import { expect, test } from '@playwright/test'
import { buildE2ECatalogEntries, E2E_ULT_KEY } from '../fixtures/helpsContent'
import { mockDoor43Network } from '../fixtures/door43'
import { openBcvDialog, selectBookChapterVerse } from '../helpers/bcv'
import { trackPageErrors, waitForCatalogReady } from '../helpers/app'
import { seedCatalogResources } from '../helpers/idb'
import { LANGUAGES_CACHE_KEY, LANGUAGES_CACHE_VERSION } from '../../src/features/read/languagesCache'

const E2E_COLLECTION_NAME = 'E2E Saved Collection'

test.describe('Journey 5: Persistence (language cache + BCV + collection save)', () => {
  test('language/BCV survive reload; collection create appears after reload', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    await seedCatalogResources(page, buildE2ECatalogEntries())

    await page.goto('/read')
    await waitForCatalogReady(page)

    const picker = page.getByRole('dialog', { name: 'Select language' })
    await expect(picker).toBeVisible()
    const e2eLanguage = picker.getByRole('button', { name: 'E2E Language', exact: true })
    await expect(e2eLanguage).toBeVisible()

    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), LANGUAGES_CACHE_KEY))
      .toBeTruthy()

    const cache = await page.evaluate(
      (key) => localStorage.getItem(key),
      LANGUAGES_CACHE_KEY
    )
    expect(cache).toContain('E2E Language')
    // Written in the format the app reads back (a stale version is discarded on reload)
    expect(JSON.parse(cache ?? '{}').version).toBe(LANGUAGES_CACHE_VERSION)

    // Dismiss language picker so later Studio chrome is not blocked by a leftover dialog
    await e2eLanguage.click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    await page.goto('/studio')
    await waitForCatalogReady(page)

    const refButton = page.getByTitle('Click to navigate or adjust range')
    await expect(refButton).toBeVisible({ timeout: 30_000 })
    const dialog = await openBcvDialog(page)
    await expect(dialog).toBeVisible()
    await selectBookChapterVerse(dialog, { bookName: /Titus/i, chapter: 3, verse: 2 })
    await expect(refButton).toContainText('3:2')

    await page.reload()
    await waitForCatalogReady(page)
    await expect(page.getByTitle('Click to navigate or adjust range')).toContainText('3:2')

    // Create → save → list → reload round-trip (packageStore / IndexedDB)
    await page.goto('/collections')
    await waitForCatalogReady(page)
    await page.getByRole('button', { name: 'Create new collection' }).first().click()
    await expect(page.getByLabel('Collection name')).toBeVisible()

    await page.getByLabel('Collection name').fill(E2E_COLLECTION_NAME)
    await page.getByTestId(`resource-${E2E_ULT_KEY}`).click()
    await page.getByRole('button', { name: 'Create collection' }).click()

    await expect(page.getByText(E2E_COLLECTION_NAME)).toBeVisible({ timeout: 15_000 })

    await page.reload()
    await waitForCatalogReady(page)
    await expect(page.getByText(E2E_COLLECTION_NAME)).toBeVisible({ timeout: 15_000 })

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
