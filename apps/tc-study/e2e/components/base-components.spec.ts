import { expect, test, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

/**
 * Dialog and Switcher behaviour that needs a real DOM: the portal, focus, and keys reaching React
 * handlers. No screen uses them yet, so harness.tsx renders them; it is bundled here from source,
 * outside dist/, so the app build and the preview the journeys use stay untouched.
 */
const HARNESS = fileURLToPath(new URL('./harness.tsx', import.meta.url))
let bundle = ''

test.beforeAll(async () => {
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    publicDir: false,
    esbuild: { jsx: 'automatic' },
    build: {
      write: false,
      minify: false,
      outDir: join(tmpdir(), 'tc-study-ui-harness'),
      emptyOutDir: false,
      rollupOptions: { input: HARNESS },
    },
  })
  const outputs = Array.isArray(out) ? out : [out]
  for (const result of outputs) {
    if (!('output' in result)) continue
    for (const file of result.output) {
      if (file.type === 'chunk' && file.isEntry) bundle = file.code
    }
  }
  if (!bundle) throw new Error('harness bundle has no entry chunk')
})

async function openHarness(page: Page) {
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>')
  await page.addScriptTag({ type: 'module', content: bundle })
  await expect(page.getByRole('button', { name: 'Open' })).toBeVisible()
}

test.describe('Dialog', () => {
  test('opening moves focus into the portalled panel, and Escape closes it and gives focus back', async ({
    page,
  }) => {
    await openHarness(page)
    const opener = page.getByRole('button', { name: 'Open' })
    await opener.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Harness dialog' })
    await expect(dialog).toBeFocused()
    expect(await dialog.evaluate((panel) => panel.parentElement?.parentElement === document.body)).toBe(true)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
})

test.describe('Switcher', () => {
  async function expectCurrent(page: Page, list: string, name: string) {
    const tab = page.getByRole('tablist', { name: list, exact: true }).getByRole('tab', { name })
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(tab).toHaveAttribute('tabindex', '0')
    await expect(tab).toBeFocused()
  }

  test('the arrows, Home and End select a tab and move focus to it, wrapping at the ends', async ({ page }) => {
    await openHarness(page)
    await page.getByRole('tablist', { name: 'View', exact: true }).getByRole('tab', { name: 'Read' }).focus()

    await page.keyboard.press('ArrowRight')
    await expectCurrent(page, 'View', 'Study')
    await page.keyboard.press('End')
    await expectCurrent(page, 'View', 'Notes')
    await page.keyboard.press('ArrowRight')
    await expectCurrent(page, 'View', 'Read')
    await page.keyboard.press('ArrowLeft')
    await expectCurrent(page, 'View', 'Notes')
    await page.keyboard.press('Home')
    await expectCurrent(page, 'View', 'Read')
  })

  test('in rtl, ArrowLeft moves forward', async ({ page }) => {
    await openHarness(page)
    await page.getByRole('tablist', { name: 'View rtl' }).getByRole('tab', { name: 'Read' }).focus()

    await page.keyboard.press('ArrowLeft')
    await expectCurrent(page, 'View rtl', 'Study')
    await page.keyboard.press('ArrowRight')
    await expectCurrent(page, 'View rtl', 'Read')
  })

  test('clicking a tab selects it and moves focus to that tab', async ({ page }) => {
    await openHarness(page)
    const list = page.getByRole('tablist', { name: 'View', exact: true })
    await list.getByRole('tab', { name: 'Read' }).focus()
    await list.getByRole('tab', { name: 'Notes' }).click()
    await expectCurrent(page, 'View', 'Notes')
  })
})
