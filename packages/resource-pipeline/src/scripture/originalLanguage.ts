/**
 * Which original-language scripture a book is quoted and aligned against: UGNT for the New Testament, UHB for the
 * rest. The Read page, the warm jobs and a language-pack builder must pick the same one, since quote and align keys
 * embed its stamp.
 */

const NT_BOOKS = new Set([
  'MAT',
  'MRK',
  'LUK',
  'JHN',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
  'REV',
])

export interface OriginalLanguageResource {
  resourceKey: string
  language: string
  bookCode: string
}

export function resolveOriginalLanguageKey(bookCode: string): OriginalLanguageResource | null {
  const upper = bookCode.toUpperCase()
  if (!upper || upper === 'OBS') return null
  if (NT_BOOKS.has(upper)) {
    return {
      resourceKey: 'unfoldingWord/el-x-koine/ugnt',
      language: 'el-x-koine',
      bookCode: upper,
    }
  }
  return {
    resourceKey: 'unfoldingWord/hbo/uhb',
    language: 'hbo',
    bookCode: upper,
  }
}
