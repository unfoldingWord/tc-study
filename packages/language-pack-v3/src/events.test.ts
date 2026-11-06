import { describe, expect, test } from 'bun:test'
import { EVENT_CODES, EVENT_KINDS, eventCode, eventKind } from './events'

// book.cddl, "Texts": 0 chapter starts, 1 verse starts, 2 a node opens, 3 the last open node closes.
describe('event codes', () => {
  test('are those of book.cddl', () => {
    expect(EVENT_CODES).toEqual({ chapter: 0, verse: 1, open: 2, close: 3 })
    expect([...EVENT_KINDS]).toEqual(['chapter', 'verse', 'open', 'close'])
  })

  test('kind and code are the inverse of each other', () => {
    for (const kind of EVENT_KINDS) expect(eventKind(eventCode(kind)!)).toBe(kind)
    for (const code of [0, 1, 2, 3]) expect(eventCode(eventKind(code)!)).toBe(code)
  })

  test('a kind or a code that is not one of the four is undefined', () => {
    for (const kind of ['', 'milestone', 'Chapter', 'constructor', '__proto__', 'toString']) expect(eventCode(kind)).toBeUndefined()
    for (const code of [-1, 4, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(eventKind(code)).toBeUndefined()
  })
})
