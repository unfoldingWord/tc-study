/**
 * The article segment of format 3 (`spec/cddl/art.cddl`): one language, one group of word (tW) or Academy (tA) articles,
 * each in sections with ids that last (`sections.ts`).
 *
 * - {@link extractArticles} reads the articles of a language from a {@link RowSource} and gives them their section ids.
 * - {@link artSegment} turns the articles of one group into the segment, the same bytes for the same articles.
 *
 * The reader of the segment is `read/art.ts`. No Node module is used.
 *
 * ## The rows
 *
 * - **tW**: a resource whose Door43 subject is `Translation Words`. Its `sot` rows are keyed `{res}/bible/{category}/{name}`
 *   (`kt`, `names`, `other`), the value is the markdown. The concept is `tw:{category}/{name}`, the group `tw:{category}`.
 *   The title is the row `helps-text:tw-title:{res}@{stamp}:{category}/{name}` (`gracia, amable`).
 * - **Ids are lowercase** (`ids.md`, "Concepts"): the tA article published as `translate/figs-orderHeb` is
 *   `ta:translate/figs-orderheb`, and the report has a line for each id lowercased. The registry key uses the
 *   lowercase id; the title rows are looked up by the published name.
 * - **tA**: a resource whose subject is `Translation Academy`. Its `sot` rows are keyed `{res}/{manual}/{slug}`. The concept
 *   is `ta:{manual}/{slug}`, the group `ta:{manual}`. The title is the row `helps-text:ta-title:…`.
 *
 * ## What the markdown of an article is
 *
 * - **tW**: `# title`, then the sections, each under a `##`. The level-1 heading is the title and not a section. Text
 *   between it and the first `##` is the section `intro`.
 * - **tA**: `# title`, then `## sub-title` (the question the article answers: phase 0 joined `title.md`, `sub-title.md` and
 *   `01.md` in one text), then the sections under `###`. The level-2 heading that follows the title directly is the
 *   subtitle and not a section; the text after it, up to the next heading, is the section `intro`. (The parts have no
 *   rows of sub-titles of their own.) A tA that has a row `helps-text:ta-sub-title:` or `ta-subtitle:` uses it for the
 *   subtitle; the heading is still taken out of the sections.
 * - The title is the row's, and the article's first level-1 heading when there is no row. With neither, the name in the
 *   id is used and the report says so.
 * - `related` (tA only): the articles tied to one by the `config.yaml` of its manual or by a link of a text, both ways
 *   (`related.ts`). The parts do not carry `config.yaml`: the build gives its text (`taConfigs`). `aliases` (an article that
 *   moved) come from the common map, not from the rows: left out.
 */
import type { CborValue } from '../codec/cbor'
import { compareCodePoints } from '../codec/columns'
import type { Segment } from '../codec/container'
import { isUint as isCount } from '../codec/values'
import { rewriteLinks } from '../ids'
import { type ArticleModel, ROLES, type SectionModel } from '../model'
import type { ResourceRef, RowSource } from '../source/rows'
import { relatedArticles, type TaConfigs } from './related'
import { articlePath, assignArticle, canonicalRegistry, type SectionPart, type SectionRegistry, splitSections } from './sections'

const TW_SUBJECT = 'Translation Words'
const TA_SUBJECT = 'Translation Academy'

export type Kind = 'tw' | 'ta'

/** `{kind}-title` and `{kind}-sub-title` rows of the layer `text`: the resource, the stamp it names and the article path. */
const TEXT_KEY = /^helps-text:(tw-title|ta-title|ta-sub-?title):([^@]+)@[^:]*:(.+)$/

// The name may be published with capitals (the tA `translate/figs-orderHeb`); the id is lowercase (`ids.md`, "Concepts").
const TW_PATH = /^bible\/(kt|names|other)\/([A-Za-z0-9_-]+)$/
const TA_PATH = /^([a-z0-9_-]+)\/([A-Za-z0-9_-]+)$/

/**
 * The article a path under a resource's key names (`bible/kt/Grace` for tW, `translate/figs-orderHeb` for tA), or `null` when
 * the path is not one of an article. `published` is the name as published (`kt/Grace`), `id` the lowercase concept
 * (`tw:kt/grace`) and `group` the group of the segment (`tw:kt`).
 */
export function articleOfPath(kind: Kind, path: string): { id: string; group: string; published: string } | null {
  const m = (kind === 'tw' ? TW_PATH : TA_PATH).exec(path)
  if (m === null) return null
  const published = `${m[1]}/${m[2]}`
  return { id: `${kind}:${published.toLowerCase()}`, group: `${kind}:${m[1]}`, published }
}

/** Raw text joined by a blank line, leaving out what is empty. */
const joinText = (a: string, b: string): string => (a === '' ? b : b === '' ? a : `${a}\n\n${b}`)

/** The title and subtitle rows of a resource, by article path (`kt/grace`). */
async function readTexts(source: RowSource, lang: string, ref: ResourceRef): Promise<{ titles: Map<string, string>; subtitles: Map<string, string> }> {
  const titles = new Map<string, string>()
  const subtitles = new Map<string, string>()
  for await (const row of source.rows({ lang, resource: ref.key, layer: 'text' })) {
    const m = TEXT_KEY.exec(row.key)
    if (m === null || m[2] !== ref.key) continue
    const value = row.value as { content?: unknown } | null
    if (typeof value !== 'object' || value === null || typeof value.content !== 'string') continue
    const into = m[1].endsWith('title') && !m[1].includes('sub') ? titles : subtitles
    if (!into.has(m[3])) into.set(m[3], value.content)
  }
  return { titles, subtitles }
}

/** The pieces of an article's markdown that are not the title or the subtitle (see the top of this file). */
function prepareArticle(kind: Kind, md: string): { heading?: string; subtitle?: string; parts: SectionPart[] } {
  const raw = splitSections(md)
  const lead = raw[0]?.level === 0 ? 1 : 0
  const titlePart = raw[lead]?.level === 1 ? raw[lead] : undefined
  if (titlePart === undefined) return { heading: raw.find((part) => part.level === 1)?.title, parts: raw }

  let intro = joinText(lead === 1 ? raw[0].md : '', titlePart.md)
  let rest = raw.slice(lead + 1)
  let subtitle: string | undefined
  if (kind === 'ta' && titlePart.md === '' && rest[0]?.level === 2 && rest[0].title !== undefined) {
    subtitle = rest[0].title
    intro = joinText(intro, rest[0].md)
    rest = rest.slice(1)
  }
  return { heading: titlePart.title, subtitle, parts: intro === '' ? rest : [{ level: 0, md: intro }, ...rest] }
}

type Found = { id: string; group: string; kind: Kind; ref: ResourceRef; published: string; rowKey: string; md: string; title?: string; subtitle?: string }

/**
 * The tW and tA articles of a language, in sections with ids that last.
 *
 * - `registry` is the one of the last build (empty for the first). The registry returned is the new one: the entries of the
 *   articles built now, and those of the articles not built now, unchanged.
 * - `issues` receives a line for everything the builder worked around: a row that is not an article, a text that is not
 *   markdown, an id that two resources publish (the first resource by key wins), an article without title or without
 *   text, a heading no rule places (role `unknown`).
 * - `taConfigs` is the text of the `config.yaml` of each manual of each tA resource ({@link relatedArticles}). Undefined:
 *   `related` comes from the links of the texts alone.
 * - The result maps each group (`tw:kt`, `tw:names`, `tw:other`, `ta:translate`, `ta:checking`, `ta:process`, `ta:intro`,
 *   sorted) to its articles, ordered by id. Both orders are by code point.
 */
export async function extractArticles(
  source: RowSource,
  lang: string,
  registry: SectionRegistry = {},
  issues: string[] = [],
  taConfigs?: TaConfigs,
): Promise<{ groups: Map<string, ArticleModel[]>; registry: SectionRegistry }> {
  const resources = (await source.resources(lang))
    .filter((ref) => ref.kind === TW_SUBJECT || ref.kind === TA_SUBJECT)
    .sort((a, b) => compareCodePoints(a.key, b.key))

  const found = new Map<string, Found>()
  for (const ref of resources) {
    const kind: Kind = ref.kind === TW_SUBJECT ? 'tw' : 'ta'
    const { titles, subtitles } = await readTexts(source, lang, ref)
    for await (const row of source.rows({ lang, resource: ref.key, layer: 'sot' })) {
      const path = row.key.startsWith(`${ref.key}/`) ? row.key.slice(ref.key.length + 1) : undefined
      const named = path === undefined ? null : articleOfPath(kind, path)
      if (path === undefined || named === null) {
        issues.push(`${row.key} is not the key of an article of ${ref.key}: left out`)
        continue
      }
      // The id is lowercase; the title rows name the article as it is published.
      const { id, group, published } = named
      if (id !== `${kind}:${published}`) issues.push(`${id} (${ref.key}): published as ${JSON.stringify(published)}, and ids are lowercase (ids.md)`)
      if (typeof row.value !== 'string') {
        issues.push(`${id} (${ref.key}): its text is not markdown (a string): left out`)
        continue
      }
      const earlier = found.get(id)
      if (earlier !== undefined) {
        issues.push(
          earlier.ref.key === ref.key
            ? `${id} (${ref.key}): the rows ${earlier.rowKey} and ${row.key} give the same id: kept the first`
            : `${id} is in ${earlier.ref.key} and in ${ref.key}: kept the one of ${earlier.ref.key}`,
        )
        continue
      }
      found.set(id, { id, group, kind, ref, published, rowKey: row.key, md: row.value, title: titles.get(published), subtitle: subtitles.get(published) })
    }
  }

  const tas = [...found.values()].filter((article) => article.kind === 'ta')
  const related = relatedArticles(tas.map(({ id, ref, md }) => ({ id, res: ref.key, md })), taConfigs, issues)
  const ordered = [...found.values()].sort((a, b) => compareCodePoints(a.group, b.group) || compareCodePoints(a.id, b.id))
  const groups = new Map<string, ArticleModel[]>()
  const next: SectionRegistry = { ...registry }
  for (const article of ordered) {
    const { id, ref } = article
    const where = `${id} (${ref.key})`
    const prepared = prepareArticle(article.kind, article.md)
    const parts: SectionPart[] = prepared.parts.map((part) => ({ ...part, md: rewriteLinks(part.md, null) }))
    if (parts.length === 0) {
      issues.push(`${where} has no text: one empty section`)
      parts.push({ level: 0, md: '' })
    }

    const path = articlePath(ref.key, id)
    const { sections, entries } = assignArticle(lang, parts, Object.prototype.hasOwnProperty.call(registry, path) ? registry[path] : undefined)
    next[path] = entries
    for (const section of sections) {
      if (section.role === 'unknown' && section.level > 0) {
        issues.push(`${where}: the heading ${JSON.stringify(section.title ?? '')} is not placed (role unknown, sid ${section.sid})`)
      }
    }

    let title = article.title ?? prepared.heading
    if (title === undefined) {
      title = article.published.slice(article.published.lastIndexOf('/') + 1)
      issues.push(`${where} has no title row and no level-1 heading: used ${JSON.stringify(title)}`)
    }
    const model: ArticleModel = { id, res: ref.key, title, sections }
    const subtitle = article.subtitle ?? prepared.subtitle
    if (subtitle !== undefined) model.subtitle = subtitle
    const ties = related.get(id)
    if (ties !== undefined) model.related = ties
    const list = groups.get(article.group)
    if (list === undefined) groups.set(article.group, [model])
    else list.push(model)
  }
  return { groups, registry: canonicalRegistry(next) }
}

/**
 * The `res` of an article segment: the resources of `articles`, as `[key, release tag]` (the tag is the stamp before the
 * `#`, `v37`), sorted by key. Throws `Error` for an article of a resource `refs` does not list.
 */
export function articleResources(articles: ArticleModel[], refs: ResourceRef[]): [string, string][] {
  const keys = [...new Set(articles.map((article) => article.res))].sort(compareCodePoints)
  return keys.map((key): [string, string] => {
    const ref = refs.find((candidate) => candidate.key === key)
    if (ref === undefined) throw new Error(`The resource ${JSON.stringify(key)} is not one of the resources given`)
    return [key, ref.stamp.split('#')[0]]
  })
}

// Segment

const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

function encodeSection(section: SectionModel, where: string): CborValue {
  const here = `${where}, section ${JSON.stringify(section.sid)}`
  if (typeof section.sid !== 'string' || section.sid === '') throw new Error(`${where}: a section has no sid`)
  if (!isCount(section.level)) throw new Error(`${here}: the level is not an integer from 0 to 2^53 - 1`)
  if (!(ROLES as readonly string[]).includes(section.role)) throw new Error(`${here}: ${JSON.stringify(section.role)} is not a role`)
  if (section.title !== undefined && typeof section.title !== 'string') throw new Error(`${here}: the title is not text`)
  if (typeof section.lang !== 'string') throw new Error(`${here}: the lang is not text`)
  if (typeof section.md !== 'string') throw new Error(`${here}: the md is not text`)
  const out: Record<string, CborValue> = { sid: section.sid, level: section.level, role: section.role, lang: section.lang, md: section.md }
  if (section.title !== undefined) out.title = section.title
  if (section.aliases !== undefined) {
    if (!isTexts(section.aliases)) throw new Error(`${here}: aliases is not a list of text`)
    out.aliases = [...section.aliases]
  }
  return out
}

/**
 * The segment of the articles of one group (`art.cddl`): the table `articles` (required), ordered by id, in the order of
 * `id` by code point whatever the order given. `res` is `[resource key, release tag]` for each resource of the
 * articles ({@link articleResources}); an article names its resource by the index in it. `md` is stored as the model has it
 * (the builder rewrote the links). The same articles give the same segment: a key that an article lacks is left out.
 *
 * Throws `Error` when the articles are not ones the segment can hold: no resource or one twice, an article of a resource
 * `res` does not list, an id twice, no sections, a sid twice in an article, a role that is not one of the list.
 */
export function artSegment(lang: string, group: string, res: [string, string][], articles: ArticleModel[]): Segment {
  if (res.length === 0) throw new Error('The header needs at least one resource (res)')
  const resIndex = new Map<string, number>()
  res.forEach(([key], i) => {
    if (resIndex.has(key)) throw new Error(`The resource ${JSON.stringify(key)} is in res twice`)
    resIndex.set(key, i)
  })

  const ordered = [...articles].sort((a, b) => compareCodePoints(a.id, b.id))
  const ids = new Set<string>()
  const encoded = ordered.map((article): CborValue => {
    const where = `The article ${JSON.stringify(article.id)}`
    if (typeof article.id !== 'string' || article.id === '') throw new Error('An article has no id')
    if (ids.has(article.id)) throw new Error(`${where} is in the group twice`)
    ids.add(article.id)
    const index = resIndex.get(article.res)
    if (index === undefined) throw new Error(`${where} is of a resource that res does not list`)
    if (typeof article.title !== 'string') throw new Error(`${where} has no title`)
    if (!Array.isArray(article.sections) || article.sections.length === 0) throw new Error(`${where} has no sections`)
    const sids = new Set<string>()
    for (const section of article.sections) {
      if (sids.has(section.sid)) throw new Error(`${where} has the sid ${JSON.stringify(section.sid)} twice`)
      sids.add(section.sid)
    }

    const out: Record<string, CborValue> = {
      id: article.id,
      res: index,
      title: article.title,
      sections: article.sections.map((section) => encodeSection(section, where)),
    }
    for (const key of ['subtitle', 'related', 'aliases'] as const) {
      const value = article[key]
      if (value === undefined) continue
      if (key === 'subtitle' ? typeof value !== 'string' : !isTexts(value)) throw new Error(`${where}: ${key} is not ${key === 'subtitle' ? 'text' : 'a list of text'}`)
      out[key] = typeof value === 'string' ? value : [...value]
    }
    return out
  })

  return {
    h: { class: 'art', v: 1, tables: { articles: [1, true] }, lang, group, res: res.map(([key, tag]) => [key, tag]) },
    t: { articles: encoded },
  }
}
