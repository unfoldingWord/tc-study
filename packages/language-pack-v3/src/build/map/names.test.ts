import { describe, expect, test } from 'bun:test'
import type { ArticleModel, BookModel, TextModel } from '../../model'
import { partsSource } from '../../node/partsSource'
import { extractText } from '../bookTexts'
import { extractOrig, OrigIndex } from '../orig'
import { bookNames, conceptNames, obsTitles, subtitlesOf, tocOfText } from './names'

const join = (...path: string[]) => path.join('/')
const DATA = join(import.meta.dir, '..', '..', '..', 'spec', 'tests', 'data')
const GLT = 'es-419_gl/es-419/glt'
const GST = 'es-419_gl/es-419/gst'

async function titusBook(): Promise<BookModel> {
  const src = await partsSource({
    list: join(DATA, 'es-419', 'list.json'),
    partsDir: join(DATA, 'parts'),
    originals: join(DATA, 'originals', 'list.json'),
  })
  const orig = new OrigIndex(await extractOrig(src, 'tit'))
  const texts: TextModel[] = []
  for (const res of [GLT, GST]) {
    const rows: any[] = []
    for await (const row of src.rows({ lang: 'es-419', book: 'tit', resource: res, layer: 'sot' })) rows.push(row)
    texts.push(extractText(rows, 'tit', res, orig))
  }
  return { lang: 'es-419', book: 'tit', orig: ['k', 's'], res: [], texts }
}

const text = (pieces: string[], events: TextModel['events']): TextModel => ({
  res: 'r',
  pieces: pieces.map((p) => [p, false]),
  events,
})

describe('tocOfText', () => {
  test('joins the pieces inside toc1, toc2 and toc3', () => {
    const t = text(['Tit', 'o', 'T', 'Ti'], [
      [0, 'open', 'para:toc1'], [2, 'close', ''],
      [2, 'open', 'para:toc2'], [3, 'close', ''],
      [3, 'chapter', '1'],
    ])
    expect(tocOfText(t)).toEqual(['Tito', 'T', ''])
  })
  test('null without toc1', () => {
    expect(tocOfText(text(['a'], [[0, 'open', 'para:toc2'], [1, 'close', '']]))).toBeNull()
  })
  test('a nested node does not end the toc early', () => {
    const t = text(['a', 'b', 'c'], [[0, 'open', 'para:toc1'], [1, 'open', 'char:x'], [2, 'close', ''], [3, 'close', '']])
    expect(tocOfText(t)).toEqual(['abc', '', ''])
  })
})

describe('bookNames', () => {
  test('Titus from the es-419 texts, Ruth from the list, Genesis none', async () => {
    const tit = await titusBook()
    const names = bookNames([tit], { rut: ['Rut', 'Rut', 'Rt'] })
    expect(names.length).toBe(66)
    expect(names[55]).toEqual(['La carta de Pablo a Tito', 'Tito', 'Tit', 'text'])
    expect(names[7]).toEqual(['Rut', 'Rut', 'Rt', 'list'])
    expect(names[0]).toEqual(['', '', '', 'none'])
  })
  test('the first text with a toc wins', () => {
    const noToc = text(['x'], [])
    const withToc = text(['N', 'S', 'A'], [[0, 'open', 'para:toc1'], [1, 'close', ''], [1, 'open', 'para:toc2'], [2, 'close', ''], [2, 'open', 'para:toc3'], [3, 'close', '']])
    const b: BookModel = { lang: 'x', book: 'gen', orig: ['k', 's'], res: [], texts: [noToc, withToc] }
    expect(bookNames([b])[0]).toEqual(['N', 'S', 'A', 'text'])
  })
})

const art = (id: string, title: string, subtitle?: string): ArticleModel => ({ id, res: 'r', title, ...(subtitle ? { subtitle } : {}), sections: [] })

describe('conceptNames and subtitlesOf', () => {
  test('tW titles split at commas; tA keep the title', () => {
    const arts = [art('tw:kt/grace', ' gracia , amable,, '), art('tw:kt/god', 'Dios'), art('ta:translate/figs-metaphor', 'Metáfora, x', 'Sub')]
    expect(conceptNames(arts)).toEqual({
      'ta:translate/figs-metaphor': ['Metáfora, x'],
      'tw:kt/god': ['Dios'],
      'tw:kt/grace': ['gracia', 'amable'],
    })
    expect(Object.keys(conceptNames(arts))[0]).toBe('ta:translate/figs-metaphor')
    expect(subtitlesOf(arts)).toEqual({ 'ta:translate/figs-metaphor': 'Sub' })
  })
})

describe('obsTitles', () => {
  test('null is undefined', () => expect(obsTitles(null)).toBeUndefined())
  test('story numbers and titles', () => {
    expect(obsTitles({ lang: 'x', res: [], stories: [{ res: 'r', n: 1, title: 'T', frames: [] }] })).toEqual([[1, 'T']])
  })
})
