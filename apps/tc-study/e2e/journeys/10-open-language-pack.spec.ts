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
    const readMs = await readTitus(page)
    await expect(page.getByText(TIT_1_1_NOTE).first()).toBeVisible({ timeout: 60_000 })
    await expectNoDownloadErrors(page)

    console.log(`[journey-10] opened es-419 + originals in ${openMs} ms; Titus 1:1 shown in ${readMs} ms`)
    const wanted = new Map<string, number>()
    for (const href of left) {
      const url = new URL(href)
      const where = `${url.host}${url.pathname.split('/').slice(0, 3).join('/')}`
      wanted.set(where, (wanted.get(where) ?? 0) + 1)
    }
    console.log(`[journey-10] requests that wanted the network (all aborted): ${left.length}`, Object.fromEntries(wanted))
    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })

  test('base plus the Titus book pack: Titus reads, and nothing is an error', async ({ page }) => {
    const errors = trackPageErrors(page)
    await goOffline(page)

    const openMs = await openPacks(page, ['es-419-tit', 'es-419-base', 'originals'])
    const readMs = await readTitus(page)
    await expectNoDownloadErrors(page)

    console.log(`[journey-10] opened es-419-base + es-419-tit + originals in ${openMs} ms; Titus shown in ${readMs} ms`)
    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
