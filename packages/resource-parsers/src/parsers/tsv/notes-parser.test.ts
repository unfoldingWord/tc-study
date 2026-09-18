import { describe, expect, test } from 'bun:test'
import { NOTES_TSV_PARSER_VERSION, NotesProcessor } from './notes-parser'

const TSV = `Reference	ID	Tags	SupportReference	Quote	Occurrence	Note
5:1,3,8,12	sbh4		rc://*/ta/man/translate/writing-poetry	יְהוָ֔ה & יְֽהוָ֔ה & יְהוָ֕ה & יְהוָ֑ה	1	The direct address to Yahweh
5:2-3	svyb		rc://*/ta/man/translate/writing-poetry	לְקזוֹל & קוֹלִ֑י	1	sound and voice
5:1	plain		rc://*/ta/man/translate/figs-idiom	הַאֲזִינָה	1	give ear
front:intro	intro		rc://*/ta/man/translate/writing-intro		0	intro
`

describe('NotesProcessor references', () => {
  test('preserves comma lists and ranges from TSV', async () => {
    const processed = await new NotesProcessor().processNotes(TSV, 'psa', 'Psalms')
    expect(processed.metadata.parserVersion).toBe(NOTES_TSV_PARSER_VERSION)
    const byId = Object.fromEntries(processed.notes.map((n) => [n.id, n.reference]))
    expect(byId.sbh4).toBe('5:1,3,8,12')
    expect(byId.svyb).toBe('5:2-3')
    expect(byId.plain).toBe('5:1')
    expect(byId.intro).toBe('1:1')
    expect(processed.notesByChapter['5']?.map((n) => n.id)).toEqual(['sbh4', 'svyb', 'plain'])
  })

  test('processedNotesParserIsCurrent rejects pre-v2 blobs', async () => {
    const { processedNotesParserIsCurrent } = await import('./notes-parser')
    expect(processedNotesParserIsCurrent({ metadata: { parserVersion: '2' } })).toBe(true)
    expect(processedNotesParserIsCurrent({ metadata: {} })).toBe(false)
    expect(processedNotesParserIsCurrent(null)).toBe(false)
  })
})
