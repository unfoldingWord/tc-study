import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { trackPageErrors, waitForCatalogReady } from '../helpers/app'

/**
 * Real language packs, opened and read with no internet.
 *
 * PACKS_DIR holds packs made by `prepare-language` (the Oct 27 ones: `originals`, `es-419`, `es-419-base`,
 * `es-419-tit`). Skipped without it: the packs are 40 MB and stay out of the repo.
 *
 * "No internet" is two things here: every request that is not to the app is aborted, and the page's navigator says
 * offline. `context.setOffline(true)` would also cut the app's own server, which serves Read's lazy chunks.
 */

const PACKS_DIR = process.env.PACKS_DIR ?? ''
const pack = (name: string) => join(PACKS_DIR, `${name}.langpack.zip`)

test.skip(!PACKS_DIR || !existsSync(pack('originals')), 'PACKS_DIR with the real packs is not set')

/** Titus 1:1 in the es-419 GLT, and the text of its note on κατὰ πίστιν (tn `rtc9`). */
const GLT_WORD = 'Pablo'
const TIT_1_1_NOTE = 'Fe es un sustantivo abstracto'

async function goOffline(page: Page): Promise<string[]> {
  const left: string[] = []
  await page.context().route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    left.push(url.href)
    return route.abort('internetdisconnected')
  })
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false })
    // Workers have their own navigator: on a device with no signal it says offline too.
    const RealWorker = window.Worker
    window.Worker = function (url: string | URL, options?: WorkerOptions) {
      const script = new URL(String(url), location.href).href
      const offline = "Object.defineProperty(WorkerNavigator.prototype, 'onLine', { configurable: true, get: () => false });"
      const body = options?.type === 'module' ? `${offline}\nawait import(${JSON.stringify(script)})` : `${offline}\nimportScripts(${JSON.stringify(script)})`
      return new RealWorker(URL.createObjectURL(new Blob([body], { type: 'text/javascript' })), options)
    } as unknown as typeof Worker
  })
  return left
}

async function openPacks(page: Page, names: string[]): Promise<number> {
  await page.goto('/data')
  await waitForCatalogReady(page)
  await page.getByTestId('tab-resources').click()
  const started = Date.now()
  await page.getByTestId('open-language-pack-input').setInputFiles(names.map(pack))
  await expect(page.getByTestId('language-pack-opened')).toHaveCount(names.length, { timeout: 180_000 })
  await expect(page.getByTestId('language-pack-refused')).toHaveCount(0)
  return Date.now() - started
}

async function readTitus(page: Page): Promise<number> {
  const started = Date.now()
  await page.goto('/read/es-419/bible/ref/tit')
  await waitForCatalogReady(page)
  await expect(page.getByText(GLT_WORD, { exact: true }).first()).toBeVisible({ timeout: 90_000 })
  return Date.now() - started
}

/** Nothing failed on a resource: the background monitor saw the device offline and queued nothing. */
async function expectNoDownloadErrors(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Retry download' })).toHaveCount(0)
  const phase = await page.evaluate(() => (window as { __bgdlLast?: { phase?: string } }).__bgdlLast?.phase)
  expect(phase === undefined || phase === 'offline' || phase === 'disabled').toBe(true)
}

test.describe('Journey 10: a language pack opens and reads with no internet', () => {
  test.setTimeout(420_000)

  test('originals and es-419: Titus 1:1 and its notes, with nothing from the network', async ({ page }) => {
    const errors = trackPageErrors(page)
    const left = await goOffline(page)

    const openMs = await openPacks(page, ['es-419', 'originals'])
    // Data › Resources lists what the device now holds, with no reload.
    const es419 = page.locator('[data-testid="device-language"][data-language="es-419"]')
    await expect(es419).toBeVisible()
    await expect(es419.getByTestId('device-resource').filter({ hasText: 'GLT' })).toBeVisible()
    await expect(page.locator('[data-testid="device-language"][data-language="el-x-koine"]')).toBeVisible()
    const readMs = await readTitus(page)
    await expect(page.getByText(TIT_1_1_NOTE).first()).toBeVisible({ timeout: 60_000 })
    await expectNoDownloadErrors(page)

    console.log(`[journey-10] opened es-419 + originals in ${openMs} ms; Titus 1:1 shown in ${readMs} ms`)
    // With the device offline nothing asks the network: every request that tried is listed if any did.
    const paths = left.map((href) => { const url = new URL(href); return `${url.host}${url.pathname}` })
    expect(paths, `requests that wanted the network: ${paths.join(' | ')}`).toEqual([])
    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })

  test('base plus the Titus book pack: Titus reads, and nothing is an error', async ({ page }) => {
    const errors = trackPageErrors(page)
    const left = await goOffline(page)

    const openMs = await openPacks(page, ['es-419-tit', 'es-419-base', 'originals'])
    // The Titus pack's resources say which book the device holds of them.
    await expect(page.locator('[data-testid="device-resource"][data-held-books="TIT"]').first()).toBeVisible()
    const readMs = await readTitus(page)
    await expectNoDownloadErrors(page)

    console.log(`[journey-10] opened es-419-base + es-419-tit + originals in ${openMs} ms; Titus shown in ${readMs} ms`)

    // Ruth is in the GLT release but no pack brought it: "not on this device", in both panes, never an error.
    await page.goto('/read/es-419/bible/ref/rut')
    await waitForCatalogReady(page)
    await expect(page.getByTestId('book-not-on-device').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('helps-not-on-device').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Error loading content')).toHaveCount(0)
    await expect(page.getByText('Failed to fetch')).toHaveCount(0)
    await expectNoDownloadErrors(page)
    expect(left.map((href) => new URL(href).pathname), 'requests that wanted the network').toEqual([])
    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
