/**
 * The reader of the article segment (`spec/cddl/art.cddl`): a {@link Segment} that `readSegment` has accepted, back into the
 * group and its articles, the output the conformance cases expect (`tests/README.md`, "Reader output").
 *
 * It checks the table against the schema and rejects the segment with `E_BODY` at the first defect: a value of the wrong
 * type, a role that is not in the list, an article without sections, a resource index outside the header's `res`, a sid
 * twice in an article, an id twice in the group. It imports no builder code and no Node module.
 */
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { type CborMap, hasOwn, isMap } from '../codec/values'
import { type ArticleModel, ROLES, type Role, type SectionModel } from '../model'

function bad(what: string): never {
  throw new FormatError('E_BODY', `the article segment is malformed: ${what}`)
}

const isUint = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function map(value: unknown, what: string): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
  return value
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') bad(`${what} is not text`)
  return value
}

/** A key of a map that may be missing: `undefined` when it is, else the value, which has to be text. */
function optionalText(fields: CborMap, key: string, what: string): string | undefined {
  return hasOwn(fields, key) ? text(fields[key], `${what}.${key}`) : undefined
}

function optionalTexts(fields: CborMap, key: string, what: string): string[] | undefined {
  if (!hasOwn(fields, key)) return undefined
  const value = fields[key]
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) bad(`${what}.${key} is not a list of text`)
  return [...(value as string[])]
}

function readSection(value: unknown, what: string): SectionModel {
  const fields = map(value, what)
  const role = text(fields.role, `${what}.role`)
  if (!(ROLES as readonly string[]).includes(role)) bad(`${what}.role is ${JSON.stringify(role)}, which is not a role`)
  if (!isUint(fields.level)) bad(`${what}.level is not an integer from 0 to 2^53 - 1`)
  const sid = text(fields.sid, `${what}.sid`)
  if (sid === '') bad(`${what}.sid is empty`)

  const section: SectionModel = { sid, level: fields.level, role: role as Role, lang: text(fields.lang, `${what}.lang`), md: text(fields.md, `${what}.md`) }
  const title = optionalText(fields, 'title', what)
  if (title !== undefined) section.title = title
  const aliases = optionalTexts(fields, 'aliases', what)
  if (aliases !== undefined) section.aliases = aliases
  return section
}

function readArticle(value: unknown, i: number, res: [string, string][]): ArticleModel {
  const what = `articles[${i}]`
  const fields = map(value, what)
  const id = text(fields.id, `${what}.id`)
  if (id === '') bad(`${what}.id is empty`)
  if (!isUint(fields.res) || fields.res >= res.length) bad(`${what}.res names the resource ${String(fields.res)}, and the header has ${res.length}`)

  if (!Array.isArray(fields.sections) || fields.sections.length === 0) bad(`${what}.sections is not a list with at least one section`)
  const sids = new Set<string>()
  const sections = fields.sections.map((item, n) => {
    const section = readSection(item, `${what}.sections[${n}]`)
    if (sids.has(section.sid)) bad(`${what} has the sid ${JSON.stringify(section.sid)} twice`)
    sids.add(section.sid)
    return section
  })

  const article: ArticleModel = { id, res: res[fields.res][0], title: text(fields.title, `${what}.title`), sections }
  const subtitle = optionalText(fields, 'subtitle', what)
  if (subtitle !== undefined) article.subtitle = subtitle
  const related = optionalTexts(fields, 'related', what)
  if (related !== undefined) article.related = related
  const aliases = optionalTexts(fields, 'aliases', what)
  if (aliases !== undefined) article.aliases = aliases
  return article
}

/** The tables this reader knows, as `readSegment` takes them in `known`. */
export const ART_TABLES: Readonly<Record<string, number[]>> = { articles: [1] }

/**
 * The group of an article segment and its articles, in the order the segment has them. `res` of an article is the key of
 * its resource (the header lists the release tag of each).
 *
 * Throws {@link FormatError} `E_BODY` when the segment is not an article segment or its table is not what `art.cddl` says.
 */
export function artView(seg: Segment): { group: string; articles: ArticleModel[] } {
  const { h, t } = seg
  if (h.class !== 'art') bad(`the class is "${h.class}"`)
  if (h.lang === undefined) bad('the header has no lang')
  if (h.group === undefined) bad('the header has no group')
  if (h.res === undefined || h.res.length === 0) bad('the header has no resource (res)')
  if (!Array.isArray(t.articles)) bad('the table "articles" is not a list')

  const ids = new Set<string>()
  const articles = t.articles.map((value, i) => {
    const article = readArticle(value, i, h.res!)
    if (ids.has(article.id)) bad(`the id ${JSON.stringify(article.id)} is in the group twice`)
    ids.add(article.id)
    return article
  })
  return { group: h.group, articles }
}
