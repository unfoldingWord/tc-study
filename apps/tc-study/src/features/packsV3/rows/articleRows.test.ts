import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { memoryStore, type PackReader } from '@bt-synergy/language-pack-client'
import { TranslationAcademyLoader } from '@bt-synergy/translation-academy-loader'
import { TranslationWordsLoader } from '@bt-synergy/translation-words-loader'
import { createPacksV3 } from '../client'
import { buildSample, fakeFetch, TA_RESOURCE, TA_SOURCE } from '../testing/sample'
import { articleRows } from './articleRows'
import type { Row } from './scriptureRows'

const DATA = join(import.meta.dir, '..', '..', '..', '..', '..', '..', 'packages', 'language-pack-v3', 'spec', 'tests', 'data')
const TW = 'es-419_gl/es-419/tw'
const TW_STAMP = 'v37#2024-07-17T20_12_37Z'
const TA_STAMP = 'v4#2024-07-17T20_15_35Z'

/** The rows of a Door43 part of the phase 0 test data (a source file per row). */
function partRows(lang: string, resource: string, kind: string): { layer: string; key: string; value: unknown }[] {
  const list = JSON.parse(readFileSync(join(DATA, lang, 'list.json'), 'utf8'))
  const part = list.parts.find((p: { resource: string; kind: string }) => p.resource === resource && p.kind === kind)
  const lines = gunzipSync(readFileSync(join(DATA, 'parts', `${part.sha256}.part.gz`))).toString().split('\n').filter(Boolean)
  return lines.map((l) => JSON.parse(l))
}

// The loaders' own parsers (private methods): the shapes the viewers get from the cached markdown.
const parseWord = (md: string, id: string) => (TranslationWordsLoader.prototype as any).parseWord(md, id)
const parseArticle = (md: string, id: string) => (TranslationAcademyLoader.prototype as any).parseArticle(md, id)

/** Every link target of a markdown, by concept, ignoring the language an address names. */
function targets(md: string): string[] {
  const out: string[] = []
  for (const m of md.matchAll(/\[\[rc:\/\/[^/\]]+\/(tw\/dict\/bible|ta\/man)\/([^\]]+)\]\]/g)) out.push(`${m[1]}:${m[2].toLowerCase()}`)
  for (const m of md.matchAll(/\]\(rc:\/\/[^/)]+\/tn\/help\/([a-z0-9]{3})\/(\d+)\/(\d+)\)/g)) out.push(`tn:${m[1]} ${Number(m[2])}:${Number(m[3])}`)
  for (const m of md.matchAll(/\]\((\.\.\/\d+\/\d+\.md)\)/g)) out.push(`rel:${m[1]}`)
  return out
}

let reader: Promise<PackReader> | undefined
function readerOf(): Promise<PackReader> {
  reader ??= (async () => {
    const sample = await buildSample()
    const client = await createPacksV3({ fetch: fakeFetch(sample), store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
    await client.install('es-419', { books: ['tit'] })
    return (await client.open('es-419'))!
  })()
  return reader
}
/** The cache envelope adds a `timestamp` when it is written; the Door43 rows of the test data have none. */
const withoutTime = (v: unknown) => { const { timestamp: _t, ...rest } = v as { timestamp?: number }; return rest }
const byKey = (rows: Row[]) => new Map(rows.map((r) => [r.key, r.value]))

describe('article rows', () => {
  it('tW: each article has the entry row, the title and the preview Door43 caches, and its links keep their targets', async () => {
    const mine = byKey(await articleRows(await readerOf(), 'tw:kt', { stamp: TW_STAMP }))
    const source = partRows('es-419', TW, 'tw').filter((r) => r.layer === 'sot')
    expect(source.length).toBeGreaterThan(20)
    const titles = new Map(partRows('es-419', TW, 'titles').map((r) => [r.key, r.value]))
    let same = 0
    for (const r of source) {
      const md = mine.get(r.key) as string
      expect(md).toBeDefined()
      // Same article: the title, the first paragraph of the definition and the target of every link.
      expect(targets(md)).toEqual(targets(r.value as string))
      expect(parseWord(md, 'x').term).toBe(parseWord(r.value as string, 'x').term)
      expect(parseWord(md, 'x').definition).toBe(parseWord(r.value as string, 'x').definition)
      const id = r.key.slice(TW.length + '/bible/'.length)
      expect(withoutTime(mine.get(`helps-text:tw-title:${TW}@${TW_STAMP}:${id}`))).toEqual(titles.get(`helps-text:tw-title:${TW}@${TW_STAMP}:${id}`)!)
      expect(withoutTime(mine.get(`helps-text:tw-preview:${TW}@${TW_STAMP}:${id}`))).toEqual({ content: parseWord(r.value as string, 'x').definition, version: 1 })
      if (md === r.value) same++
    }
    // How many are byte for byte the source file (the others differ in blank lines or heading spelling only).
    console.log(`tW: ${same} of ${source.length} equal to the source file`)
  }, 60_000)

  it('tW: the rows of the whole group are the articles of the group and nothing else', async () => {
    const rows = await articleRows(await readerOf(), 'tw:kt', { stamp: TW_STAMP })
    const source = partRows('es-419', TW, 'tw').filter((r) => r.layer === 'sot').map((r) => r.key).sort()
    expect(rows.filter((r) => r.key.startsWith(`${TW}/`)).map((r) => r.key).sort()).toEqual(source)
    expect(rows.every((r) => r.key.startsWith(`${TW}/`) || r.key.startsWith('helps-text:tw-title:') || r.key.startsWith('helps-text:tw-preview:'))).toBe(true)
  }, 60_000)

  it('tA: the entry row is the markdown of the source, the title row is the loader\'s, and links keep their targets', async () => {
    const mine = byKey(await articleRows(await readerOf(), 'ta:translate', { stamp: TA_STAMP }))
    for (const [path, src] of Object.entries(TA_SOURCE)) {
      const md = mine.get(`${TA_RESOURCE}/${path}`) as string
      expect(md).toBeDefined()
      // Every link of the source keeps its target (the text has a tn address, a relative link and an rc link of each kind);
      // the "See Also" list of the related article adds one link and nothing else changes.
      const mineTargets = targets(md)
      expect(targets(src.md).filter((t) => !mineTargets.includes(t))).toEqual([])
      expect(mineTargets.length).toBe(targets(src.md).length + 1)
      expect(withoutTime(mine.get(`helps-text:ta-title:${TA_RESOURCE}@${TA_STAMP}:${path}`))).toEqual({ content: src.title, version: 1 })
      expect(parseArticle(md, path).title).toBe(src.title)
      expect(parseArticle(md, path).question).toBe(parseArticle(src.md, path).question)
    }
    // The text is the source's, whole, but for the language an address names (`es-419` comes back as `*`) and the added list.
    const metaphor = mine.get(`${TA_RESOURCE}/translate/figs-metaphor`) as string
    const source = TA_SOURCE['translate/figs-metaphor'].md.replace('rc://es-419/', 'rc://*/')
    expect(metaphor).toBe(`${source}

### See Also

* [[rc://*/ta/man/translate/figs-simile]]
`)
  }, 60_000)

  it('tA: a related article is listed where the loader reads it', async () => {
    const mine = byKey(await articleRows(await readerOf(), 'ta:translate', { stamp: TA_STAMP }))
    const metaphor = mine.get(`${TA_RESOURCE}/translate/figs-metaphor`) as string
    const article = parseArticle(metaphor, 'translate/figs-metaphor')
    expect(article.relatedArticles).toEqual(['[[rc://*/ta/man/translate/figs-simile]]'])
    // and the simile, which the metaphor's text links, lists the metaphor
    const simile = parseArticle(mine.get(`${TA_RESOURCE}/translate/figs-simile`) as string, 'translate/figs-simile')
    expect(simile.relatedArticles).toEqual(['[[rc://*/ta/man/translate/figs-metaphor]]'])
  }, 60_000)

  it('has no rows for a group the language lacks', async () => {
    expect(await articleRows(await readerOf(), 'tw:names', { stamp: TW_STAMP })).toEqual([])
  }, 60_000)
})
