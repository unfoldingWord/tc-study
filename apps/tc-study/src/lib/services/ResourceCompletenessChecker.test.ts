import { describe, expect, test } from 'bun:test'
import { hasIngredientPayload } from './ResourceCompletenessChecker'

describe('hasIngredientPayload', () => {
  test('treats thin chapterNumbers index as usable scripture', () => {
    expect(
      hasIngredientPayload({ content: { chapterNumbers: [1, 2, 3] } }, 'scripture')
    ).toBe(true)
    expect(hasIngredientPayload({ chapterNumbers: [1] }, 'scripture')).toBe(true)
  })

  test('treats chapter-1 usj/chapters payload as usable scripture', () => {
    expect(
      hasIngredientPayload(
        {
          content: {
            usj: { type: 'USJ', content: [{ c: 1 }] },
            chapters: [{ number: 1, content: [{ c: 1 }] }],
          },
        },
        'scripture'
      )
    ).toBe(true)
  })

  test('rejects empty or missing scripture payloads', () => {
    expect(hasIngredientPayload(null, 'scripture')).toBe(false)
    expect(hasIngredientPayload(undefined, 'scripture')).toBe(false)
    expect(hasIngredientPayload({}, 'scripture')).toBe(false)
    expect(hasIngredientPayload({ content: {} }, 'scripture')).toBe(false)
    expect(hasIngredientPayload({ content: { chapterNumbers: [] } }, 'scripture')).toBe(
      false
    )
  })
})
