/** English names of the 66 books, by their codes (`ids.md`), for answers a person reads. */
export const BOOK_NAMES: Record<string, string> = {
  gen: 'Genesis', exo: 'Exodus', lev: 'Leviticus', num: 'Numbers', deu: 'Deuteronomy', jos: 'Joshua', jdg: 'Judges',
  rut: 'Ruth', '1sa': '1 Samuel', '2sa': '2 Samuel', '1ki': '1 Kings', '2ki': '2 Kings', '1ch': '1 Chronicles',
  '2ch': '2 Chronicles', ezr: 'Ezra', neh: 'Nehemiah', est: 'Esther', job: 'Job', psa: 'Psalms', pro: 'Proverbs',
  ecc: 'Ecclesiastes', sng: 'Song of Songs', isa: 'Isaiah', jer: 'Jeremiah', lam: 'Lamentations', ezk: 'Ezekiel',
  dan: 'Daniel', hos: 'Hosea', jol: 'Joel', amo: 'Amos', oba: 'Obadiah', jon: 'Jonah', mic: 'Micah', nam: 'Nahum',
  hab: 'Habakkuk', zep: 'Zephaniah', hag: 'Haggai', zec: 'Zechariah', mal: 'Malachi', mat: 'Matthew', mrk: 'Mark',
  luk: 'Luke', jhn: 'John', act: 'Acts', rom: 'Romans', '1co': '1 Corinthians', '2co': '2 Corinthians',
  gal: 'Galatians', eph: 'Ephesians', php: 'Philippians', col: 'Colossians', '1th': '1 Thessalonians',
  '2th': '2 Thessalonians', '1ti': '1 Timothy', '2ti': '2 Timothy', tit: 'Titus', phm: 'Philemon', heb: 'Hebrews',
  jas: 'James', '1pe': '1 Peter', '2pe': '2 Peter', '1jn': '1 John', '2jn': '2 John', '3jn': '3 John', jud: 'Jude',
  rev: 'Revelation',
}

export const bookName = (code: string): string => BOOK_NAMES[code] ?? code

export const size = (bytes: number): string =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
