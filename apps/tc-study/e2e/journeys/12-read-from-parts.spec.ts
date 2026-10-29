import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { trackPageErrors, waitForCatalogReady } from '../helpers/app'

/**
 * Read takes English from the packs server as parts (T-049): Titus and its Greek first, then the shared unit, already
 * prepared, written into the app's own stores. Door43 is aborted throughout, so what shows after the parts land can
 * only have come from them.
 *
 * PARTS_DIR holds real English parts as the production server serves them: `en-list-prod.json` (the parts list),
 * `originals-list.json` (the originals list it names) and `parts/{sha256}.part.gz`. Skipped without it: they are
 * 20 MB and stay out of the repo.
 */

const PARTS_DIR = process.env.PARTS_DIR ?? ''
const COMPAT = 'f2.0-u2.3.0-p6000230-q9-a12-t1'

test.skip(!PARTS_DIR || !existsSync(join(PARTS_DIR, 'en-list-prod.json')), 'PARTS_DIR with real English parts is not set')

/** A word of the ULT in Titus 1:1, and the text of its note rtc9. */
const ULT_WORD = 'Paul'
const TIT_1_1_NOTE = 'The words faith, knowledge, and truth are abstract nouns'

type Served = { parts: string[]; lists: string[]; door43: number }

async function servePartsLocally(page: Page): Promise<Served> {
  const served: Served = { parts: [], lists: [], door43: 0 }
  const list = readFileSync(join(PARTS_DIR, 'en-list-prod.json'))
  const originals = readFileSync(join(PARTS_DIR, 'originals-list.json'))
  await page.context().route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    const at = url.pathname.indexOf('/v2/packs/')
    if (at < 0) {
      if (url.hostname.endsWith('door43.org')) served.door43++
      return route.abort('internetdisconnected')
    }
    const path = url.pathname.slice(at + '/v2/packs/'.length)
    const headers = { 'Access-Control-Allow-Origin': '*' }
    if (path === `${COMPAT}/en`) {
      served.lists.push('en')
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: list })
    }
    if (path.startsWith(`${COMPAT}/originals/`)) {
      served.lists.push('originals')
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: originals })
    }
    if (path.startsWith('parts/')) {
      const file = join(PARTS_DIR, 'parts', `${path.slice('parts/'.length)}.part.gz`)
      if (!existsSync(file)) return route.fulfill({ status: 404, headers })
      served.parts.push(path.slice('parts/'.length))
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', headers, body: readFileSync(file) })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ error: 'no packs for this language' }) })
  })
  return served
}

/** Whether the app's cache holds a key (`tc-study-cache`, store `cache-entries`). */
async function cacheHas(page: Page, key: string): Promise<boolean> {
  return page.evaluate(
    (k) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('tc-study-cache')
        // Never create the app's database before it does: an empty one would lack its store.
        open.onupgradeneeded = () => {
          open.transaction?.abort()
          resolve(false)
        }
        open.onerror = () => resolve(false)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('cache-entries')) return resolve(false)
          const get = db.transaction('cache-entries').objectStore('cache-entries').get(k)
          get.onsuccess = () => resolve(get.result != null)
          get.onerror = () => resolve(false)
        }
      }),
    key
  )
}

test.describe('Journey 12: Read takes a language from the packs server as parts', () => {
  test.setTimeout(300_000)

  test('English Titus and its notes land prepared from parts, with Door43 aborted; Ruth comes on navigation', async ({ page }) => {
    const errors = trackPageErrors(page)
    const served = await servePartsLocally(page)
    page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack).split(/\r?\n/).slice(0, 9).join(' | ')))
    page.on('console', (m) => {
      if (m.text().startsWith('[parts]')) console.log(m.text())
      if (m.text().startsWith('[parts] sync threw')) {
        void m.args()[1]?.evaluate((e: unknown) => String((e as Error)?.stack).split(/\r?\n/).slice(0, 10).join(' | ')).then((st) => console.log('[stack]', st))
      }
    })

    const started = Date.now()
    await page.goto('/read/en/bible/ref/tit')
    await waitForCatalogReady(page)

    // Titus first: its notes, prepared on the server, are in the cache before the shared unit.
    await expect.poll(() => cacheHas(page, 'prepared:notes:unfoldingWord/en/tn:tit:1:full'), { timeout: 120_000 }).toBe(true)
    const titusMs = Date.now() - started
    // Then the shared unit: Translation Words whole, with its receipt.
    await expect.poll(() => cacheHas(page, 'resource:unfoldingWord/en/tw'), { timeout: 180_000 }).toBe(true)
    const sharedMs = Date.now() - started
    expect(served.lists).toEqual(expect.arrayContaining(['en', 'originals']))

    // A second visit reads it all from the device: Titus 1:1 and its note, with Door43 still aborted.
    const shown = Date.now()
    await page.goto('/read/en/bible/ref/tit')
    await waitForCatalogReady(page)
    await expect(page.getByText(ULT_WORD, { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(TIT_1_1_NOTE).first()).toBeVisible({ timeout: 60_000 })
    const readMs = Date.now() - shown

    const titusParts = served.parts.length
    console.log(
      `[journey-12] Titus parts in ${titusMs} ms, shared unit in ${sharedMs} ms (${titusParts} parts); ` +
        `then Titus 1:1 with its notes in ${readMs} ms from the device; ${served.door43} Door43 requests aborted`
    )

    // Another book: its parts are asked for on navigation.
    await page.goto('/read/en/bible/ref/rut')
    await waitForCatalogReady(page)
    await expect.poll(() => served.parts.length, { timeout: 60_000 }).toBeGreaterThan(titusParts)
    await expect.poll(() => cacheHas(page, 'prepared:notes:unfoldingWord/en/tn:rut:1:full'), { timeout: 120_000 }).toBe(true)

    expect(errors, `pageerrors: ${errors.join('; ')}`).toEqual([])
  })
})
