import { describe, expect, test } from 'bun:test'
import { readSegment, writeSegment } from '../codec/container'
import { verseId } from '../ids'
import type { BookModel } from '../model'
import { BOOK_TABLES, bookView } from '../read/book'
import { type AquiferArticle, aquiferNotes, aquiferQuestions, buildTaMap, htmlToMarkdown, taFromNotes, titleKey } from './aquiferHelps'
import fixture from './aquiferHelps.fixture.json'
import { bookSegment } from './book'

// The fixture is cut from the real Hindi files (see `_source` in it): four notes and two questions of Titus, and the Manual articles they link.
const notes = fixture.notes as AquiferArticle[]
const questions = fixture.questions as AquiferArticle[]
const NOTES = 'aquifer/hi/tn'
const QUESTIONS = 'aquifer/hi/tq'
const TIT = 56_000_000
const taMap = () => buildTaMap(fixture.hinTa, fixture.engTa, fixture.enTaTitles).map

describe('taFromNotes', () => {
  const note = (resource: NonNullable<AquiferArticle['associations']>['resource']): AquiferArticle => ({ content_id: 1, associations: { resource } })

  test('takes the Manual articles the notes are associated with: content_id, reference_id of the English twin, label as title', () => {
    const articles = taFromNotes([
      note([
        { content_id: '727920', reference_id: '26691', resource_code: 'UWTranslationManual', label: 'Frases Nominales Generales' },
        { content_id: '5', reference_id: '9', resource_code: 'UWTranslationWords', label: 'not the Manual' },
        { content_id: '6', resource_code: 'UWTranslationManual', label: 'no reference_id' },
        { content_id: '8', reference_id: 'UW_TXManual_Text', resource_code: 'UWTranslationManual', label: 'text reference_id first' },
        { content_id: '8', reference_id: '26733', resource_code: 'UWTranslationManual', label: 'then a numeric one' },
        { content_id: '33280', reference_id: '26694', resource_code: 'UWTranslationManual', label: 'known wrong' },
        { reference_id: '7', resource_code: 'UWTranslationManual', label: 'no content_id' },
      ]),
      note([{ content_id: 727920, reference_id: '99999', resource_code: 'UWTranslationManual', label: 'seen again' }]),
      { content_id: 2 },
    ])
    expect(articles).toEqual([
      { content_id: '727920', reference_id: '26691', title: 'Frases Nominales Generales' },
      { content_id: '8', reference_id: '26733', title: 'then a numeric one' },
    ])
  })

  test('buildTaMap, with it as the language Manual, finds the ta: ids through the English twins', () => {
    const { map } = buildTaMap(taFromNotes(notes), fixture.engTa, fixture.enTaTitles)
    expect(map.size).toBeGreaterThan(0)
    for (const id of map.values()) expect(id).toMatch(/^ta:translate\//)
  })
})

describe('buildTaMap', () => {
  test('matches Hindi articles to the Door43 ta: ids through the English title, lower case', () => {
    const { map, unmatched } = buildTaMap(fixture.hinTa, fixture.engTa, fixture.enTaTitles)
    expect(map.get('727303')).toBe('ta:translate/figs-abstractnouns')
    expect(map.get('727304')).toBe('ta:translate/figs-activepassive')
    expect(unmatched.map((u) => [u.contentId, u.reason])).toEqual([['799943', 'no-english-article']])
    expect(map.size).toBe(3)
  })

  test('the three "Word Order" articles are settled by the pinned override table, by the English reference_id', () => {
    // en_ta has three articles with that title, so the title alone cannot say which is which.
    expect(fixture.enTaTitles.titles).not.toHaveProperty('Word Order')
    const eng = [26709, 26710, 26711].map((ref, i) => ({ content_id: 33295 + i, reference_id: ref, title: 'Word Order' }))
    const hin = [26709, 26710, 26711].map((ref, i) => ({ content_id: 900 + i, reference_id: ref, title: 'शब्द क्रम' }))
    const { map, unmatched } = buildTaMap(hin, eng, { titles: {} })
    expect(unmatched).toEqual([])
    expect([...map]).toEqual([
      ['900', 'ta:translate/figs-order'],
      ['901', 'ta:translate/figs-ordergrk'],
      ['902', 'ta:translate/figs-orderheb'],
    ])
    expect(taMap().get('727338')).toBe('ta:translate/figs-order')
  })

  test('a shared title is never matched, even when the caller gives no ambiguous list', () => {
    const { map, unmatched } = buildTaMap(
      [{ content_id: 1, reference_id: 10, title: 'x' }],
      [{ content_id: 2, reference_id: 10, title: 'Same Title' }],
      { titles: { 'Same Title': 'ta:translate/a', 'same  title': 'ta:translate/b' } },
    )
    expect(map.size).toBe(0)
    expect(unmatched[0].reason).toBe('ambiguous-title')
  })

  test('titles compare with NFC, case, spaces and the unfoldingWord® decoration left out', () => {
    expect(titleKey('  Using the unfoldingWord® Translation Notes ')).toBe('using the translation notes')
    expect(titleKey('e\u0301')).toBe(titleKey('\u00e9'))
    const { map, unmatched } = buildTaMap(
      [{ content_id: 1, reference_id: 10, title: 'x' }],
      [{ content_id: 2, reference_id: 10, title: 'Using the  unfoldingWord® Translation Notes' }],
      { titles: { 'Using the Translation Notes': 'ta:intro/Notes-Intro' } },
    )
    expect(map.get('1')).toBe('ta:intro/notes-intro')
    expect(unmatched).toEqual([])
  })

  test('an English title Door43 does not have is unmatched', () => {
    const { map, unmatched } = buildTaMap([{ content_id: 1, reference_id: 10, title: 'x' }], [{ content_id: 2, reference_id: '10', title: 'Nothing' }], { titles: {} })
    expect(map.size).toBe(0)
    expect(unmatched).toEqual([{ contentId: '1', title: 'x', reason: 'no-door43-title' }])
  })
})

describe('htmlToMarkdown', () => {
  test('keeps p, strong, em, lists, a and br; other tags become their text; entities are decoded', () => {
    const html = '<p><span>a &amp; <strong>b </strong>c</span><br>d <em>e</em> <a href="http://x/y">z</a> <u>u</u></p><ul><li><p>one</p></li><li>two</li></ul><ol><li>x</li></ol><p></p>'
    expect(htmlToMarkdown(html)).toBe('a & **b** c\nd *e* [z](http://x/y) u\n\n- one\n- two\n\n1. x')
  })

  test('a literal \\n is a line break and headings are #', () => {
    expect(htmlToMarkdown('<h2>T</h2><p>A:\\n\\nB &quot;q&quot; &#39;s&#39;</p>')).toBe('## T\n\nA:\n\nB "q" \'s\'')
  })

  test('an href is kept only for http, https and mailto', () => {
    expect(htmlToMarkdown('<p><a href="javascript:alert(1)">x</a> <a href=" JaVaScRiPt:y">y</a> <a href="data:text/html,z">z</a> <a href="https://a/b">ok</a> <a href="mailto:m@x">m</a></p>')).toBe('x y z [ok](https://a/b) [m](mailto:m@x)')
  })

  test('a kept href cannot break out of the link: ( ) < > and spaces are percent-encoded', () => {
    expect(htmlToMarkdown('<p><a href="https://a)[x](javascript:alert(1))">t</a> <a href="https://a/b c<d>">u</a></p>')).toBe(
      '[t](https://a%29[x]%28javascript:alert%281%29%29) [u](https://a/b%20c%3Cd%3E)',
    )
  })

  test('U+E000 and U+E001 in the input are dropped, so they cannot forge bold', () => {
    expect(htmlToMarkdown('<p>abc</p>')).toBe('abc')
  })

  test('NUL and control characters are dropped, tab and newline stay', () => {
    expect(htmlToMarkdown('<p>a&#0;b&#x1;c&#8;d&#127;e&#9;f&#10;g</p>')).toBe('abcde\tf\ng')
  })

  test('script, style, iframe, object, embed and noscript are dropped with their content', () => {
    const html = '<p>a<script>alert(1)</script>b<style>p{}</style><iframe src="x">in</iframe><object>o<embed>e</object><noscript>n</noscript>c</p>'
    expect(htmlToMarkdown(html)).toBe('abc')
  })

  test('a Manual link goes through the resolver', () => {
    const html = '<p>देखें: <data class="resource-ref" data-content-id="7" data-resource-code="UWTranslationManual" data-language="hin">label</data></p>'
    expect(htmlToMarkdown(html, ({ contentId }) => `[[ta:x/${contentId}]]`)).toBe('देखें: [[ta:x/7]]')
    expect(htmlToMarkdown(html)).toBe('देखें: label')
  })
})

describe('Hebrew and Greek quotes, by script (real forms of the Hindi notes)', () => {
  const one = (html: string) => aquiferNotes([{ content_id: 1, index_reference: '01001001', content: html }], 'gen', NOTES, new Map()).rows[0]

  test('an rtl span that is not in strong', () => {
    const r = one("<p><span style='direction: rtl;'>אַרְבָּעִ֥ים י֖וֹם</span></p><p><strong>&quot;चालीस दिन&quot;</strong></p><p>टिप्पणी</p>")
    expect(r.cols.quote).toBe('אַרְבָּעִ֥ים י֖וֹם')
    expect(r.cols.note).toBe('**"चालीस दिन"**\n\nटिप्पणी')
  })

  test('a Hindi gloss in parentheses first, then the quote in parentheses, with & kept (Deuteronomy 2:34 form, article 972725)', () => {
    const r = one('<p>  (और हमने पूरी तरह नाश कर दिया और नाश करते हुए)    </p><p>(וַ⁠נַּחֲרֵ֣ם &amp; הַחֲרֵם֙)</p><p><strong>&quot;और हमने - सत्यानाश कर डाला&quot; </strong></p><p>मूलभाषा</p>')
    expect(r.cols.quote).toBe('וַ⁠נַּחֲרֵ֣ם & הַחֲרֵם֙')
    expect(r.cols.note).toBe('(और हमने पूरी तरह नाश कर दिया और नाश करते हुए)\n\n**"और हमने - सत्यानाश कर डाला"**\n\nमूलभाषा')
  })

  test('Greek by script in an ltr span in strong, and a Hindi or Latin paragraph is never a quote', () => {
    expect(one("<p><strong><span style='direction: ltr;'>τὸν &amp; πρῶτον λόγον</span></strong></p><p>x</p>").cols.quote).toBe('τὸν & πρῶτον λόγον')
    expect(one('<p><strong>&quot;मैंने पहली पुस्तिका लिखी&quot;</strong></p><p>x</p>').cols.quote).toBeUndefined()
    expect(one('<p>Connecting Statement:</p><p>x</p>').cols.quote).toBeUndefined()
    expect(one("<p><span style='direction: ltr;'>Hindi और Greek τὸν</span></p><p>x</p>").cols.quote).toBeUndefined()
  })
})

describe('bold', () => {
  test('adjacent and nested bold around quote marks are one run (real: Genesis, note 1)', () => {
    const html = '<p><strong>&quot;</strong><span><strong>चालीस दिन तक</strong></span><strong>&quot;</strong></p>'
    expect(htmlToMarkdown(html)).toBe('**"चालीस दिन तक"**')
    expect(htmlToMarkdown('<p><strong>&quot;<strong>चालीस</strong> दिन&quot;</strong></p>')).toBe('**"चालीस दिन"**')
    expect(htmlToMarkdown('<p>a<strong></strong>b <strong> </strong>c</p>')).toBe('ab c')
  })

  test('literal ** around a <strong> in the data (note 913792) is one bold', () => {
    expect(htmlToMarkdown('<p>यहाँ, **<strong>सुन</strong>** एक</p>')).toBe('यहाँ, **सुन** एक')
  })
})

describe('aquiferNotes', () => {
  const issues: string[] = []
  const table = aquiferNotes(notes, 'tit', NOTES, taMap(), issues)
  const row = (id: string) => table.rows.find((r) => r.id === id)!

  test('a note: id, reference, the original quote apart and the rest as markdown, the link as [[ta:…]]', () => {
    const r = row('798628')
    expect(r).toMatchObject({ id: '798628', ref: '1:1', from: verseId('tit', 1, 1), to: verseId('tit', 1, 1), concept: 'ta:translate/figs-activepassive' })
    expect(r.from).toBe(56_001_001)
    expect(r.cols.quote).toBe('ἐκλεκτῶν Θεοῦ')
    expect(r.cols.note).toStartWith('**"परमेश्वर के चुने हुए लोगों के"**\n\n')
    expect(r.cols.note).toEndWith('देखें: [[ta:translate/figs-activepassive]]')
    expect(Object.keys(r.cols).sort()).toEqual(['note', 'quote'])
  })

  test('the concept comes from the associated resources when the text has no link', () => {
    const r = row('400853')
    expect(r.concept).toBe('ta:translate/figs-abstractnouns')
    expect(r.cols.note).not.toContain('[[')
  })

  test('no original quote: the note has no quote column; the literal \\n is a break', () => {
    const r = row('401023')
    expect(r.cols.quote).toBeUndefined()
    expect(r.cols.note).toContain('Connecting Statement:\n\n')
    expect(r.concept).toBeUndefined()
  })

  test('a chapter introduction is kept at N:intro, with headings and no quote', () => {
    const r = table.rows.find((x) => x.ref === '2:intro')!
    expect(r).toMatchObject({ id: '792810', from: verseId('tit', 2, 0), to: verseId('tit', 2, 0) })
    expect(r.cols.quote).toBeUndefined()
    expect(r.cols.note).toStartWith('# तीतुस 2 सामान्य टिप्पणियाँ')
  })

  test('an unmatched link stays as text and is reported; a repeated id is renamed', () => {
    const copy = structuredClone(notes[2]) as AquiferArticle
    const mine: string[] = []
    const result = aquiferNotes([copy, copy], 'tit', NOTES, new Map(), mine)
    expect(result.rows.map((r) => r.id)).toEqual(['798628', '798628~2'])
    expect(result.rows[0].cols.note).toEndWith('देखें: सक्रिय या निष्क्रिय')
    expect(result.rows[0].concept).toBeUndefined()
    expect(mine.some((line) => line.includes('has no ta: id'))).toBe(true)
    expect(mine.some((line) => line.includes('twice'))).toBe(true)
  })

  test('a verse of another book goes to the book introduction with a line', () => {
    const mine: string[] = []
    const odd: AquiferArticle = { content_id: 9, index_reference: '44001001', content: '<p>x</p>', associations: { passage: [{ start_ref: '44001001', end_ref: '44001001' }] } }
    const result = aquiferNotes([odd], 'tit', NOTES, new Map(), mine)
    expect(result.rows[0]).toMatchObject({ ref: 'front:intro', from: TIT, to: TIT })
    expect(mine.join('\n')).toContain('book introduction')
  })

  test('several passages are covered by one range', () => {
    const range: AquiferArticle = {
      content_id: 5,
      index_reference: '56001002',
      content: '<p>x</p>',
      associations: { passage: [{ start_ref: '56001002', end_ref: '56001004' }, { start_ref: '56001006', end_ref: '56001006' }] },
    }
    expect(aquiferNotes([range], 'tit', NOTES, new Map()).rows[0]).toMatchObject({ ref: '1:2-6', from: 56_001_002, to: 56_001_006 })
  })
})

describe('aquiferQuestions', () => {
  const table = aquiferQuestions(questions, 'tit', QUESTIONS)

  test('the first paragraph is the question, plain, and the rest the response', () => {
    const r = table.rows.find((x) => x.id === '811116')!
    expect(r).toMatchObject({ ref: '1:2', from: 56_001_002, to: 56_001_002 })
    expect(r.concept).toBeUndefined()
    expect(r.cols.question).toBe('परमेश्वर ने अपने चुने हुए लोगों से अनन्त जीवन का वादा कब किया?')
    expect(r.cols.response).toBe('परमेश्वर ने अपने चुने हुओं से सनातन से प्रतिज्ञा की है।')
  })

  test('every row has question and response', () => {
    expect(table.rows).toHaveLength(2)
    for (const r of table.rows) expect(Object.keys(r.cols).sort()).toEqual(['question', 'response'])
  })
})

describe('a book of helps only', () => {
  const model: BookModel = {
    lang: 'hi-x-aquifer',
    book: 'tit',
    orig: ['unfoldingWord/el-x-koine/ugnt', 'v0.40'],
    res: [
      [NOTES, 'UWTranslationNotes@603546c'],
      [QUESTIONS, 'UWTranslationQuestions@f8cc284'],
    ],
    texts: [],
    notes: aquiferNotes(notes, 'tit', NOTES, taMap()),
    questions: aquiferQuestions(questions, 'tit', QUESTIONS),
  }

  test('bookSegment encodes texts: [] and the rows and concepts survive the file', async () => {
    const { bytes } = await writeSegment(bookSegment(model))
    const { seg } = await readSegment(bytes, { known: BOOK_TABLES })
    const back = bookView(seg)
    expect(back.texts).toEqual([])
    expect(back).toEqual(model)
    expect(back.notes!.rows.filter((r) => r.concept !== undefined).map((r) => r.concept)).toEqual(['ta:translate/figs-abstractnouns', 'ta:translate/figs-activepassive'])
    expect(back.questions!.rows[0].cols.question).toContain('अनन्त')
  })
})
