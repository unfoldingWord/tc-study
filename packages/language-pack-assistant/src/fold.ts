/** The question's form for matching: NFD without marks, lower case, punctuation as spaces, spaces collapsed. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:()«»“”"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
