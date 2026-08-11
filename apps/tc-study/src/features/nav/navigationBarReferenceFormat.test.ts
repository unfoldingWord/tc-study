import { describe, expect, test } from 'bun:test'
import { formatReferenceParts } from './navigationBarReferenceFormat'
import { formatVerseRefParts } from '../../utils/bookNames'

describe('English LTR reference formatting', () => {
  test('formatReferenceParts keeps book-then-chapter:verse for English', () => {
    const parts = formatReferenceParts(
      { book: 'tit', chapter: 3, verse: 1 },
      'verse',
      false,
      {
        ingredients: [{ identifier: 'tit', title: 'Titus' }],
      }
    )
    expect(parts.bookPart).toBe('Titus')
    expect(parts.numberPart).toBe('3:1')
    // Display order for LTR chrome: `${bookPart} ${numberPart}` → "Titus 3:1"
    expect(`${parts.bookPart} ${parts.numberPart}`).toBe('Titus 3:1')
  })

  test('LTR display order is book then numbers (not numbers then book)', () => {
    const parts = formatReferenceParts(
      { book: 'tit', chapter: 3, verse: 1 },
      'chapter',
      false,
      { ingredients: [{ identifier: 'tit', title: 'Titus' }] }
    )
    // Compact nav renders LTR as [bookPart, numberPart] → "Titus 3:1"
    const ltrDisplay = [parts.bookPart, parts.numberPart].join(' ')
    const rtlLooking = [parts.numberPart, parts.bookPart].join(' ')
    expect(ltrDisplay).toBe('Titus 3:1')
    expect(rtlLooking).toBe('3:1 Titus')
    expect(ltrDisplay).not.toBe(rtlLooking)
  })

  test('formatVerseRefParts keeps LTR order for English section headers', () => {
    const parts = formatVerseRefParts('Titus', '3:1', false)
    expect(parts).toEqual({ bookPart: 'Titus', numberPart: '3:1' })
    expect(`${parts.bookPart} ${parts.numberPart}`).toBe('Titus 3:1')
  })

  test('formatVerseRefParts swaps number only when isRtl', () => {
    const parts = formatVerseRefParts('Titus', '3:1', true)
    expect(parts.bookPart).toBe('Titus')
    expect(parts.numberPart).toBe('1:3')
  })
})
