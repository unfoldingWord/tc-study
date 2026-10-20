/**
 * Ruth 4:5 says קניתי (ketiv); its qere קָנִ֔יתָה is in a footnote and is not a word of the verse. es-419's notes quote
 * the qere (ut23 «בְּ⁠יוֹם־קְנוֹתְ⁠ךָ֥ & וּ֠⁠מֵ⁠אֵת & קָנִ֔יתָה») and the GLT aligns «adquieres» to it
 * (`x-content="קָנִ֔יתָה"`), so the note lost its last word: the quote did not find the ketiv, and the ketiv's id
 * (`rut 4:5:קניתי:1`) is not the one the alignment gives. From the USFM to the words the note marks in the GLT.
 */

import { describe, expect, test } from 'bun:test'
import { USJProcessor } from '@bt-synergy/usj-processor'
import { viewModelChapterToOptimized, type TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { buildFullChapter } from '../scripture/scripturePreparer'
import { extractPreparedBroadcastTokens } from '../scripture/extractPreparedBroadcastTokens'
import { batchAlignLinks } from './batchAlignLinks'
import { toCachedQuoteTokens } from './helpsQuoteCache'
import { buildQuoteTokens } from './quoteTokens/buildQuoteTokens'
import { semanticIdMatchKey } from './semanticIdMatchKey'

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
`

const zaln = (content: string, words: string[]) =>
  `\\zaln-s |x-occurrence="1" x-occurrences="1" x-content="${content}"\\*` +
  words.map((w) => `\\w ${w}|x-occurrence="1" x-occurrences="1"\\w*`).join(' ') +
  '\\zaln-e\\*'

// The GLT's Ruth 4:5, shortened: «El día que adquieras el campo … también a Rut … adquieres».
const GLT_RUT = `\\id RUT
\\usfm 3.0
\\h Rut
\\mt Rut
\\c 4
\\p
\\v 5 ${zaln('בֹּ֔עַז', ['Booz'])} ${zaln('וַ⁠יֹּ֣אמֶר', ['dijo'])}: ${zaln('בְּ⁠יוֹם', ['El', 'día'])} ${zaln('קְנוֹתְ⁠ךָ֥', ['que', 'adquieras'])} ${zaln('הַ⁠שָּׂדֶ֖ה', ['el', 'campo'])}, ${zaln('וּ֠⁠מֵ⁠אֵת', ['también'])} ${zaln('ר֣וּת', ['Rut'])} ${zaln('קָנִ֔יתָה', ['adquieres'])}.
`

const link = (id: string, origWords: string): TranslationWordsLink => ({
  id,
  reference: '4:5',
  origWords,
  occurrence: '1',
  tags: '',
  twLink: '',
})

const UT23 = link('ut23', 'בְּ⁠יוֹם־קְנוֹתְ⁠ךָ֥ & וּ֠⁠מֵ⁠אֵת & קָנִ֔יתָה')
const DYA3 = link('dya3', 'וּ֠⁠מֵ⁠אֵת ר֣וּת & קָנִ֔יתָה')

async function ruth() {
  const processor = new USJProcessor()
  const uhb = await processor.processUSFM(UHB_RUT, 'rut', 'Ruth', { language: 'hbo' })
  const glt = await processor.processUSFM(GLT_RUT, 'rut', 'Rut', { language: 'es-419' })
  const original = viewModelChapterToOptimized(uhb.viewModel, 4)!
  return { uhb, glt, original }
}

function marked(
  links: TranslationWordsLink[],
  original: ReturnType<typeof viewModelChapterToOptimized>,
  viewModel: Parameters<typeof buildFullChapter>[0],
  textLanguage: string
): Record<string, string[]> {
  const full = buildFullChapter(viewModel, 4)
  const targetTokens = extractPreparedBroadcastTokens('rut', 4, full, 1, 999)
  const results = batchAlignLinks({
    // The warm path aligns with quote tokens read back from the cache: they go through it here too.
    links: links.map((l) => ({
      ...l,
      quoteTokens: toCachedQuoteTokens(buildQuoteTokens({ link: l, originalChapters: [original!], bookCode: 'RUT' })) as never,
    })),
    targetTokens,
    bookCode: 'rut',
    currentChapter: 4,
    tokenBook: 'rut',
    tokenChapter: 4,
    tokenStartVerse: 1,
    tokenEndVerse: 999,
    hasTokens: true,
    quoteBuildReady: true,
    resourceKey: 'es-419_gl/es-419/tn',
    textLanguage,
  })
  return Object.fromEntries(
    results.map((r) => [r.id, (r.alignedTokens ?? []).filter((t) => t.type === 'word').map((t) => t.content)])
  )
}

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
