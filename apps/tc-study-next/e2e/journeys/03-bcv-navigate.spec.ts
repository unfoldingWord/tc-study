import { expect, test } from '@playwright/test'
import { E2E_QUOTE_EN } from '../fixtures/helpsContent'
import { mockDoor43Network } from '../fixtures/door43'
import { openBcvDialog, selectBookChapterVerse } from '../helpers/bcv'
import { seedHelpsWorkspace, trackPageErrors, waitForCatalogReady } from '../helpers/app'

test.describe('Journey 3: Navigate BCV and see reference update', () => {
  test('BCV navigator changes chapter/verse on Studio chrome', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    await seedHelpsWorkspace(page)

    await page.goto('/studio')
    await waitForCatalogReady(page)

    const refButton = page.getByTitle('Click to navigate or adjust range')
    await expect(refButton).toBeVisible()
    await expect(refButton).toContainText('1:1')

    // Cheap content proof at starting BCV (scripture panel)
    await expect(page.getByRole('status', { name: 'Loading scripture' })).toHaveCount(0, {
      timeout: 45_000,
    })
    await expect(page.getByRole('heading', { name: 'E2E ULT' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(E2E_QUOTE_EN, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })

    const dialog = await openBcvDialog(page)
    await expect(dialog).toBeVisible()
    await selectBookChapterVerse(dialog, { bookName: /Titus/i, chapter: 2, verse: 1 })

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(refButton).toContainText('2:1')

    // Fixture seeds Titus 1 only — chapter 2 must clear ch1 content / show product empty UI
    // (chrome-only 2:1 with stuck 1:1 text would be a false pass).
    // Assert ScriptureContent copy, not useContentRequests signal text ("Chapter 2 not found").
    await expect(page.getByText(E2E_QUOTE_EN, { exact: true })).toHaveCount(0, {
      timeout: 30_000,
    })
    await expect(page.getByText('No verses found for TIT 2:1')).toBeVisible({
      timeout: 30_000,
    })

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(refButton).toContainText('2:2')
    await expect(page.getByText('No verses found for TIT 2:2')).toBeVisible()

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
