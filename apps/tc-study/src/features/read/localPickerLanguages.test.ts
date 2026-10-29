import { describe, expect, test } from 'bun:test'
import { localPickerLanguages } from './localPickerLanguages'

const SETS = {
  bible: ['Bible', 'Aligned Bible'],
  obs: ['Open Bible Stories'],
  bibleHelps: ['TSV Translation Notes', 'Translation Words'],
  obsHelps: ['TSV OBS Translation Notes'],
}

const ROWS = [
  { language: 'es-419', subject: 'Aligned Bible', languageTitle: 'Español Latinoamérica', languageDirection: 'ltr' as const },
  { language: 'es-419', subject: 'TSV Translation Notes' },
  { language: 'el-x-koine', subject: 'Greek New Testament' },
  { language: 'fr', subject: 'TSV Translation Notes', languageTitle: 'Français' },
]

describe('localPickerLanguages', () => {
  test('lists the languages this device can read, named from their catalog rows', () => {
    const langs = localPickerLanguages({ rows: ROWS, sets: SETS, kind: 'global' })

    expect(langs.map((l) => l.code)).toEqual(['es-419'])
    expect(langs[0].name).toBe('Español Latinoamérica')
    expect(langs[0].direction).toBe('ltr')
    expect(langs[0].availability).toEqual({ bible: true, obs: false, bibleHelps: true, obsHelps: false })
  })

  test('a helps list keeps languages with helps on this device', () => {
    const langs = localPickerLanguages({ rows: ROWS, sets: SETS, kind: 'helps' })

    expect(langs.map((l) => l.code).sort()).toEqual(['es-419', 'fr'])
  })
})
