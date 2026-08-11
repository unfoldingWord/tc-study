import { expect, test } from '@playwright/test'
import { mockDoor43NetworkFailure } from '../fixtures/door43'
import { trackPageErrors, waitForCatalogReady } from '../helpers/app'

test.describe('Negative: Door43 catalog failure', () => {
  test('5xx languages shows retry; heal + Retry recovers languages', async ({ page }) => {
    const errors = trackPageErrors(page)
    const door43 = await mockDoor43NetworkFailure(page)

    await page.goto('/read')
    await waitForCatalogReady(page)

    // Language picker still opens; load fails with icon + retry (no crash)
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
    const retryBtn = page.getByRole('button', { name: 'Retry loading languages' })
    await expect(retryBtn).toBeVisible({ timeout: 20_000 })

    // Heal mock then Retry — second attempt path recovers language list
    door43.heal()
    await retryBtn.click()

    await expect(page.getByText('E2E Language')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Retry loading languages' })).toHaveCount(0)

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
