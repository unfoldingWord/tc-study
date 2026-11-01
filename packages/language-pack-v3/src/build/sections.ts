/**
 * The sections of an article and the ids they keep between builds (`spec/ids.md`, "Sections of articles").
 *
 * - {@link splitSections} cuts the markdown of an article at its headings.
 * - {@link roleOf} says what a heading is for, from a table of the headings of tW and tA in English, Spanish and Portuguese.
 * - {@link assignSids} gives every section its id: the one the registry of the last build has for it when it recognizes
 *   the section, a new one otherwise.
 *
 * No Node module is used.
 *
 * ## The registry
 *
 * A {@link SectionRegistry} is plain JSON, kept by the pipeline next to its output (never in the pack). It maps the path
 * of an article (`es-419_gl/es-419/tw/kt/grace`, {@link articlePath}) to its sections, in reading order: for each one its
 * `sid`, heading, level, role, the `fingerprint` of its text (the sha256 in hex) and its `trigrams`. The trigrams are
 * what lets a section be recognized after its heading and its position both changed: the distinct word trigrams of its
 * text, each as the first 32 bits of the sha256 of the three words, sorted. The words are the maximal runs of letters,
 * marks and digits of the text in NFC, lower-cased, and a trigram is three words joined by single spaces. A section of
 * fewer than three words has no trigrams. (Marks are part of a word so that the vowel signs of Devanagari or Arabic do
 * not cut it.)
 *
 * ## Recognizing a section
 *
 * In three passes over all the sections of the article, so that a section that is surely the same is not taken by another
 * that is only alike. An old section is matched at most once, and ties go to the first in reading order:
 *
 * 1. **the same heading**: equal once the heading is normalized (see {@link normalizeHeading}); the text before the first
 *    heading matches the old text before the first heading;
 * 2. **the same role and the same place among the sections of that role**: the third `examples` section is the old third
 *    `examples` section. Sections whose role is `unknown` have no place and skip this pass;
 * 3. **its text**: at least half of the distinct trigrams of the new section are in the old one. The old section with the
 *    most trigrams in common wins.
 *
 * Splits and merges come out of pass 3 and a fourth step:
 *
 * - **split**: the old section is matched once, by the first part in reading order; the other parts are new;
 * - **merge**: an old section that no new section matched, and at least half of whose trigrams are in one new section, is
 *   absorbed by it. If that section matched no old section, it takes the sid of the first absorbed one; the sids of
 *   the others go to its `aliases`. (Pass 3 alone cannot see a merge of two sections of the same size: each is only half
 *   of the new text, and the junction costs it a few trigrams below the half.)
 *
 * The `aliases` of an old section are kept in the registry, so that a section merged two builds ago still answers to its
 * old sids.
 *
 * ## New sids
 *
 * The text before the first heading is `intro`. Another section takes its role if the article has not used that sid
 * (`definition`), else the role and the first free number from 2 (`examples-2`). A section whose role is `unknown` takes `s`
 * and one more than the highest number of an `s` sid the article has had (`s3`). "Has had" counts every sid and alias of
 * the old registry, also those of sections that are gone: a sid is not reused in the build that drops it.
 *
 * A sid is assigned once. A corrected heading, a role that changed or a section that moved keeps the sid of the section
 * it was recognized as; the role is stored apart.
 */
import { sha256Hex, sha256Prefix32 } from '../codec/sha256'
import { hasOwn } from '../codec/values'
import type { Role, SectionModel } from '../model'

export type { ArticleModel, Role, SectionModel } from '../model'

/** A section as the registry remembers it. `aliases` are the sids it answered to before it was merged or split. */
export type RegistryEntry = {
  sid: string
  title?: string
  level: number
  role: Role
  fingerprint: string
  trigrams: number[]
  aliases?: string[]
}

/** The sections of each article of a build, by {@link articlePath}. */
export type SectionRegistry = Record<string, RegistryEntry[]>

/** A piece of an article: `level` 0 is the text before the first heading, else the heading's level. `md` has no heading line. */
export type SectionPart = { level: number; title?: string; md: string }

/** The key of an article in the registry: its resource and its concept without the namespace (`es-419_gl/es-419/tw` and `tw:kt/grace`). */
export function articlePath(res: string, id: string): string {
  return `${res}/${id.slice(id.indexOf(':') + 1)}`
}

// Splitting

/** The opening of a fenced code block: up to 3 spaces, then three or more backticks or tildes. */
const FENCE = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/
/** An ATX heading: up to 3 spaces, 1 to 6 `#`, then a space or the end of the line. */
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+([^\n]*))?$/
const BLANK = /^[ \t\r]*$/

/** The lines from `from` to `to` (excluded) without the blank ones at both ends, joined by `\n`. */
function bodyOf(lines: string[], from: number, to: number): string {
  let a = from
  let b = to
  while (a < b && BLANK.test(lines[a])) a++
  while (b > a && BLANK.test(lines[b - 1])) b--
  const body = lines.slice(a, b).join('\n')
  // The CR of the last line ends that line; it is not part of the text.
  return body.endsWith('\r') ? body.slice(0, -1) : body
}

/**
 * Cuts the markdown of an article at its ATX headings (`# ` to `###### `, up to 3 spaces before them), in reading order.
 *
 * - A part is `{ level, title?, md }`. `title` is the heading as published without its markers (a closing run of `#`
 *   is not part of it) and without the spaces around it; it is left out when the heading is empty. `md` is the text up
 *   to the next heading, without the blank lines at both ends and without the heading line itself, so a heading with
 *   no text has `md` `''`.
 * - The text before the first heading is the part of level 0, and only if it is not blank.
 * - A `#` line inside a fenced code block (` ``` ` or `~~~`) or indented by 4 spaces is text, not a heading. A fence that is
 *   never closed runs to the end.
 * - Setext headings (underlined with `===` or `---`) are not headings: the tW and tA of phase 0 do not use them, and a
 *   `---` line is as often a rule.
 * - Line ends are kept as they are inside a part.
 */
export function splitSections(md: string): SectionPart[] {
  const lines = md.split('\n')
  const parts: SectionPart[] = []
  let fence: { char: string; length: number } | null = null
  let level = 0
  let title: string | undefined
  let from = 0

  const close = (to: number) => {
    const body = bodyOf(lines, from, to)
    if (level === 0 && body === '') return
    parts.push(title === undefined ? { level, md: body } : { level, title, md: body })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i]
    if (fence !== null) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/.exec(line)
      if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) fence = null
      continue
    }
    const open = FENCE.exec(line)
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { char: open[1][0], length: open[1].length }
      continue
    }
    const heading = HEADING.exec(line)
    if (!heading) continue
    close(i)
    level = heading[1].length
    const text = (heading[2] ?? '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim()
    title = text === '' ? undefined : text
    from = i + 1
  }
  close(lines.length)
  return parts
}

// Roles

/**
 * A heading as the tables compare it: in NFC, without markdown emphasis (`*`, `_`, backticks), the white space collapsed
 * and trimmed, without the colons and periods that end it (`**Definition:**` is `definition`), and lower-cased.
 */
export function normalizeHeading(heading: string): string {
  return heading
    .normalize('NFC')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s:.]+$/, '')
    .trim()
    .toLowerCase()
}

type Rule = string | RegExp

/** `b[ií]b{1,2}l[ií]cas?`: "bíblicas" as the es-419 tW writes it, and with the accents or the doubled letters it lost. */
const BIBLICAS = 'b[ií]b{1,2}l[ií]cas?'

/**
 * The headings of tW and tA, by language, as the sample of phase 0 shows them (en: 953 tW and 242 tA articles; es-419:
 * 1 055 tW and 234 tA; the es-419 tA is mostly English). A rule is a normalized heading or a pattern for the headings
 * of one family (the many ways es-419 writes "Reason this is a translation issue").
 *
 * The Portuguese rules are not checked against data: the sample has no Portuguese.
 */
const TABLES: { lang: string; rules: [Role, Rule[]][] }[] = [
  {
    lang: 'en',
    rules: [
      ['definition', ['definition']],
      ['facts', ['facts']],
      ['translation-suggestions', ['translation suggestions', 'translation suggestion', 'translations suggestions']],
      [
        'examples',
        [
          /^(?:other )?examples(?: from (?:obs and )?the bible(?: stories)?)?$/,
          'translation notes examples',
          /^(?:examples of )?translation strategies applied$/,
        ],
      ],
      ['strategies', ['translation strategies']],
      ['description', ['description']],
      ['reason', [/^reasons? this is a translation issue$/]],
      ['bible-references', ['bible references', 'bible reference']],
      ['word-data', ['word data']],
    ],
  },
  {
    lang: 'es',
    rules: [
      ['definition', ['definición', 'definicion']],
      ['facts', ['hechos']],
      ['translation-suggestions', ['sugerencias de traducción', 'sugerencias de traduccion']],
      [
        'examples',
        [
          /^(?:otros )?ejemplos de (?:la |las )?(?:obs y (?:de )?(?:la )?)?biblia$/,
          new RegExp(`^ejemplos? de (?:las? )?historias ${BIBLICAS}$`),
          /^(?:ejemplos de )?estrategias de traducción aplicadas$/,
        ],
      ],
      ['strategies', ['estrategias de traducción', 'estrategias de traduccion']],
      ['description', [/^descripci[oó]n$/]],
      ['reason', [/^(?:la )?raz(?:ón|ones)(?: por (?:la|las) que (?:esto|este|esta) (?:es|son))? (?:es )?un problema (?:de|para la) traducción$/]],
      ['bible-references', [new RegExp(`^referencias ${BIBLICAS}$`), 'referencias de la biblia']],
      ['word-data', [/^datos? (?:de )?(?:esta|la|las) palabras?$/]],
    ],
  },
  {
    lang: 'pt',
    rules: [
      ['definition', ['definição']],
      ['facts', ['fatos']],
      ['translation-suggestions', ['sugestões de tradução']],
      [
        'examples',
        [
          /^(?:outros )?exemplos (?:da|de|das) (?:(?:obs|histórias) e (?:da )?)?bíblia$/,
          /^exemplos (?:das|de) histórias (?:da bíblia|bíblicas)$/,
          /^(?:exemplos de )?estratégias de tradução aplicadas$/,
        ],
      ],
      ['strategies', ['estratégias de tradução']],
      ['description', ['descrição']],
      ['reason', [/^raz(?:ão|ões) pel(?:a|as) qua(?:l|is) (?:isso|isto|este|esse|estes|esses) (?:é|são) (?:um )?problemas? (?:de|para a) tradução$/]],
      ['bible-references', ['referências bíblicas', 'referências da bíblia']],
      ['word-data', [/^dados (?:da|sobre a|desta) palavra$/]],
    ],
  },
]

const COMPILED = TABLES.map(({ lang, rules }) => {
  const exact = new Map<string, Role>()
  const patterns: [Role, RegExp][] = []
  for (const [role, list] of rules) {
    for (const rule of list) {
      if (typeof rule === 'string') exact.set(rule, role)
      else patterns.push([role, rule])
    }
  }
  return { lang, exact, patterns }
})

/**
 * What a heading is for, and the language of the table that says so (`en`, `es` or `pt`): `{ role: 'unknown', lang: null }`
 * when no rule places it. Headings are compared as {@link normalizeHeading} writes them, so case, emphasis and a closing
 * colon do not matter. The tables are tried in the order `en`, `es`, `pt`; no heading is in two of them.
 */
export function roleOf(heading: string): { role: Role; lang: string | null } {
  const key = normalizeHeading(heading)
  if (key !== '') {
    for (const table of COMPILED) {
      const role = table.exact.get(key) ?? table.patterns.find(([, pattern]) => pattern.test(key))?.[0]
      if (role !== undefined) return { role, lang: table.lang }
    }
  }
  return { role: 'unknown', lang: null }
}

/** The primary language subtag, lower-cased: `es-419` and `es` are the same family. */
const family = (lang: string): string => lang.split(/[-_]/)[0].toLowerCase()

// Fingerprints and trigrams

const WORD = /[\p{L}\p{M}\p{N}]+/gu

/** The distinct word trigrams of a text, each as a number, sorted (see the top of this file). Empty for fewer than 3 words. */
export function trigramsOf(text: string): number[] {
  const words = text.normalize('NFC').toLowerCase().match(WORD)
  if (words === null || words.length < 3) return []
  const seen = new Set<number>()
  for (let i = 0; i + 2 < words.length; i++) seen.add(sha256Prefix32(`${words[i]} ${words[i + 1]} ${words[i + 2]}`))
  return [...seen].sort((a, b) => a - b)
}

/** How many numbers two sorted lists have in common. */
function common(a: number[], b: number[]): number {
  let i = 0
  let j = 0
  let n = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      n++
      i++
      j++
    } else if (a[i] < b[j]) i++
    else j++
  }
  return n
}

// Assigning

type Prepared = { part: SectionPart; role: Role; lang: string; key: string | null; fingerprint: string; trigrams: number[] }

/** What pass 1 compares: the normalized heading, or one fixed key for the text before the first heading. `null` for a heading with no text. */
function headingKey(level: number, title: string | undefined): string | null {
  if (level === 0) return '\0intro'
  const key = normalizeHeading(title ?? '')
  return key === '' ? null : key
}

function prepare(part: SectionPart, articleLang: string): Prepared {
  let role: Role = 'intro'
  let lang = articleLang
  if (part.level > 0) {
    const placed = roleOf(part.title ?? '')
    role = placed.role
    // A heading from another language's table says the section is written in that language.
    if (placed.lang !== null && family(placed.lang) !== family(articleLang)) lang = placed.lang
  }
  return { part, role, lang, key: headingKey(part.level, part.title), fingerprint: sha256Hex(part.md), trigrams: trigramsOf(part.md) }
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list === undefined) map.set(key, [value])
  else list.push(value)
}

/** The sections of one article against the entries the registry has for it. Nothing here touches the registry itself. */
function assign(articleLang: string, parts: SectionPart[], old: RegistryEntry[]): { sections: SectionModel[]; entries: RegistryEntry[] } {
  const prepared = parts.map((part) => prepare(part, articleLang))
  const n = prepared.length
  const match: number[] = new Array(n).fill(-1)
  const used: boolean[] = new Array(old.length).fill(false)
  const take = (i: number, o: number) => {
    match[i] = o
    used[o] = true
  }

  // 1. The same heading.
  const byHeading = new Map<string, number[]>()
  old.forEach((entry, o) => {
    const key = headingKey(entry.level, entry.title)
    if (key !== null) pushTo(byHeading, key, o)
  })
  prepared.forEach(({ key }, i) => {
    const o = key === null ? undefined : byHeading.get(key)?.shift()
    if (o !== undefined) take(i, o)
  })

  // 2. The same role and the same place among the sections of that role.
  const oldByRole = new Map<Role, number[]>()
  old.forEach((entry, o) => pushTo(oldByRole, entry.role, o))
  const seen = new Map<Role, number>()
  prepared.forEach(({ role }, i) => {
    const place = seen.get(role) ?? 0
    seen.set(role, place + 1)
    if (match[i] !== -1 || role === 'unknown') return
    const o = oldByRole.get(role)?.[place]
    if (o !== undefined && !used[o]) take(i, o)
  })

  // 3. Its text: at least half of its trigrams are in the old section; the most in common wins.
  prepared.forEach(({ trigrams }, i) => {
    if (match[i] !== -1 || trigrams.length === 0) return
    let best = -1
    let bestCommon = 0
    old.forEach((entry, o) => {
      if (used[o] || entry.trigrams.length === 0) return
      const shared = common(trigrams, entry.trigrams)
      if (2 * shared >= trigrams.length && shared > bestCommon) {
        best = o
        bestCommon = shared
      }
    })
    if (best !== -1) take(i, best)
  })

  // Merges: an old section nobody matched whose text lives (at least half of its trigrams) in one new section.
  const absorbed: string[][] = prepared.map(() => [])
  old.forEach((entry, o) => {
    if (used[o] || entry.trigrams.length === 0) return
    let best = -1
    let bestCommon = 0
    prepared.forEach(({ trigrams }, i) => {
      if (trigrams.length === 0) return
      const shared = common(trigrams, entry.trigrams)
      if (2 * shared >= entry.trigrams.length && shared > bestCommon) {
        best = i
        bestCommon = shared
      }
    })
    if (best === -1) return
    used[o] = true
    if (match[best] === -1) match[best] = o
    else absorbed[best].push(entry.sid)
  })

  // Sids. Every sid and alias the registry has had for the article is taken, those of dropped sections too.
  const taken = new Set<string>()
  let highestS = 0
  const reserve = (sid: string) => {
    taken.add(sid)
    const m = /^s(\d+)$/.exec(sid)
    if (m !== null) highestS = Math.max(highestS, Number(m[1]))
  }
  for (const entry of old) {
    reserve(entry.sid)
    for (const alias of entry.aliases ?? []) reserve(alias)
  }
  const fresh = (role: Role): string => {
    if (role === 'unknown') return `s${highestS + 1}`
    if (!taken.has(role)) return role
    for (let k = 2; ; k++) if (!taken.has(`${role}-${k}`)) return `${role}-${k}`
  }

  const sections: SectionModel[] = []
  const entries: RegistryEntry[] = []
  prepared.forEach(({ part, role, lang, fingerprint, trigrams }, i) => {
    const before = match[i] === -1 ? undefined : old[match[i]]
    const sid = before !== undefined ? before.sid : fresh(role)
    reserve(sid)
    const aliases = [...new Set([...(before?.aliases ?? []), ...absorbed[i]])].filter((alias) => alias !== sid)
    const section: SectionModel = { sid, level: part.level, role, lang, md: part.md }
    if (part.title !== undefined) section.title = part.title
    if (aliases.length > 0) section.aliases = aliases
    sections.push(section)
    const entry: RegistryEntry = { sid, level: part.level, role, fingerprint, trigrams }
    if (part.title !== undefined) entry.title = part.title
    if (aliases.length > 0) entry.aliases = [...aliases]
    entries.push(entry)
  })
  return { sections, entries }
}

/**
 * Gives the sections of an article their sids. `articleId` is the article's key in the registry ({@link articlePath}),
 * `articleLang` its language, `parts` its sections in reading order (the markdown as it will be stored: the fingerprint
 * and the trigrams are of this text), `registry` the one of the last build.
 *
 * Returns the sections, with their sid, role and language, and a new registry: `registry` with the entry of this
 * article replaced. `registry` itself is not changed.
 *
 * A section's language is the article's, unless the table that placed its heading belongs to another language family
 * (`en` in an `es-419` article gives `en`; `es` in an `es-419` one does not).
 */
export function assignSids(
  articleId: string,
  articleLang: string,
  parts: SectionPart[],
  registry: SectionRegistry,
): { sections: SectionModel[]; registry: SectionRegistry } {
  const { sections, entries } = assign(articleLang, parts, hasOwn(registry, articleId) ? registry[articleId] : [])
  return { sections, registry: { ...registry, [articleId]: entries } }
}

/** What {@link assignSids} does for one article, without copying the whole registry: for a builder that goes through thousands of articles. */
export function assignArticle(
  articleLang: string,
  parts: SectionPart[],
  old: RegistryEntry[] | undefined,
): { sections: SectionModel[]; entries: RegistryEntry[] } {
  return assign(articleLang, parts, old ?? [])
}
