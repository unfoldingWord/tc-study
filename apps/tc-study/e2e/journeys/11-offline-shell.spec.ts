import { expect, test } from '@playwright/test'
import { E2E_QUOTE_EN, buildE2ECacheEntries, buildE2ECatalogEntries } from '../fixtures/helpsContent'
import { mockDoor43Network } from '../fixtures/door43'
import { trackPageErrors, waitForCatalogReady } from '../helpers/app'
import { seedIndexedDb } from '../helpers/idb'

test.describe('Journey 11: Offline shell', () => {
  test.use({ serviceWorkers: 'allow' })

  test('shell and deep links render after going offline', async ({ context, page }) => {
    const errors = trackPageErrors(page)
    const workerFailures: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'warning' && msg.type() !== 'error') return
      const text = msg.text()
      const lower = text.toLowerCase()
      if (
        lower.includes('failed to start worker') ||
        lower.includes('worker unavailable') ||
        lower.includes('worker error')
      ) {
        workerFailures.push(text)
      }
    })

    await mockDoor43Network(page)
    await seedIndexedDb(page, {
      catalogEntries: buildE2ECatalogEntries(),
      cacheEntries: buildE2ECacheEntries(),
    })

    await page.goto('/read/e2e/ult/chapter/tit.1')
    await waitForCatalogReady(page)
    await expect(page.getByText(E2E_QUOTE_EN, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return 'missing'
          const registration = await navigator.serviceWorker.ready
          if (navigator.serviceWorker.controller) return 'controlled'
          return registration.active ? 'active' : 'pending'
        })
      }, { timeout: 30_000 })
      .toMatch(/controlled|active/)

    if (
      !(await page.evaluate(async () => {
        await navigator.serviceWorker.ready
        return Boolean(navigator.serviceWorker.controller)
      }))
    ) {
      await page.reload()
      await waitForCatalogReady(page)
    }
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            await navigator.serviceWorker.ready
            return Boolean(navigator.serviceWorker.controller)
          }),
        { timeout: 30_000 }
      )
      .toBe(true)

    await context.setOffline(true)

    const prepareWorkerResponse = page.waitForResponse(
      (response) =>
        response.url().includes('prepare.worker') && response.status() === 200,
      { timeout: 30_000 }
    )
    const expectsDedicatedWarmWorker = await page.evaluate(
      () => (navigator.hardwareConcurrency ?? 0) >= 4
    )
    const warmWorkerResponse = expectsDedicatedWarmWorker
      ? page.waitForResponse(
          (response) => response.url().includes('warm.worker') && response.status() === 200,
          { timeout: 30_000 }
        )
      : null

    await page.goto('/')
    await page.reload()
    await waitForCatalogReady(page)
    await expect(page).toHaveURL(/\/read/)
    await expect(page.locator('.read-panel-header').first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('region', { name: 'E2E ULT' })).toBeVisible({
      timeout: 30_000,
    })

    await page.goto('/read/e2e/ult/chapter/tit.1')
    await waitForCatalogReady(page)
    await expect(page.locator('.read-panel-header').first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('region', { name: 'E2E ULT' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(E2E_QUOTE_EN, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })
    const workerResp = await prepareWorkerResponse
    expect(await workerResp.fromServiceWorker()).toBe(true)
    if (expectsDedicatedWarmWorker) {
      const warmResp = await warmWorkerResponse!
      expect(await warmResp.fromServiceWorker()).toBe(true)
    }

    await page.goto('/data')
    await waitForCatalogReady(page)
    await expect(page.locator('header')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Data Management' })).toBeVisible({
      timeout: 30_000,
    })

    expect(workerFailures, `worker failures: ${workerFailures.join('; ')}`).toEqual([])
    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
