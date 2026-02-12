/**
 * Book Name Utilities
 * 
 * Provides utilities for getting user-friendly book names from book codes.
 * Falls back to uppercase book code if title is not available.
 */

/**
 * Get the user-friendly book title from scripture resource ingredients
 * 
 * @param metadata - Scripture resource metadata (or any object with ingredients)
 * @param bookCode - Book code (e.g., "gen", "mat")
 * @returns Book title (e.g., "Genesis", "Matthew") or uppercase book code as fallback
 */
export function getBookTitle(metadata: any | null | undefined, bookCode: string): string {
  console.log(`[BOOK-TITLE] getBookTitle called for bookCode: "${bookCode}"`)
  console.log(`[BOOK-TITLE] metadata object:`, metadata)
  console.log(`[BOOK-TITLE] metadata keys:`, metadata ? Object.keys(metadata) : 'null/undefined')
  
  // Try multiple possible locations for ingredients
  // ResourceInfo has it at top level: resource.ingredients
  // ResourceMetadata has it nested: resource.contentMetadata.ingredients
  // Some resources store full metadata: resource.metadata.contentMetadata.ingredients
  const ingredients = 
    metadata?.ingredients || 
    metadata?.contentMetadata?.ingredients ||
    metadata?.metadata?.contentMetadata?.ingredients
  
  if (!ingredients) {
    return bookCode.toUpperCase()
  }

  const ingredient = ingredients.find(
    (ing: any) => ing.identifier?.toLowerCase() === bookCode.toLowerCase()
  )

  return ingredient?.title || bookCode.toUpperCase()
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
