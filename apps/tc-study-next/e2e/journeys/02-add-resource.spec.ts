import { expect, test } from '@playwright/test'
import { E2E_QUOTE_EN, buildE2ECacheEntries, buildE2ECatalogEntries } from '../fixtures/helpsContent'
import { mockDoor43Network } from '../fixtures/door43'
import { seedIndexedDb } from '../helpers/idb'
import { trackPageErrors, waitForCatalogReady } from '../helpers/app'

test.describe('Journey 2: Add / open resource in panel', () => {
  test('wizard org → resource → assign resource to panel', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    // Catalog metadata (not offline) so review/add uses existing metadata path;
    // cache seed lets ScriptureViewer open real verse text after assign.
    await seedIndexedDb(page, {
      catalogEntries: buildE2ECatalogEntries().map((entry) => ({
        ...entry,
        availability: { online: true, offline: false, bundled: false, partial: false },
      })),
      cacheEntries: buildE2ECacheEntries(),
    })

    await page.goto('/studio')
    await waitForCatalogReady(page)

    await page.getByRole('button', { name: 'Add resource to this panel' }).first().click()

    await expect(page.getByLabel('Search languages')).toBeVisible()
    await page.getByText('E2E Language').click()
    await page.getByRole('button', { name: 'Next step' }).click()

    await expect(page.getByLabel('Search organizations')).toBeVisible({ timeout: 15_000 })
    await page.getByText('unfoldingWord').first().click()
    await page.getByRole('button', { name: 'Next step' }).click()

    await expect(page.locator('[title="unfoldingWord/e2e/ult"]')).toBeVisible({ timeout: 20_000 })
    await page.locator('[title="unfoldingWord/e2e/ult"]').click()
    await page.getByRole('button', { name: 'Next step' }).click()

    // Aligned Bible → original-languages → review
    await expect(page.getByRole('button', { name: 'Next step' })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Next step' }).click()

    const addBtn = page.getByRole('button', { name: 'Add to catalog' })
    await expect(addBtn).toBeVisible({ timeout: 15_000 })
    await expect(addBtn).toBeEnabled()
    await expect(page.getByText('E2E ULT').first()).toBeVisible()
    await addBtn.click()

    await expect(page.getByLabel('Search languages')).toHaveCount(0, { timeout: 20_000 })

    // Named claim: resource key is on a panel after assign
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const raw = localStorage.getItem('tc-study-workspace')
          if (!raw) return false
          const parsed = JSON.parse(raw)
          const panels = (parsed.panels || []) as Array<{ resourceKeys?: string[] }>
          return panels.some((p) => (p.resourceKeys || []).includes('unfoldingWord/e2e/ult'))
        })
      }, { timeout: 15_000 })
      .toBe(true)

    // Panel-1 empty CTA gone (one empty panel remains)
    await expect(page.getByRole('button', { name: 'Add resource to this panel' })).toHaveCount(1, {
      timeout: 15_000,
    })

    // Open/render proof: panel chrome shows resource title (not only localStorage keys)
    await expect(page.getByRole('tab', { name: 'E2E ULT' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'E2E ULT' })).toBeVisible({ timeout: 15_000 })

    // Scripture content opens from seeded cache after assign
    await expect(page.getByRole('status', { name: 'Loading scripture' })).toHaveCount(0, {
      timeout: 45_000,
    })
    await expect(page.getByText(E2E_QUOTE_EN, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
