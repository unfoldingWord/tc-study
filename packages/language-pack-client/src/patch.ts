/**
 * A reader over a base language and its patch catalogs (`{lang}-x-{source}`, e.g. `hi-x-aquifer`). No Node module here.
 *
 * - The base always wins: a table (`notes`, `questions`, `links`) of a book the base has stays the base's, even when the patch has the
 *   book too. A patch only fills a table the base lacks for that book, or the whole book when the base has none of it.
 * - Every row and every cite that came from a patch carries `patch`: the patch language and the provenance of its resource entry.
 * - Everything else (articles, maps, `orig`, search) is the base's: a patch has no `art:` groups and no map, so the `ta:` concepts of a
 *   patch row resolve through the base, and the coverage is the base's.
 * - With several patches the first that has the table wins (the order of `patches` is the order of preference).
 */
import type { BookModel, CatalogResource, HelpRow, HelpTable } from '@bt-synergy/language-pack-v3'
import { type Answer, missingUnit, type PatchMark } from './query/envelope'
import { type ContextData, contextQuery } from './query/article'
import { type PassageData, parsePassage, passageQuery } from './query/passage'
import type { PackReader } from './reader'

const KINDS = ['notes', 'questions', 'links'] as const

function markOf(patch: string, r: CatalogResource): PatchMark {
  return {
    patch,
    ...(r.source !== undefined ? { source: r.source } : {}),
    ...(r.review !== undefined ? { review: r.review } : {}),
    license: r.license,
    ...(r.rights !== undefined ? { rights: r.rights } : {}),
    ...(r.attribution !== undefined ? { attribution: r.attribution } : {}),
    release: r.release,
  }
}

export type { PatchMark }

/** `base` with `patches` merged in; see the top of this file. `patches` that are not installed should be left out by the caller. */
export function patchedReader(base: PackReader, patches: PackReader[]): PackReader {
  if (patches.length === 0) return base
  const marks = new Map<string, PatchMark>()
  for (const p of patches) {
    for (const r of p.resources?.() ?? []) if (!marks.has(r.key)) marks.set(r.key, markOf(p.lang, r))
  }
  const markFor = (patch: PackReader, res: string): PatchMark => marks.get(res) ?? { patch: patch.lang, license: '', release: '' }

  async function book(name: string): Promise<BookModel | undefined> {
    const unit = `book:${name}`
    const mine = base.installed(unit) ? await base.book(name) : undefined
    let out = mine
    for (const p of patches) {
      const theirs = p.installed(unit) ? await p.book(name) : undefined
      if (theirs === undefined) continue
      if (out === undefined) {
        // The base has no such book: the patch's rows, each marked. It has no texts, so the answer is notes only.
        out = { ...theirs, notes: mark(p, theirs.notes), questions: mark(p, theirs.questions), links: mark(p, theirs.links) }
        for (const k of KINDS) if (out[k] === undefined) delete out[k]
        continue
      }
      if (out === mine) out = { ...mine, res: [...mine.res] }
      for (const kind of KINDS) {
        const table = theirs[kind]
        if (out[kind] !== undefined || table === undefined) continue
        out[kind] = mark(p, table)
        for (const entry of theirs.res) if (entry[0] === table.res && !out.res.some((r) => r[0] === entry[0])) out.res.push(entry)
      }
    }
    return out
  }
  function mark(p: PackReader, table: HelpTable | undefined): HelpTable | undefined {
    if (table === undefined) return undefined
    const m = markFor(p, table.res)
    return { res: table.res, rows: table.rows.map((row): HelpRow => ({ ...row, patch: m }) as HelpRow) }
  }

  const sizeOf = (unit: string): number => (base.listed(unit) ? base.size(unit) : (patches.find((p) => p.listed(unit))?.size(unit) ?? 0))
  const merged: PackReader = {
    ...base,
    get problems() {
      return [...base.problems, ...patches.flatMap((p) => p.problems)]
    },
    installed: (unit) => base.installed(unit) || (unit.startsWith('book:') && patches.some((p) => p.installed(unit))),
    listed: (unit) => base.listed(unit) || (unit.startsWith('book:') && patches.some((p) => p.listed(unit))),
    size: sizeOf,
    unitRevision: (unit) => base.unitRevision(unit) ?? (unit.startsWith('book:') ? patches.map((p) => p.unitRevision(unit)).find((r) => r !== undefined) : undefined),
    book,
    passage: async (ref) => finish(await passageQuery(merged, ref), ref),
    context: async (ref) => finish(await contextQuery(merged, ref), ref),
  }

  /** Marks the cites of patch resources; when the base has no such book, says so (its text could be installed). */
  function finish<T extends PassageData | ContextData>(a: Answer<T>, ref: string): Answer<T> {
    for (const c of a.cites) {
      const m = marks.get(c.res)
      if (m !== undefined && c.patch === undefined) c.patch = m
    }
    const { book: name } = parsePassage(ref)
    const unit = `book:${name}`
    if (a.data !== null && !base.installed(unit) && base.listed(unit)) missingUnit(a, { book: name, unit, bytes: base.size(unit) })
    return a
  }
  return merged
}
