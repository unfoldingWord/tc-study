import type { Locator, Page } from '@playwright/test'

/** Open BCV dialog from Studio/Read chrome. */
export async function openBcvDialog(page: Page): Promise<Locator> {
  await page.getByTitle('Click to navigate or adjust range').click()
  const dialog = page.getByRole('dialog')
  return dialog
}

/**
 * Pick a single verse. Chapter header selects a range; clicking that chapter's
 * verse again collapses to a single verse (BCVNavigator handleVerseClick).
 */
export async function selectBookChapterVerse(
  dialog: Locator,
  opts: { bookName: RegExp; chapter: number; verse: number }
): Promise<void> {
  const book = dialog.getByRole('button', { name: opts.bookName }).first()
  if (await book.isVisible().catch(() => false)) {
    await book.click()
  }

  const chapterBtn = dialog.getByRole('button', { name: `Chapter ${opts.chapter}` })
  await chapterBtn.click()

  // Parent wraps chapter header + verse grid; collapse range → single verse
  await chapterBtn
    .locator('..')
    .getByRole('button', { name: String(opts.verse), exact: true })
    .click()

  await dialog.getByRole('button', { name: 'Apply selection' }).click()
}
