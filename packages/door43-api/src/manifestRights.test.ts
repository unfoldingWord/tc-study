import { describe, expect, test } from 'bun:test'
import { manifestRights } from './manifestRights'

describe('manifestRights', () => {
  test("reads dublin_core's rights, quoted or not, with Windows line ends", () => {
    expect(manifestRights("dublin_core:\n  rights: 'CC BY-SA 4.0'\n  subject: 'Greek Lexicon'\n")).toBe('CC BY-SA 4.0')
    expect(manifestRights('dublin_core:\r\n  rights: "CC BY 4.0"\r\n')).toBe('CC BY 4.0')
    expect(manifestRights('dublin_core:\r\n  rights: CC BY-SA 4.0\r\n  title: x\r\n')).toBe('CC BY-SA 4.0')
  })

  test('a manifest that names no rights gives none', () => {
    expect(manifestRights('dublin_core:\n  title: Léxico hebreo\n')).toBeUndefined()
    expect(manifestRights('')).toBeUndefined()
    expect(manifestRights("dublin_core:\n  rights: '   '\n")).toBeUndefined()
    expect(manifestRights("dublin_core:\n  rights: ''\n  subject: x\n")).toBeUndefined()
  })
})
