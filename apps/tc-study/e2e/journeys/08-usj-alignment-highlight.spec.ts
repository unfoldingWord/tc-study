import { expect, test } from '@playwright/test'
import { E2E_PAUL_EN, E2E_PAUL_GREEK } from '../fixtures/helpsContent'
import { mockDoor43Network } from '../fixtures/door43'
import { seedAlignmentWorkspace, trackPageErrors, waitForCatalogReady } from '../helpers/app'

/**
 * Journey 8: USJ cutover linked-panel alignment highlight.
 * Paul (ULT) ↔ Παῦλος (UGNT) via alignedOriginalWordIds / token-click.
 */
test.describe('Journey 8: USJ alignment highlight (Paul ↔ Παῦλος)', () => {
  test('ULT Paul click highlights UGNT Παῦλος', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    await seedAlignmentWorkspace(page)

    await page.goto('/studio')
    await waitForCatalogReady(page)

    await expect(page.getByRole('status', { name: 'Loading scripture' })).toHaveCount(0, {
      timeout: 45_000,
    })

    const paul = page.locator('[data-token-semantic-id]').filter({ hasText: E2E_PAUL_EN }).first()
    const paulos = page.locator('[data-token-semantic-id]').filter({ hasText: E2E_PAUL_GREEK }).first()
    await expect(paul).toBeVisible({ timeout: 30_000 })
    await expect(paulos).toBeVisible({ timeout: 30_000 })

    await paul.click()

    await expect(paul).toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paulos).toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paul).toHaveAttribute('aria-pressed', 'true')

    // Toggle-off: re-clicking the active selection clears cross-pane highlights
    await paul.click()
    await expect(paul).not.toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paulos).not.toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paul).toHaveAttribute('aria-pressed', 'false')

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })

  test('UGNT Παῦλος click highlights ULT Paul', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    await seedAlignmentWorkspace(page)

    await page.goto('/studio')
    await waitForCatalogReady(page)

    await expect(page.getByRole('status', { name: 'Loading scripture' })).toHaveCount(0, {
      timeout: 45_000,
    })

    const paul = page.locator('[data-token-semantic-id]').filter({ hasText: E2E_PAUL_EN }).first()
    const paulos = page.locator('[data-token-semantic-id]').filter({ hasText: E2E_PAUL_GREEK }).first()
    await expect(paul).toBeVisible({ timeout: 30_000 })
    await expect(paulos).toBeVisible({ timeout: 30_000 })

    await paulos.click()

    await expect(paulos).toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paul).toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paulos).toHaveAttribute('aria-pressed', 'true')

    // Toggle-off from the OL side clears gateway highlight too
    await paulos.click()
    await expect(paulos).not.toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paul).not.toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paulos).toHaveAttribute('aria-pressed', 'false')

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
