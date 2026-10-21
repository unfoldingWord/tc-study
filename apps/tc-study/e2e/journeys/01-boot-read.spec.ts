import { expect, test } from '@playwright/test'
import { E2E_QUOTE_EN, buildE2ECacheEntries, buildE2ECatalogEntries } from '../fixtures/helpsContent'
import { mockDoor43Network } from '../fixtures/door43'
import { seedIndexedDb } from '../helpers/idb'
import { trackPageErrors, waitForCatalogReady } from '../helpers/app'

test.describe('Journey 1: App boots / catalog ready → Read loads', () => {
  test('select language and show scripture on Read', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    // Offline scripture cache so Read can render verse text after language bootstrap
    await seedIndexedDb(page, {
      catalogEntries: buildE2ECatalogEntries(),
      cacheEntries: buildE2ECacheEntries(),
    })

    await page.goto('/read')
    await waitForCatalogReady(page)

    // Language picker required on bare /read (dialog is named by its trigger label)
    const picker = page.getByRole('dialog', { name: 'Select language' })
    await expect(picker).toBeVisible()
    const e2eLanguage = picker.getByRole('button', { name: 'E2E Language', exact: true })
    await expect(e2eLanguage).toBeVisible()

    await e2eLanguage.click()

    // Picker closes; URL includes language; scripture content renders from cache
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })
    await expect(page).toHaveURL(/\/read\/e2e/)

    await expect(page.getByRole('status', { name: 'Loading scripture' })).toHaveCount(0, {
      timeout: 45_000,
    })
    await expect(page.getByText(E2E_QUOTE_EN, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
