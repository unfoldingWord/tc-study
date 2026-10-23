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
    // Selection is exposed as aria-current; the paint class proves the visible highlight
    await expect(paul).toHaveAttribute('aria-current', 'true')
    await expect(paulos).toHaveAttribute('aria-current', 'true')
    await expect(paul).toHaveClass(/highlighted-token/)
    await expect(paulos).toHaveClass(/highlighted-token/)

    // Toggle-off: re-clicking the active selection clears cross-pane highlights
    await paul.click()
    await expect(paul).not.toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paulos).not.toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paul).not.toHaveClass(/highlighted-token/)
    await expect(paul).not.toHaveAttribute('aria-current')

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
    await expect(paulos).toHaveAttribute('aria-current', 'true')
    await expect(paul).toHaveAttribute('aria-current', 'true')
    await expect(paulos).toHaveClass(/highlighted-token/)
    await expect(paul).toHaveClass(/highlighted-token/)

    // Toggle-off from the OL side clears gateway highlight too
    await paulos.click()
    await expect(paulos).not.toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paul).not.toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(paulos).not.toHaveClass(/highlighted-token/)
    await expect(paulos).not.toHaveAttribute('aria-current')

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })

  test('keyboard: Tab to the words, arrows to Paul, Enter lights Παῦλος', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    await seedAlignmentWorkspace(page)

    await page.goto('/studio')
    await waitForCatalogReady(page)

    await expect(page.getByRole('status', { name: 'Loading scripture' })).toHaveCount(0, {
      timeout: 45_000,
    })

    const ult = page.getByRole('region', { name: 'E2E ULT' })
    const paul = ult.locator('[data-token-semantic-id]').filter({ hasText: E2E_PAUL_EN }).first()
    const paulos = page.locator('[data-token-semantic-id]').filter({ hasText: E2E_PAUL_GREEK }).first()
    await expect(paul).toBeVisible({ timeout: 30_000 })
    await expect(paulos).toBeVisible({ timeout: 30_000 })

    // One tab stop per pane: the scrollport, then Tab lands on a word / verse number
    await ult.focus()
    await page.keyboard.press('Tab')
    const focusedItem = ult.locator('[data-token-semantic-id]:focus, [data-verse-number]:focus')
    await expect(focusedItem).toHaveCount(1)
    await expect(focusedItem).toHaveAttribute('tabindex', '0')

    // Arrows rove (one tabindex=0 at a time) until Paul has focus
    for (let i = 0; i < 20 && !(await paul.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(paul).toBeFocused()
    await expect(ult.locator('[tabindex="0"]')).toHaveCount(1)

    await page.keyboard.press('Enter')
    await expect(paul).toHaveAttribute('aria-current', 'true', { timeout: 10_000 })
    await expect(paul).toHaveClass(/highlighted-token/)
    await expect(paulos).toHaveAttribute('aria-current', 'true', { timeout: 10_000 })
    await expect(paulos).toHaveClass(/highlighted-token/)
    await expect(ult.locator('[aria-live="polite"]')).toHaveText(`${E2E_PAUL_EN} selected`)

    // Space toggles off, same as a second click
    await page.keyboard.press(' ')
    await expect(paul).not.toHaveAttribute('aria-current', { timeout: 10_000 })
    await expect(paulos).not.toHaveAttribute('aria-current', { timeout: 10_000 })
    await expect(paul).toBeFocused()

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
