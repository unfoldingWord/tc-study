/** `article`, and `context`: a passage with the default sections of the articles its notes and links name. No Node module here. */
import type { ArticleModel, Role, SectionModel } from '@bt-synergy/language-pack-v3'
import type { PackReader } from '../reader'
import { type Answer, absorb, missingUnit, newAnswer, releaseOf, usedUnit } from './envelope'
import { haveMap, usageBooks, usageUnit } from './maps'
import { type PassageData, passageQuery } from './passage'

export type ArticleData = {
  id: string
  title: string
  sections: (SectionModel & { otherLang: boolean })[]
  more: { sid: string; title?: string; role: Role }[]
}

function defaults(id: string, sections: SectionModel[]): SectionModel[] {
  const by = (...roles: Role[]) => sections.filter((s) => roles.includes(s.role))
  let pick: SectionModel[] = []
  if (id.startsWith('tw:')) pick = by('definition').length > 0 ? by('definition').slice(0, 1) : by('intro').slice(0, 1)
  else if (id.startsWith('ta:')) pick = by('description', 'reason')
  return pick.length > 0 ? pick : sections.slice(0, 1)
}

export async function articleQuery(reader: PackReader, id: string, section?: string | 'all'): Promise<Answer<ArticleData>> {
  const out = newAnswer<ArticleData>(reader, 'article')
  const unit = reader.unitOf('art', id) ?? `art:${id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : id}`
  const models: ArticleModel[] | undefined = reader.installed(unit) ? await reader.articles(unit.slice('art:'.length)) : undefined
  if (models === undefined) {
    missingUnit(out, { unit, bytes: reader.size(unit), what: id })
    return out
  }
  usedUnit(out, reader, unit)
  const art = models.find((a) => a.id === id) ?? models.find((a) => a.aliases?.includes(id))
  if (art === undefined) return out
  const chosen =
    section === undefined
      ? defaults(art.id, art.sections)
      : section === 'all'
        ? art.sections
        : art.sections.filter((s) => s.sid === section || s.aliases?.includes(section))
  const shown = new Set(chosen)
  const header = (await reader.segments(unit))?.[0]?.h.res
  const release = releaseOf(header, art.res)
  out.data = {
    id: art.id,
    title: art.title,
    sections: chosen.map((s) => ({ ...s, otherLang: s.lang !== reader.lang })),
    more: art.sections.filter((s) => !shown.has(s)).map((s) => ({ sid: s.sid, ...(s.title !== undefined ? { title: s.title } : {}), role: s.role })),
  }
  for (const s of chosen) out.cites.push({ res: art.res, release, id: art.id, section: s.sid })
  return out
}

export type ContextData = {
  passage: PassageData
  concepts: { concept: string; article: ArticleData | null; books: string[] }[]
}

export async function contextQuery(reader: PackReader, ref: string): Promise<Answer<ContextData>> {
  const base = await passageQuery(reader, ref)
  const out = newAnswer<ContextData>(reader, 'context')
  absorb(out, base)
  if (base.coverage !== undefined) out.coverage = base.coverage
  if (base.data === null) return out
  const ids: string[] = []
  for (const row of [...base.data.notes, ...base.data.links]) if (row.concept !== undefined && !ids.includes(row.concept)) ids.push(row.concept)
  const maps = await reader.maps()
  const concepts: ContextData['concepts'] = []
  for (const concept of ids) {
    const art = await articleQuery(reader, concept)
    absorb(out, art)
    const books: string[] = []
    if (haveMap(out, reader, maps, usageUnit(concept))) {
      if (maps.xmap !== undefined) usedUnit(out, reader, 'xmap')
      if (maps.map !== undefined) usedUnit(out, reader, 'map')
      const usage = { books: usageBooks(maps, concept) as Record<string, { state: string }> }
      for (const [book, cell] of Object.entries(usage.books)) {
        if (cell.state !== 'count' && cell.state !== 'partial') continue
        books.push(book)
        if (!reader.installed(`book:${book}`)) missingUnit(out, { book, unit: `book:${book}`, bytes: reader.size(`book:${book}`), what: concept })
      }
    }
    concepts.push({ concept, article: art.data, books })
  }
  out.data = { passage: base.data, concepts }
  return out
}
