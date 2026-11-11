import { describe, expect, test } from 'bun:test'
import { linkedIds, parseTaConfig, relatedArticles, type TaArticle } from './related'

const TA = 'es-419_gl/es-419/ta'

// The shape of the tA configs on Door43 (en_ta v91, es-419_ta v4), cut down.
const TRANSLATE = `---
figs-intro:
  recommended: []
  dependencies: []
figs-metaphor:
  recommended: []
  dependencies:
    - figs-intro
    - figs-simile
figs-simile:
  recommended:
    - figs-metaphor
    - bita-part1   # a comment
  dependencies:
    - figs-intro
figs-exmetaphor:
  recommended: [bita-part1]
  dependencies: [figs-metaphor, "figs-simile"]
bita-part1:
  dependencies:
    - figs-metaphor
    - translate-decimal
level1:
  recommended: []
  dependencies: []
`

describe('parseTaConfig', () => {
  test('reads the entries and their two lists, in the order written', () => {
    const issues: string[] = []
    const config = parseTaConfig(TRANSLATE, issues)
    expect(issues).toEqual([])
    expect([...config.keys()]).toEqual(['figs-intro', 'figs-metaphor', 'figs-simile', 'figs-exmetaphor', 'bita-part1', 'level1'])
    expect(config.get('figs-metaphor')).toEqual(['figs-intro', 'figs-simile'])
    expect(config.get('figs-simile')).toEqual(['figs-metaphor', 'bita-part1', 'figs-intro'])
    expect(config.get('figs-exmetaphor')).toEqual(['bita-part1', 'figs-metaphor', 'figs-simile'])
    expect(config.get('figs-intro')).toEqual([])
  })

  test('ignores other keys and reports a line in no known form', () => {
    const issues: string[] = []
    const config = parseTaConfig('a:\n  title: x\n  other:\n    - b\n  dependencies:\n    - c\nnot a key\n', issues, 'translate/config.yaml')
    expect(config.get('a')).toEqual(['c'])
    expect(issues).toEqual(['translate/config.yaml, line 7: "not a key" is not an entry, a key or a list item: left out'])
  })

  test('reads Windows line ends', () => {
    expect(parseTaConfig('a:\r\n  dependencies:\r\n    - b\r\n').get('a')).toEqual(['b'])
  })
})

describe('linkedIds', () => {
  test('finds the three forms of a link to a tA article', () => {
    const md = 'See [Simile](../figs-simile/01.md), [Know](../../intro/ta-intro/01.md) and [[rc://*/ta/man/translate/figs-orderHeb]]. Not [x](../02/03.md). [A](../figs-idiom/01.md#examples) [B](../figs-irony/01.md "Irony")'
    expect(linkedIds(md, 'translate')).toEqual(['ta:translate/figs-orderheb', 'ta:translate/figs-simile', 'ta:intro/ta-intro', 'ta:translate/figs-idiom', 'ta:translate/figs-irony'])
  })
})

const art = (slug: string, md = '', manual = 'translate'): TaArticle => ({ id: `ta:${manual}/${slug}`, res: TA, md })

describe('relatedArticles', () => {
  const articles = [
    art('figs-intro'),
    art('figs-metaphor', 'Lee [Símil](../figs-simile/01.md).'),
    art('figs-simile'),
    art('figs-exmetaphor'),
    art('bita-part1'),
    art('figs-simetaphor', 'Ver [Metáfora](../figs-metaphor/01.md) y [[rc://*/ta/man/translate/figs-cometaphor]].'),
    art('figs-cometaphor'),
    art('ta-intro', '', 'intro'),
  ]

  test('ties the articles of the config and of the links, both ways, sorted', () => {
    const issues: string[] = []
    const related = relatedArticles(articles, new Map([[TA, new Map([['translate', TRANSLATE]])]]), issues)
    expect(related.get('ta:translate/figs-metaphor')).toEqual([
      'ta:translate/bita-part1',
      'ta:translate/figs-exmetaphor',
      'ta:translate/figs-intro',
      'ta:translate/figs-simetaphor',
      'ta:translate/figs-simile',
    ])
    expect(related.get('ta:translate/figs-cometaphor')).toEqual(['ta:translate/figs-simetaphor'])
    expect(related.has('ta:intro/ta-intro')).toBe(false)
    expect(issues).toEqual([
      `${TA}: translate/config.yaml: "translate-decimal", listed by "bita-part1", is not an article: left out`,
      `${TA}: translate/config.yaml: the entry "level1" names no article: left out`,
    ])
  })

  test('looks a name up in the other manuals when its own manual lacks it', () => {
    const related = relatedArticles([art('a'), art('ta-intro', '', 'intro')], new Map([[TA, new Map([['translate', 'a:\n  dependencies:\n    - ta-intro\n']])]]))
    expect(related.get('ta:translate/a')).toEqual(['ta:intro/ta-intro'])
    expect(related.get('ta:intro/ta-intro')).toEqual(['ta:translate/a'])
  })

  test('without configs, from the links alone and with no line', () => {
    const issues: string[] = []
    const related = relatedArticles(articles, undefined, issues)
    expect(related.get('ta:translate/figs-metaphor')).toEqual(['ta:translate/figs-simetaphor', 'ta:translate/figs-simile'])
    expect(issues).toEqual([])
  })

  test('a resource the configs lack, or whose release has none, says so', () => {
    const lack: string[] = []
    relatedArticles(articles, new Map(), lack)
    expect(lack).toEqual([`${TA}: no config.yaml was given for it: related from the links of the texts only`])
    const none: string[] = []
    relatedArticles(articles, new Map([[TA, new Map()]]), none)
    expect(none).toEqual([`${TA}: its release has no config.yaml: related from the links of the texts only`])
  })

  test('a link to an article that is not there, or to itself, ties nothing', () => {
    const related = relatedArticles([art('a', '[x](../missing/01.md) [y](../a/01.md)')], undefined)
    expect(related.size).toBe(0)
  })
})
