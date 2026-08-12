import { expect, test } from '@playwright/test'
import { E2E_NOTE_TEXT, E2E_QUOTE_EN } from '../fixtures/helpsContent'
import { mockDoor43Network } from '../fixtures/door43'
import { seedHelpsWorkspace, trackPageErrors, waitForCatalogReady } from '../helpers/app'

/**
 * Journey 4: Helps interaction.
 *
 * Seeds IndexedDB TN + UGNT + ULT (aligned) so CombinedHelps can build quoteTokens,
 * show a clickable quote, underline coverage tokens, and highlight via token-click.
 */
test.describe('Journey 4: Helps interaction (CombinedHelps)', () => {
  test('note quote click highlights scripture token', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    await seedHelpsWorkspace(page)

    await page.goto('/studio')
    await waitForCatalogReady(page)

    await expect(page.getByText('HELPS', { exact: false }).or(page.getByText('Helps')).first()).toBeVisible({
      timeout: 30_000,
    })

    const loading = page.getByRole('status', { name: /Loading helps|Loading dependencies/i })
    await expect(loading).toHaveCount(0, { timeout: 45_000 })

    const notesFilter = page.getByRole('button', { name: 'Notes' })
    await expect(notesFilter).toBeVisible({ timeout: 15_000 })
    await notesFilter.click()

    const noteCard = page.getByRole('article', { name: 'Translation note' }).filter({
      hasText: E2E_NOTE_TEXT,
    })
    await expect(noteCard).toBeVisible({ timeout: 30_000 })

    // Alignment ready when quote is a highlight button (not fallback div)
    const quoteBtn = noteCard.getByTitle('Click to highlight these words in scripture')
    await expect(quoteBtn).toBeVisible({ timeout: 30_000 })
    await expect(quoteBtn).toContainText(E2E_QUOTE_EN)

    // Coverage underline on aligned English token (TN → Θεοῦ → God)
    const godToken = page.locator('[data-token-semantic-id]').filter({ hasText: E2E_QUOTE_EN }).first()
    await expect(godToken).toBeVisible({ timeout: 30_000 })
    await expect(godToken).toHaveAttribute('data-underlined', 'true', { timeout: 30_000 })

    // Before quote click: token highlight class is absent
    await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0)

    await quoteBtn.click()

    // Scripture token highlight from token-click signal
    const highlighted = page.locator('[data-highlighted="true"].highlighted-token')
    await expect(highlighted.first()).toBeVisible({ timeout: 15_000 })
    await expect(highlighted.first()).toContainText(E2E_QUOTE_EN)

    // Note body click selects the card (quote button stops propagation)
    await noteCard.getByText(E2E_NOTE_TEXT).click()
    await expect(noteCard).toHaveClass(/bg-highlight\/15/)
    await expect(noteCard).toHaveClass(/border-border/)

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })

  test('scripture token click highlights covered token locally', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    await seedHelpsWorkspace(page)

    await page.goto('/studio')
    await waitForCatalogReady(page)

    const loading = page.getByRole('status', { name: /Loading helps|Loading dependencies|Loading scripture/i })
    await expect(loading).toHaveCount(0, { timeout: 45_000 })

    const godToken = page.locator('[data-token-semantic-id]').filter({ hasText: E2E_QUOTE_EN }).first()
    await expect(godToken).toBeVisible({ timeout: 30_000 })
    await godToken.click()

    await expect(godToken).toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(godToken).toHaveClass(/highlighted-token/)
    await expect(godToken).toHaveAttribute('aria-pressed', 'true')

    // Covered click sets helps token filter; toggle-off clears highlight + filter, keeps underline
    const filterBar = page.getByTestId('helps-filter-scope-bar')
    await expect(filterBar).toBeVisible({ timeout: 10_000 })

    await godToken.click()
    await expect(godToken).not.toHaveAttribute('data-highlighted', 'true', { timeout: 10_000 })
    await expect(godToken).toHaveAttribute('aria-pressed', 'false')
    await expect(filterBar).toHaveCount(0)
    await expect(godToken).toHaveAttribute('data-underlined', 'true')

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
