/**
 * The `related` of the tA articles (`spec/cddl/art.cddl`): the articles one is tied to, in both directions.
 *
 * Two sources tie two tA articles of the same resource:
 *
 * - **The config of the manual.** Each manual of a tA repository (`translate/`, `checking/`, …) has a `config.yaml` that gives,
 *   for an article, the ones to read before it (`dependencies`) and after it (`recommended`). The build gets its text from
 *   the release the list names (`TaConfigs`); the format 2.0 parts do not carry it.
 * - **The links of the texts.** An article's markdown links to another with `../{slug}/01.md`, `../../{manual}/{slug}/01.md`
 *   or `rc://*\/ta/man/{manual}/{slug}`.
 *
 * Each tie goes both ways: when `figs-simile` lists `figs-metaphor`, each is in the `related` of the other. The list is sorted by
 * code point, without the article itself and without repeats; an article with none has no `related`.
 *
 * A config entry or a name in a list that is not an article of the resource is left out with a line in `issues`. A name in a
 * list is looked up in the manual of its entry first, then in the other manuals (first by code point).
 *
 * No Node module is used.
 */
import { compareCodePoints } from '../codec/columns'

/** The text of each `config.yaml`, by resource key (`unfoldingWord/en/ta`) and then by manual (`translate`). */
export type TaConfigs = Map<string, Map<string, string>>

/** A tA article as {@link relatedArticles} needs it: its id (`ta:translate/figs-metaphor`), its resource key and its markdown. */
export type TaArticle = { id: string; res: string; md: string }

/** The two lists a config entry has that tie articles. */
const LISTS = ['dependencies', 'recommended']

const unquote = (s: string): string => (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s.at(-1) === s[0] ? s.slice(1, -1) : s)

/**
 * The entries of a tA `config.yaml` and the names in their `dependencies` and `recommended`, in the order written. The file is
 * the plain form the tA repositories use: an entry `name:` at the start of a line, its keys indented below it, a list as
 * `- item` lines or `[a, b]`. Other keys are ignored. A line in no such form is left out with a line in `issues`.
 */
export function parseTaConfig(text: string, issues: string[] = [], where = 'config.yaml'): Map<string, string[]> {
  const out = new Map<string, string[]>()
  let entry: string | undefined
  let list: string | undefined
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.replace(/(^|\s)#.*$/, '').trimEnd()
    if (line.trim() === '' || line.trim() === '---') continue
    const bad = () => issues.push(`${where}, line ${i + 1}: ${JSON.stringify(raw.trim())} is not an entry, a key or a list item: left out`)
    if (!/^\s/.test(line)) {
      const m = /^([^\s:][^:]*):$/.exec(line)
      if (m === null) {
        bad()
        entry = undefined
        continue
      }
      entry = unquote(m[1].trim())
      list = undefined
      if (!out.has(entry)) out.set(entry, [])
      continue
    }
    if (entry === undefined) continue
    const item = /^\s+-\s+(.+)$/.exec(line)
    if (item !== null) {
      if (list === undefined) continue
      if (LISTS.includes(list)) out.get(entry)!.push(unquote(item[1].trim()))
      continue
    }
    const key = /^\s+([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (key === null) {
      bad()
      continue
    }
    list = key[1]
    const value = key[2].trim()
    if (value === '' || value === '[]' || !LISTS.includes(list)) continue
    if (value.startsWith('[') && value.endsWith(']')) {
      for (const name of value.slice(1, -1).split(',')) if (name.trim() !== '') out.get(entry)!.push(unquote(name.trim()))
    } else {
      out.get(entry)!.push(unquote(value))
    }
  }
  return out
}

const RC = /rc:\/\/[^/\s\])]*\/ta\/man\/([a-z0-9_-]+)\/([A-Za-z0-9_-]+)/g
// `01.md` may be followed by an anchor or a title: `](../figs-simile/01.md#examples)`.
const RELATIVE = /\]\((?:\.\.\/\.\.\/([a-z0-9_-]+)\/|\.\.\/)([A-Za-z0-9_-]+)\/01\.md(?:[#\s][^)]*)?\)/g

/** The tA ids an article's markdown links to (`manual` is the article's own, for `../{slug}/01.md`). */
export function linkedIds(md: string, manual: string): string[] {
  const out: string[] = []
  for (const m of md.matchAll(RC)) out.push(`ta:${m[1]}/${m[2].toLowerCase()}`)
  for (const m of md.matchAll(RELATIVE)) out.push(`ta:${m[1] ?? manual}/${m[2].toLowerCase()}`)
  return out
}

const manualOf = (id: string): string => id.slice(3, id.indexOf('/'))

/**
 * The `related` of each tA article that has one, by id (see the top of this file). `configs` undefined: from the links alone.
 * A resource of `articles` that `configs` lacks is from the links alone too, with a line in `issues`.
 */
export function relatedArticles(articles: TaArticle[], configs: TaConfigs | undefined, issues: string[] = []): Map<string, string[]> {
  const ties = new Map<string, Set<string>>()
  const tie = (a: string, b: string): void => {
    if (a === b) return
    for (const [from, to] of [[a, b], [b, a]]) {
      const set = ties.get(from)
      if (set === undefined) ties.set(from, new Set([to]))
      else set.add(to)
    }
  }
  const resOf = new Map(articles.map((article) => [article.id, article.res]))

  // Config
  const resources = [...new Set(articles.map((article) => article.res))].sort(compareCodePoints)
  for (const res of resources) {
    const manuals = configs?.get(res)
    if (manuals === undefined) {
      if (configs !== undefined) issues.push(`${res}: no config.yaml was given for it: related from the links of the texts only`)
      continue
    }
    if (manuals.size === 0) issues.push(`${res}: its release has no config.yaml: related from the links of the texts only`)
    // The ids of the resource by name, in the order of their manuals: a name a list gives is looked up here when its manual lacks it.
    const bySlug = new Map<string, string>()
    for (const id of [...resOf.keys()].filter((id) => resOf.get(id) === res).sort(compareCodePoints)) {
      const slug = id.slice(id.indexOf('/') + 1)
      if (!bySlug.has(slug)) bySlug.set(slug, id)
    }
    for (const manual of [...manuals.keys()].sort(compareCodePoints)) {
      const where = `${res}: ${manual}/config.yaml`
      const lookup = (name: string): string | undefined => {
        const own = `ta:${manual}/${name.toLowerCase()}`
        return resOf.get(own) === res ? own : bySlug.get(name.toLowerCase())
      }
      for (const [name, names] of parseTaConfig(manuals.get(manual)!, issues, where)) {
        const id = `ta:${manual}/${name.toLowerCase()}`
        if (resOf.get(id) !== res) {
          issues.push(`${where}: the entry ${JSON.stringify(name)} names no article: left out`)
          continue
        }
        for (const other of names) {
          const target = lookup(other)
          if (target === undefined) issues.push(`${where}: ${JSON.stringify(other)}, listed by ${JSON.stringify(name)}, is not an article: left out`)
          else tie(id, target)
        }
      }
    }
  }

  // Links
  for (const article of articles) {
    for (const target of linkedIds(article.md, manualOf(article.id))) {
      if (resOf.get(target) === article.res) tie(article.id, target)
    }
  }

  const out = new Map<string, string[]>()
  for (const [id, set] of ties) out.set(id, [...set].sort(compareCodePoints))
  return out
}
