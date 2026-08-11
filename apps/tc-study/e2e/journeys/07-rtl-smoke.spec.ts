import { expect, test } from '@playwright/test'
import { E2E_QUOTE_EN } from '../fixtures/helpsContent'
import { mockDoor43Network } from '../fixtures/door43'
import { seedRtlScriptureWorkspace, trackPageErrors, waitForCatalogReady } from '../helpers/app'

/**
 * RTL smoke: Door43 `ld: 'rtl'` + seeded Arabic scripture → nav/viewer chrome `dir="rtl"`.
 */
test.describe('RTL smoke: nav / scripture chrome', () => {
  test('Arabic RTL resource sets dir=rtl on nav and scripture viewer', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    await seedRtlScriptureWorkspace(page)

    await page.goto('/studio')
    await waitForCatalogReady(page)

    const refButton = page.getByTitle('Click to navigate or adjust range')
    await expect(refButton).toBeVisible({ timeout: 30_000 })
    await expect(refButton).toHaveAttribute('dir', 'rtl')

    // Scripture viewer root uses languageDirection
    await expect(page.getByRole('status', { name: 'Loading scripture' })).toHaveCount(0, {
      timeout: 45_000,
    })
    await expect(page.getByText(E2E_QUOTE_EN, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })

    const rtlViewer = page.locator('div.h-full.flex.flex-col[dir="rtl"]')
    await expect(rtlViewer.first()).toBeVisible()
    await expect(rtlViewer.first().getByRole('heading', { name: 'E2E ULT' })).toBeVisible()

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
