/**
 * TIPNR reader: Translators Individualised Proper Names with all References, by STEPBible.org (Tyndale House Cambridge),
 * CC BY 4.0. It reads the people and places of the file: the unified name and uStrong, the names with their dStrongs and
 * references, and the relations to other records. It never reads the `@Briefest`, `@Brief`, `@Short` or `@Article` text, nor
 * the translated-name column: those are not part of what the format keeps. No Node module is used.
 */
import { bookNumber, verseId } from '../ids'
import { fromHebrewNumbering } from '../build/hebrewNumbering'

export type TipnrName = { name: string; dStrong: string; refs: { verse: number; letter?: string }[] }

export type TipnrRelationType = 'parent' | 'sibling' | 'partner' | 'child' | 'tribe' | 'founder' | 'inhabitant'

export type TipnrRecord = {
  kind: 'person' | 'place'
  unique: string
  uStrong: string
  id: string
  names: TipnrName[]
  relations: { type: TipnrRelationType; unique: string }[]
}

const PERSON_RELATIONS: [number, TipnrRelationType][] = [[2, 'parent'], [3, 'sibling'], [4, 'partner'], [5, 'child'], [6, 'tribe']]
const PLACE_RELATIONS: [number, TipnrRelationType][] = [[2, 'founder'], [3, 'inhabitant']]

/** The slug of ids.md: lowercase, spaces and `'` to `-`, any other character outside `[a-z0-9-]` dropped. */
function slug(text: string): string {
  return text.toLowerCase().replace(/[ ']/g, '-').replace(/[^a-z0-9-]/g, '')
}

// A record line: UnifiedName=uStrong, with a reference after the @.
const RECORD = /^[^\s*@][^@\t]*@[1-3]?[A-Za-z]+\.\d+\.\d+[^=\t]*=[HG]\d{4}\w*$/

const FIRST_REF = /@([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)/

function relationsOf(cols: string[], table: [number, TipnrRelationType][]): TipnrRecord['relations'] {
  const out: TipnrRecord['relations'] = []
  for (const [index, type] of table) {
    for (const item of (cols[index] ?? '').split(/\s*[+,]\s*/)) {
      const unique = item.replace(/\((?:d|a|f)\)/g, '').trim()
      if (unique.includes('@')) out.push({ type, unique })
    }
  }
  return out
}

function parseRefs(text: string, issues: string[], where: string): TipnrName['refs'] {
  const refs: TipnrName['refs'] = []
  for (const raw of text.split(/[;,]/)) {
    const ref = raw.trim()
    if (ref === '') continue
    const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)([a-z]?)$/.exec(ref)
    if (m === null) {
      issues.push(`${where}: reference not understood: ${ref}`)
      continue
    }
    const book = m[1].toLowerCase()
    try {
      const place = fromHebrewNumbering(book, { chapter: Number(m[2]), verse: Number(m[3]) })
      bookNumber(book)
      const verse = verseId(book, place.chapter, place.verse)
      refs.push(m[4] === '' ? { verse } : { verse, letter: m[4] })
    } catch {
      issues.push(`${where}: reference cannot be converted: ${ref}`)
    }
  }
  return refs
}

type Draft = Omit<TipnrRecord, 'id'> & { slug: string; suffix: string }

/** Parses the people and places of a TIPNR file. A line or reference that cannot be used is described in `issues`. */
export function parseTipnr(text: string, issues: string[]): TipnrRecord[] {
  const drafts: Draft[] = []
  let kind: 'person' | 'place' | null = null
  let current: Draft | null = null
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('$')) {
      const title = line.replace(/^\$=*\s*/, '').split('\t')[0].trim()
      kind = title.startsWith('PERSON') ? 'person' : title === 'PLACE' || title === 'PLACE+PERSON' ? 'place' : null
      current = null
      continue
    }
    if (kind === null || line === '') continue
    const cols = line.split('\t')
    const first = cols[0]
    if (first.startsWith('–')) {
      if (current === null || first.trim() === '– Total') continue
      const unique = cols[1] ?? ''
      const dStrong = (cols[2] ?? '').split('«')[0].trim()
      if (dStrong === '') {
        issues.push(`${current.unique}: name line without dStrong`)
        continue
      }
      const name = unique.split('@')[0].split('|')[0].trim()
      current.names.push({ name, dStrong, refs: parseRefs(cols[4] ?? '', issues, current.unique) })
      continue
    }
    const eq = first.lastIndexOf('=')
    if (!RECORD.test(first) || cols.length < 8) continue
    const unique = first.slice(0, eq).trim()
    const uStrong = first.slice(eq + 1).trim()
    const m = FIRST_REF.exec(unique)
    let suffix = ''
    if (m !== null) suffix = `${m[1].toLowerCase()}-${m[2]}-${m[3]}`
    else issues.push(`${unique}: no reference after @`)
    current = {
      kind,
      unique,
      uStrong,
      names: [],
      relations: relationsOf(cols, kind === 'person' ? PERSON_RELATIONS : PLACE_RELATIONS),
      slug: slug(unique.split('@')[0]),
      suffix,
    }
    drafts.push(current)
  }

  // Ids: a slug shared by several records of one kind takes the suffix of each; a clash that remains takes -2, -3.
  const count = new Map<string, number>()
  for (const d of drafts) count.set(`${d.kind}:${d.slug}`, (count.get(`${d.kind}:${d.slug}`) ?? 0) + 1)
  const used = new Map<string, number>()
  return drafts.map(({ slug: s, suffix, ...rest }) => {
    const prefix = rest.kind === 'person' ? 'per' : 'lug'
    const shared = (count.get(`${rest.kind}:${s}`) ?? 0) > 1
    let id = `${prefix}:${shared && suffix !== '' ? `${s}-${suffix}` : s}`
    const n = (used.get(id) ?? 0) + 1
    used.set(id, n)
    if (n > 1) id = `${id}-${n}`
    return { ...rest, id }
  })
}
