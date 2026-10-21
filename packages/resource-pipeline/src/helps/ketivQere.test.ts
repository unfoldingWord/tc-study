/**
 * Ruth 4:5 says קניתי (ketiv); its qere קָנִ֔יתָה is in a footnote and is not a word of the verse. es-419's notes quote
 * the qere (ut23 «בְּ⁠יוֹם־קְנוֹתְ⁠ךָ֥ & וּ֠⁠מֵ⁠אֵת & קָנִ֔יתָה») and the GLT aligns «adquieres» to it
 * (`x-content="קָנִ֔יתָה"`), so the note lost its last word: the quote did not find the ketiv, and the ketiv's id
 * (`rut 4:5:קניתי:1`) is not the one the alignment gives. From the USFM to the words the note marks in the GLT.
 */

import { describe, expect, test } from 'bun:test'
import { buildFullChapter } from '../scripture/scripturePreparer'
import { extractPreparedBroadcastTokens } from '../scripture/extractPreparedBroadcastTokens'
import { toCachedQuoteTokens } from './helpsQuoteCache'
import { buildQuoteTokens } from './quoteTokens/buildQuoteTokens'
import { semanticIdMatchKey } from './semanticIdMatchKey'
import { DYA3, UT23, marked, ruth } from './ketivQere.fixtures'

describe('a note that quotes a qere marks the word aligned to it', () => {
  test('the quote tokens of ut23 end in the ketiv, which keeps its qere through the cache', async () => {
    const { original } = await ruth()
    const tokens = toCachedQuoteTokens(buildQuoteTokens({ link: UT23, originalChapters: [original], bookCode: 'RUT' }))
    expect(tokens.map((t) => t.text)).toEqual(['בְּ⁠יוֹם', 'קְנוֹתְ⁠ךָ֥', 'וּ֠⁠מֵ⁠אֵת', 'קניתי'])
    expect(tokens[3]).toMatchObject({ qere: 'קָנִ֔יתָה', qereOccurrence: 1, occurrence: 1 })
  })

  test('in the GLT, ut23 and dya3 mark «adquieres»', async () => {
    const { glt, original } = await ruth()
    expect(marked([UT23, DYA3], original, glt.viewModel, 'es-419')).toEqual({
      ut23: ['El', 'día', 'que', 'adquieras', 'también', 'adquieres'],
      dya3: ['también', 'Rut', 'adquieres'],
    })
  })

  test('in the Hebrew Bible itself, ut23 marks the ketiv', async () => {
    const { uhb, original } = await ruth()
    expect(marked([UT23], original, uhb.viewModel, 'hbo').ut23).toEqual([
      'בְּ⁠יוֹם',
      'קְנוֹתְ⁠ךָ֥',
      'וּ֠⁠מֵ⁠אֵת',
      'קניתי',
    ])
  })

  test("the prepared Hebrew Bible keeps the qere's key next to the ketiv's", async () => {
    const { uhb } = await ruth()
    const full = buildFullChapter(uhb.viewModel, 4)
    expect(full.matchKeys).toContain(semanticIdMatchKey('rut 4:5:קניתי:1'))
    expect(full.matchKeys).toContain(semanticIdMatchKey('rut 4:5:קָנִ֔יתָה:1'))
    const ketiv = extractPreparedBroadcastTokens('rut', 4, full, 5, 5).find((t) => t.text === 'קניתי')!
    expect(ketiv.semanticId).toBe('rut 4:5:קניתי:1')
    expect(ketiv.qereSemanticId).toBe(semanticIdMatchKey('rut 4:5:קָנִ֔יתָה:1'))
  })
})
