import type { PackReader } from '@bt-synergy/language-pack-client'
import type { ArticleModel, SectionModel } from '@bt-synergy/language-pack-v3'
import { type HelpsTextCacheAdapter, writeHelpsText } from '@bt-synergy/resource-pipeline/helps/helpsTextStore'
import { extractFirstContentParagraph } from '../../../lib/markdown/markdownProcessor'
import type { Row } from './scriptureRows'

/**
 * The links of the format put back as the addresses the entry viewers follow: `[[tw:kt/grace]]` is
 * `[[rc://*\/tw/dict/bible/kt/grace]]`, `[[ta:translate/x]]` is `[[rc://*\/ta/man/translate/x]]` and `[t](ref:tit 1:2)` is
 * `[t](rc://*\/tn/help/tit/01/02)`. The segment does not keep the language of an address (`*` stands for any), and a name
 * published with capitals comes back in lowercase.
 */
function sourceLinks(md: string): string {
  return md
    .replace(/\[\[tw:([a-z0-9_-]+)\/([A-Za-z0-9_-]+)\]\]/g, '[[rc://*/tw/dict/bible/$1/$2]]')
    .replace(/\[\[ta:([a-z0-9_-]+)\/([A-Za-z0-9_-]+)\]\]/g, '[[rc://*/ta/man/$1/$2]]')
    .replace(/\]\(ref:([a-z0-9]{3}) (\d+):(\d+)\)/g, (_all, book: string, chapter: string, verse: string) => `](rc://*/tn/help/${book}/${chapter.padStart(2, '0')}/${verse.padStart(2, '0')})`)
}

const heading = (s: SectionModel): string => (s.title === undefined ? '#'.repeat(s.level) : `${'#'.repeat(s.level)} ${s.title}`)

/** Whether a section is a "See" or "See Also" list, the one the TA loader reads `relatedArticles` from. */
const isSeeAlso = (s: SectionModel): boolean => s.level > 0 && /^see( also)?$/i.test(s.title ?? '')

/**
 * The markdown of an article as the Door43 loaders cache it: `# title`; for a tA `## subtitle` (the question the article
 * answers); then the sections, each under its heading at the level it was published (the text before the first heading
 * has none). Links are written as `rc://*` addresses ({@link sourceLinks}). A tA with `related` articles that its text does
 * not list in a "See Also" section gets one, at the end, so the loader's `relatedArticles` finds them.
 */
export function articleMarkdown(model: ArticleModel): string {
  const parts = [`# ${model.title}`]
  if (model.id.startsWith('ta:') && model.subtitle !== undefined) parts.push(`## ${model.subtitle}`)
  for (const s of model.sections) {
    const head = s.level === 0 ? '' : heading(s)
    const body = sourceLinks(s.md)
    parts.push(...[head, body].filter((p) => p !== ''))
  }
  if (model.id.startsWith('ta:') && model.related !== undefined && model.related.length > 0 && !model.sections.some(isSeeAlso)) {
    const list = model.related.map((id) => `* ${sourceLinks(`[[${id}]]`)}`)
    parts.push('### See Also', list.join('\n'))
  }
  // The loader reads a "See Also" list up to the next heading or a final line break.
  return parts.join('\n\n') + (parts.at(-2) === '### See Also' ? '\n' : '')
}

/** The entry id the loaders use under the resource key: `bible/kt/grace` for tW, `translate/figs-metaphor` for tA. */
function entryOf(id: string): string {
  const [kind, path] = [id.slice(0, 2), id.slice(3)]
  return kind === 'tw' ? `bible/${path}` : path
}

/**
 * The rows of one group of articles (`tw:kt`, `tw:names`, `tw:other`, `ta:translate`, ...) as the Door43 loaders and the
 * helps-text cache write them:
 *
 * - `{res}/{entryId}`: the markdown ({@link articleMarkdown}), under the resource key of the catalog (`es-419_gl/es-419/tw`);
 * - `helps-text:tw-title:` / `helps-text:ta-title:`: the title, by the path `kt/grace` or `translate/figs-metaphor`;
 * - `helps-text:tw-preview:` (tW only): what `useTWPreviews` caches, the first paragraph of the article.
 *
 * The `helps-text:` keys carry the content stamp of the resource's catalog row (`resourceContentStamp`), which the segment
 * does not keep: the caller gives it as `stamp` (required: rows under a made-up stamp would never be found). Empty when the language has no such group.
 */
export async function articleRows(reader: PackReader, group: string, o: { stamp: string }): Promise<Row[]> {
  const articles = await reader.articles(group)
  if (!articles) return []
  const { stamp } = o
  const rows: Row[] = []
  const cache: HelpsTextCacheAdapter = {
    get: async () => null,
    set: async (key, entry) => {
      rows.push({ key, value: entry })
    },
  }
  for (const a of articles) {
    const tw = a.id.startsWith('tw:')
    const entryId = entryOf(a.id)
    const path = a.id.slice(3)
    const md = articleMarkdown(a)
    rows.push({ key: `${a.res}/${entryId}`, value: md })
    await writeHelpsText(cache, tw ? 'tw-title' : 'ta-title', a.res, stamp, path, a.title)
    if (tw) await writeHelpsText(cache, 'tw-preview', a.res, stamp, path, extractFirstContentParagraph(md))
  }
  return rows
}
