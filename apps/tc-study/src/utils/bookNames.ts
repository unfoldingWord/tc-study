/**
 * Book Name Utilities
 * 
 * Provides utilities for getting user-friendly book names from book codes.
 * Falls back to uppercase book code if title is not available.
 */

/**
 * Get the user-friendly book title from scripture resource metadata.
 *
 * Looks in:
 * 1. ingredients (contentMetadata.ingredients or flattened resource.ingredients) for identifier + title
 * 2. resource.toc.books (runtime TOC from loader) for code + name
 *
 * Why ingredient title is often missing: the Door43 catalog search API often returns ingredients
 * with only identifier and path; it does not always include localized book titles. Scripture has
 * no ingredientsGenerator (unlike TN/TW) that fetches manifest/toc to fill titles. So we also
 * use toc.books (filled when the loader has ingredient titles or when we add a generator later).
 *
 * @param metadata - Scripture resource metadata (ResourceInfo or any object with ingredients / toc)
 * @param bookCode - Book code (e.g., "gen", "mat")
 * @returns Book title (e.g., "Genesis", "Matthew") or uppercase book code as fallback
 */
export function getBookTitle(metadata: any | null | undefined, bookCode: string): string {
  const code = bookCode?.toLowerCase()
  if (!code) return bookCode.toUpperCase()

  // 1) Ingredients (from catalog or Phase 2 metadata) - may have title
  const ingredients =
    metadata?.ingredients ||
    metadata?.contentMetadata?.ingredients ||
    metadata?.metadata?.contentMetadata?.ingredients
  if (ingredients?.length) {
    const ingredient = ingredients.find(
      (ing: any) => ing.identifier?.toLowerCase() === code
    )
    if (ingredient?.title) return ingredient.title
  }

  // 2) TOC books (from loader; may have name when catalog provided ingredient.title)
  const books = metadata?.toc?.books
  if (books?.length) {
    const book = books.find((b: any) => (b.code || b.identifier)?.toLowerCase() === code)
    if (book?.name) return book.name
  }

  return bookCode.toUpperCase()
}

/**
 * Get book title from own resource ingredients if present, otherwise from fallback (e.g. last active scripture).
 * Use in TN/TQ/TWL so each resource can show its own language when it has ingredients.
 */
export function getBookTitleWithFallback(
  ownMetadata: any | null | undefined,
  fallbackMetadata: any | null | undefined,
  bookCode: string
): string {
  const fromOwn = getBookTitle(ownMetadata, bookCode)
  if (fromOwn !== bookCode.toUpperCase()) return fromOwn
  return getBookTitle(fallbackMetadata, bookCode)
}

/**
 * Map of common book codes to their English titles
 * Used as fallback when resource metadata is not available
 */
export const BOOK_TITLES: Record<string, string> = {
  // Old Testament
  gen: 'Genesis',
  exo: 'Exodus',
  lev: 'Leviticus',
  num: 'Numbers',
  deu: 'Deuteronomy',
  jos: 'Joshua',
  jdg: 'Judges',
  rut: 'Ruth',
  '1sa': '1 Samuel',
  '2sa': '2 Samuel',
  '1ki': '1 Kings',
  '2ki': '2 Kings',
  '1ch': '1 Chronicles',
  '2ch': '2 Chronicles',
  ezr: 'Ezra',
  neh: 'Nehemiah',
  est: 'Esther',
  job: 'Job',
  psa: 'Psalms',
  pro: 'Proverbs',
  ecc: 'Ecclesiastes',
  sng: 'Song of Solomon',
  isa: 'Isaiah',
  jer: 'Jeremiah',
  lam: 'Lamentations',
  ezk: 'Ezekiel',
  dan: 'Daniel',
  hos: 'Hosea',
  jol: 'Joel',
  amo: 'Amos',
  oba: 'Obadiah',
  jon: 'Jonah',
  mic: 'Micah',
  nam: 'Nahum',
  hab: 'Habakkuk',
  zep: 'Zephaniah',
  hag: 'Haggai',
  zec: 'Zechariah',
  mal: 'Malachi',
  
  // New Testament
  mat: 'Matthew',
  mrk: 'Mark',
  luk: 'Luke',
  jhn: 'John',
  act: 'Acts',
  rom: 'Romans',
  '1co': '1 Corinthians',
  '2co': '2 Corinthians',
  gal: 'Galatians',
  eph: 'Ephesians',
  php: 'Philippians',
  col: 'Colossians',
  '1th': '1 Thessalonians',
  '2th': '2 Thessalonians',
  '1ti': '1 Timothy',
  '2ti': '2 Timothy',
  tit: 'Titus',
  phm: 'Philemon',
  heb: 'Hebrews',
  jas: 'James',
  '1pe': '1 Peter',
  '2pe': '2 Peter',
  '1jn': '1 John',
  '2jn': '2 John',
  '3jn': '3 John',
  jud: 'Jude',
  rev: 'Revelation',
}

/**
 * Get book title with static fallback
 * 
 * @param bookCode - Book code (e.g., "gen", "mat")
 * @returns Book title from static map or uppercase book code
 */
export function getBookTitleStatic(bookCode: string): string {
  return BOOK_TITLES[bookCode.toLowerCase()] || bookCode.toUpperCase()
}
