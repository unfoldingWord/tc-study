/**
 * A ketiv of the Hebrew Bible is the verse's word, and its qere is not (ketiv-qere-footnote.test.ts). But unfoldingWord's
 * notes, word links and the bridge texts' alignments name the qere: Ruth 4:5 says קניתי, and its notes quote, and
 * the GLT's `\zaln` gives, קָנִ֔יתָה. The ketiv's token carries the qere from the footnote right after it, with the
 * qere's own occurrence and id, without the qere becoming a word of the verse.
 */

import { describe, expect, test } from 'bun:test'

import { collectUsjWords, flattenUsjTokens, semanticIdFor, USJProcessor } from '../src/index'

// Ruth 4:5 of the UHB, as Door43 writes it (attributes kept short).
const UHB_RUT = `\\id RUT
\\usfm 3.0
\\h Ruth
\\mt Ruth
\\c 4
\\p
\\v 5
\\w וַ⁠יֹּ֣אמֶר|lemma="אָמַר"\\w*
\\w בֹּ֔עַז|lemma="בֹּעַז"\\w*
\\w בְּ⁠יוֹם|lemma="יוֹם"\\w*־\\w קְנוֹתְ⁠ךָ֥|lemma="קָנָה"\\w*
\\w הַ⁠שָּׂדֶ֖ה|lemma="שָׂדֶה"\\w*
\\w מִ⁠יַּ֣ד|lemma="יָד"\\w*
\\w נָעֳמִ֑י|lemma="נׇעֳמִי"\\w*
\\w וּ֠⁠מֵ⁠אֵת|lemma="אֵת"\\w*
\\w ר֣וּת|lemma="רוּת"\\w*
\\w הַ⁠מּוֹאֲבִיָּ֤ה|lemma="מוֹאָבִי"\\w*
\\w אֵֽשֶׁת|lemma="אִשָּׁה"\\w*־\\w הַ⁠מֵּת֙|lemma="מוּת"\\w*
\\w קניתי|lemma="קָנָה"\\w*
\\f + \\ft Q \\+w קָנִ֔יתָה|lemma="קָנָה"\\+w*\\f*
\\w לְ⁠הָקִ֥ים|lemma="קוּם"\\w*
\\w שֵׁם|lemma="שֵׁם"\\w*־\\w הַ⁠מֵּ֖ת|lemma="מוּת"\\w*
\\w עַל|lemma="עַל"\\w*־\\w נַחֲלָתֽ⁠וֹ|lemma="נַחֲלָה"\\w*׃
\\v 6
\\w וַ⁠יֹּ֣אמֶר|lemma="אָמַר"\\w*
\\w תִגְאַל|lemma="גָּאַל"\\w*
\\f + \\ft Or perhaps \\+w תִגְאָל|lemma="גָּאַל"\\+w*\\f*
\\w הַ⁠גֹּאֵ֗ל|lemma="גָּאַל"\\w*
`

async function ruthTokens() {
  const { viewModel } = await new USJProcessor().processUSFM(UHB_RUT, 'rut', 'Ruth', { language: 'hbo' })
  return flattenUsjTokens(viewModel, 4)
}

describe('a ketiv carries its qere', () => {
  test('the verse keeps its words, the ketiv among them, and the qere is not one of them', async () => {
    const verse = (await ruthTokens()).filter((t) => t.verseRef.endsWith('4:5')).map((t) => t.content)
    expect(verse).toHaveLength(18)
    expect(verse[12]).toBe('קניתי')
    expect(verse).not.toContain('קָנִ֔יתָה')
  })

  test('the ketiv token has the qere, its occurrence and the id alignments give it', async () => {
    const ketiv = (await ruthTokens()).find((t) => t.content === 'קניתי')!
    expect(ketiv.semanticId).toBe(semanticIdFor('rut 4:5', 'קניתי', 1))
    expect(ketiv.qere).toBe('קָנִ֔יתָה')
    expect(ketiv.qereOccurrence).toBe(1)
    expect(ketiv.qereSemanticId).toBe(semanticIdFor('rut 4:5', 'קָנִ֔יתָה', 1))
  })

  test('no other word has a qere, and a note that is not a qere («Or perhaps») gives none', async () => {
    const withQere = (await ruthTokens()).filter((t) => t.qere)
    expect(withQere.map((t) => t.content)).toEqual(['קניתי'])
  })

  test('collectUsjWords gives the qere only to the word right before the note', () => {
    const w = (word: string) => ({ type: 'char', marker: 'w', content: [word] })
    const note = { type: 'note', marker: 'f', caller: '+', content: [{ type: 'char', marker: 'ft', content: ['Q ', w('ב')] }] }
    const usj = {
      content: [
        { type: 'chapter', marker: 'c', number: '1', sid: 'RUT 1' },
        { type: 'para', marker: 'p', content: [{ type: 'verse', marker: 'v', number: '1', sid: 'RUT 1:1' }, w('א'), ' ', note, ' ', w('ג'), ' text ', note] },
      ],
    }
    expect(collectUsjWords(usj, 'RUT').map((x) => [x.content, x.qere])).toEqual([
      ['א', 'ב'],
      ['ג', undefined],
    ])
  })
})
