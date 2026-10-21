import { expect, test } from '@playwright/test'
import {
  E2E_NOTE_TEXT,
  E2E_QUOTE_EN,
  buildE2ECacheEntries,
  buildE2ECatalogEntries,
} from '../fixtures/helpsContent'
import { mockDoor43Network } from '../fixtures/door43'
import { seedIndexedDb } from '../helpers/idb'
import { trackPageErrors, waitForCatalogReady } from '../helpers/app'

/**
 * Lane-1 SoT: Titus paints from local book SoT (seeded IDB, not full-language
 * zip 100%). CombinedHelps is usable in the same window. Worker attribution is
 * `__warmDebug` / `__sotDebug` when present.
 */
test.describe('Journey 9: Lane-1 usable before full-language download', () => {
  test('Read Titus scripture + helps without download 100%', async ({ page }) => {
    const errors = trackPageErrors(page)
    await mockDoor43Network(page)
    await seedIndexedDb(page, {
      catalogEntries: buildE2ECatalogEntries(),
      cacheEntries: buildE2ECacheEntries(),
    })

    await page.goto('/read')
    await waitForCatalogReady(page)

    const picker = page.getByRole('dialog', { name: 'Select language' })
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: 'E2E Language' }).click()
    await expect(page.getByRole('dialog', { name: 'Select language' })).toHaveCount(0, {
      timeout: 30_000,
    })
    await expect(page).toHaveURL(/\/read\/e2e/)

    await expect(page.getByRole('status', { name: 'Loading scripture' })).toHaveCount(0, {
      timeout: 45_000,
    })

    const scriptureToken = page.locator('[data-token-semantic-id]').filter({
      hasText: E2E_QUOTE_EN,
    })
    const scriptureRun = page.getByText('PaulGod')
    await expect(scriptureToken.or(scriptureRun).first()).toBeVisible({ timeout: 30_000 })

    const showHelps = page.getByRole('button', { name: 'Show helps' })
    if ((await showHelps.count()) > 0 && (await page.getByRole('article', { name: 'Translation note' }).count()) === 0) {
      await showHelps.first().click()
    }

    const helpsLoading = page.getByRole('status', {
      name: /Loading helps|Loading dependencies/i,
    })
    await expect(helpsLoading).toHaveCount(0, { timeout: 45_000 })

    const note = page.getByRole('article', { name: 'Translation note' })
    await expect(note.first()).toBeVisible({ timeout: 45_000 })
    await expect(note.first().getByText(E2E_NOTE_TEXT)).toBeVisible({ timeout: 15_000 })

    const download = page.getByRole('button', { name: 'Download progress' })
    if ((await download.count()) > 0) {
      await expect(download).not.toContainText('100%')
    }

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const w = window as unknown as {
              __warmDebug?: { lane1Drained?: boolean; dedicatedWorker?: boolean }
              __sotDebug?: { source?: string; book?: string }
            }
            return w.__sotDebug != null || w.__warmDebug != null
          }),
        { timeout: 15_000 }
      )
      .toBe(true)

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
