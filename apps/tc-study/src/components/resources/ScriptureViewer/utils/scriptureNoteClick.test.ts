import { describe, expect, test } from 'bun:test'
import { scriptureNoteClickTarget } from './scriptureNoteClick'

describe('scriptureNoteClickTarget', () => {
  test('xref marker click navigates through the shared scripture-ref parser', () => {
    expect(scriptureNoteClickTarget('xref', 'Matthew 1:1–17', 'rut')).toEqual({
      action: 'navigate',
      ref: { book: 'mat', chapter: 1, verse: 1, endVerse: 17 },
    })
  })

  test('multi-ref xref and footnotes open a popover instead of splicing body text', () => {
    expect(
      scriptureNoteClickTarget('xref', 'Matthew 1:1–17; Luke 3:23–38', 'rut')
    ).toEqual({ action: 'popover' })
    expect(scriptureNoteClickTarget('note', 'Or Elimelech’s sons.', 'rut')).toEqual({
      action: 'popover',
    })
  })
})
