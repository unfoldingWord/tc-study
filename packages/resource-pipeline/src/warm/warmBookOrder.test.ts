import { describe, expect, test } from 'bun:test'
import { CANON_BOOK_ORDER as PARTS_BOOK_ORDER } from '@bt-synergy/language-pack'
import { CANON_BOOK_ORDER } from './warmBookOrder'

describe('canon book order', () => {
  // language-pack orders the units it applies by its own copy (it cannot import this package): they must not diverge.
  test('language-pack applies book units in the order the warm fill walks them', () => {
    expect([...PARTS_BOOK_ORDER]).toEqual([...CANON_BOOK_ORDER])
  })
})
