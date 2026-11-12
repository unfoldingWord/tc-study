import { describe, expect, test } from 'bun:test'
import { processUsfmToUsjResult, withoutStrayBackslashes } from '../src/processUsfm'

// The shape of BSOJ/ar_arst 57-TIT.usfm (Nov 2026): a lone backslash on the line after a heading inside a chapter.
const BROKEN = ['\\id TIT', '\\c 1', '\\p', '\\v 1 Paul.', '\\c 2', '\\mt Titus 2: 1-8', '\\', '\\p', '\\v 1 But you.', ''].join('\n')

describe('withoutStrayBackslashes', () => {
  test('drops a backslash that ends a line and nothing else', () => {
    expect(withoutStrayBackslashes('\\mt A\n\\\n\\p\n\\v 1 x \\w y|a="1"\\w*\n')).toBe('\\mt A\n\n\\p\n\\v 1 x \\w y|a="1"\\w*\n')
    expect(withoutStrayBackslashes('\\v 1 x\\\r\n')).toBe('\\v 1 x\r\n')
    expect(withoutStrayBackslashes('\\v 1 x \\  \n')).toBe('\\v 1 x   \n')
  })

  test('keeps valid USFM as it is', () => {
    const ok = '\\id TIT\n\\c 1\n\\p\n\\v 1 \\zaln-s |x-strong="G39720"\\*\\w Paul|x-occurrence="1"\\w*\\zaln-e\\*.\n'
    expect(withoutStrayBackslashes(ok)).toBe(ok)
  })

  test('a book with a stray backslash is processed instead of thrown away', async () => {
    const r = await processUsfmToUsjResult({ usfmText: BROKEN, bookId: 'tit' })
    expect(JSON.stringify(r.cacheContent)).toContain('But you.')
  })
})
