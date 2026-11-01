import { describe, expect, test } from 'bun:test'
import { manifestRights } from './manifestRights'

describe('manifestRights', () => {
  test("reads dublin_core's rights, quoted or not, with Windows line ends", () => {
    expect(manifestRights("dublin_core:\n  rights: 'CC BY-SA 4.0'\n  subject: 'Greek Lexicon'\n")).toBe('CC BY-SA 4.0')
    expect(manifestRights('dublin_core:\r\n  rights: "CC BY 4.0"\r\n')).toBe('CC BY 4.0')
    expect(manifestRights('dublin_core:\r\n  rights: CC BY-SA 4.0\r\n  title: x\r\n')).toBe('CC BY-SA 4.0')
  })

  test('a quoted rights with a comment after it, or on the last line with no line end, is read', () => {
    expect(manifestRights("dublin_core:\n  rights: 'CC BY-SA 4.0' # the licence\n")).toBe('CC BY-SA 4.0')
    expect(manifestRights('dublin_core:\r\n  rights: "CC BY 4.0"  # the licence\r\n')).toBe('CC BY 4.0')
    expect(manifestRights("dublin_core:\n  rights: 'CC BY-SA 4.0'")).toBe('CC BY-SA 4.0')
    expect(manifestRights('dublin_core:\n  rights: CC0')).toBe('CC0')
  })

  test('a manifest that names no rights gives none', () => {
    expect(manifestRights('dublin_core:\n  title: Léxico hebreo\n')).toBeUndefined()
    expect(manifestRights('')).toBeUndefined()
    expect(manifestRights("dublin_core:\n  rights: '   '\n")).toBeUndefined()
    expect(manifestRights("dublin_core:\n  rights: ''\n  subject: x\n")).toBeUndefined()
    expect(manifestRights("dublin_core:\n  rights: ''\n")).toBeUndefined()
    expect(manifestRights('dublin_core:\r\n  rights: ""\r\n')).toBeUndefined()
  })

  test("an empty rights names none: the next line's key is no licence", () => {
    expect(manifestRights('dublin_core:\n  rights:\n  subject: Greek Lexicon\n')).toBeUndefined()
    expect(manifestRights("dublin_core:\r\n  rights:\r\n  subject: 'Greek Lexicon'\r\n")).toBeUndefined()
    expect(manifestRights('dublin_core:\n  rights:   \n  subject: Greek Lexicon\n')).toBeUndefined()
    expect(manifestRights('dublin_core:\n  rights:\n\n  subject: Greek Lexicon\n')).toBeUndefined()
  })

  test('only a rights key names the licence, not rights: inside another key or value', () => {
    expect(manifestRights("dublin_core:\n  description: 'All rights: reserved'\n")).toBeUndefined()
    expect(manifestRights("dublin_core:\r\n  rights:\r\n  description: 'All rights: reserved'\r\n")).toBeUndefined()
    expect(manifestRights('dublin_core:\n  copyrights: x\n')).toBeUndefined()
  })

  test('rights with no value on the last line of the file names none', () => {
    expect(manifestRights('dublin_core:\n  title: x\n  rights:')).toBeUndefined()
    expect(manifestRights('dublin_core:\n  title: x\n  rights:\n')).toBeUndefined()
    expect(manifestRights('dublin_core:\r\n  title: x\r\n  rights:  \r\n')).toBeUndefined()
  })
})
