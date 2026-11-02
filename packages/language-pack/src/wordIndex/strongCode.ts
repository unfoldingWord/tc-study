/**
 * The lexicon codes an original word's `strong` attribute names: the rules of Servos `src/lexicon/lexicon.ts`
 * (`strongParts` + `strongCode`), so an index row and a lexicon entry are found by the same code.
 *
 * - Greek `G{digits}`: the UGNT adds a last digit, dropped, with no padding (`G54850` → `G5485`, `G52281` → `G5228`).
 * - Hebrew `H{n}{letter?}`: the number padded to 4 digits (`H853` → `H0853`, `H1121a`).
 * - Parts are split on `:`; particle prefixes (`c:`, `b:`, `d:` …) and any part of another shape are dropped.
 */
export function strongCodesOf(strong: string | undefined): string[] {
  const out = new Set<string>()
  for (const raw of String(strong ?? '').split(':')) {
    const part = raw.trim()
    const greek = /^G(\d+)\d$/.exec(part)
    if (greek) {
      out.add(`G${Number(greek[1])}`)
      continue
    }
    const hebrew = /^H(\d+)([a-z])?$/.exec(part)
    if (hebrew && Number(hebrew[1])) out.add(`H${String(Number(hebrew[1])).padStart(4, '0')}${hebrew[2] ?? ''}`)
  }
  return [...out]
}
