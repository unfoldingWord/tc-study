/**
 * Scripture Helpers - placeholder
 */

export interface BookInfo {
  name: string
  code: string
  chapters: number
}

export function getScriptureBookInfo(bookId: string): BookInfo | null {
  // Placeholder - would normally return book info from a lookup table
  return {
    name: bookId,
    code: bookId,
    chapters: 50
  }
}
