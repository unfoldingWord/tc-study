/**
 * Install plans, activation by unit and update reports: pure functions over verified catalogs and the installed state
 * (`catalog.md`: a unit is used when all its segments are present and its needs are; until then the reader keeps the unit it had).
 */
import type { Unit } from '@bt-synergy/language-pack-v3'
import { hex, type InstalledState, type InstalledUnit, installedOf, qualify, segmentOf } from './state'
import type { VerifiedCatalog } from './verify'

export type Want = { books?: string[]; units?: string[]; aligned?: true | string[]; defaults?: boolean }
export type Step = {
  key: string
  catalog: string
  unit: string
  segments: { id: string; class: string; size: number }[]
  complete: boolean
}

const DEFAULT_UNITS = ['xmap', 'map', 'xtopics', 'topics']

type Found = { cat: VerifiedCatalog; unit: Unit }

function find(catalogs: VerifiedCatalog[], key: string): Found | undefined {
  const slash = key.indexOf('/')
  const cat = catalogs.find((c) => c.name === key.slice(0, slash))
  const unit = cat?.catalog.units.find((u) => u.id === key.slice(slash + 1))
  return cat !== undefined && unit !== undefined ? { cat, unit } : undefined
}

/** The keys of the units named `id` (or already qualified) in the catalogs, in catalog order. */
function keysFor(catalogs: VerifiedCatalog[], id: string): string[] {
  if (id.includes('/')) return find(catalogs, id) !== undefined ? [id] : []
  return catalogs.filter((c) => c.catalog.units.some((u) => u.id === id)).map((c) => `${c.name}/${id}`)
}

export function planInstall(
  catalogs: VerifiedCatalog[],
  _state: InstalledState,
  want: Want,
  have: ReadonlySet<string>,
): { steps: Step[]; bytes: number; unknown: string[] } {
  const unknown: string[] = []
  const order: string[] = []
  const seen = new Set<string>()
  const add = (key: string): void => {
    if (seen.has(key)) return
    seen.add(key)
    const f = find(catalogs, key)
    if (f === undefined) {
      unknown.push(key)
      return
    }
    // Dependencies first, so a unit is never listed before what it needs.
    for (const n of f.unit.needs ?? []) add(qualify(catalogs, f.cat.name, n))
    order.push(key)
  }
  const addNamed = (id: string): void => {
    const keys = keysFor(catalogs, id)
    if (keys.length === 0) {
      if (!unknown.includes(id)) unknown.push(id)
      return
    }
    keys.forEach(add)
  }

  if (want.defaults !== false) {
    for (const id of DEFAULT_UNITS) for (const key of keysFor(catalogs, id)) add(key)
  }
  for (const b of want.books ?? []) addNamed(`book:${b}`)
  for (const u of want.units ?? []) addNamed(u)
  if (want.aligned === true) {
    for (const c of catalogs) for (const u of c.catalog.units) if (u.id.startsWith('aligned:')) add(`${c.name}/${u.id}`)
  } else if (want.aligned !== undefined) {
    for (const a of want.aligned) addNamed(`aligned:${a}`)
  }

  const steps: Step[] = []
  const counted = new Set<string>()
  let bytes = 0
  for (const key of order) {
    const f = find(catalogs, key)!
    const segments = f.unit.segments.map((i) => {
      const s = segmentOf(f.cat, i)
      return { id: hex(s.id), class: s.class, size: s.size }
    })
    for (const s of segments) {
      if (!have.has(s.id) && !counted.has(s.id)) {
        counted.add(s.id)
        bytes += s.size
      }
    }
    steps.push({ key, catalog: f.cat.name, unit: f.unit.id, segments, complete: segments.every((s) => have.has(s.id)) })
  }
  return { steps, bytes, unknown }
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

export function activate(
  state: InstalledState,
  catalogs: VerifiedCatalog[],
  have: ReadonlySet<string>,
  o: { strict?: boolean } = {},
): { state: InstalledState; activated: string[]; waiting: { key: string; missing: string[] }[] } {
  type Cand = { key: string; cat: VerifiedCatalog; entry: InstalledUnit; missing: string[] }
  const cands: Cand[] = []
  for (const cat of catalogs) {
    for (const unit of cat.catalog.units) {
      const segments = unit.segments.map((i) => hex(segmentOf(cat, i).id))
      const entry: InstalledUnit = {
        catalog: cat.name,
        revision: cat.revision,
        catalogId: cat.id,
        segments,
        needs: (unit.needs ?? []).map((n) => qualify(catalogs, cat.name, n)),
        ...(unit.optional ? { optional: true as const } : {}),
      }
      cands.push({ key: `${cat.name}/${unit.id}`, cat, entry, missing: segments.filter((s) => !have.has(s)) })
    }
  }
  const byKey = new Map(cands.map((c) => [c.key, c]))
  const ok = new Set<string>()
  const satisfied = (need: string): boolean => ok.has(need) || (!byKey.has(need) && state.units[need] !== undefined)
  // A unit whose segments and needs are the installed ones only takes the new revision. `strict`: `have` covers every segment of
  // the catalogs (an import), so a segment the store lost also holds back a unit that would otherwise only take the revision.
  const same = (c: Cand): boolean => {
    const old = state.units[c.key]
    return old !== undefined && sameList(old.segments, c.entry.segments) && sameList(old.needs, c.entry.needs)
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const c of cands) {
      if (ok.has(c.key)) continue
      if ((same(c) && (o.strict !== true || c.missing.length === 0)) || (c.missing.length === 0 && c.entry.needs.every(satisfied))) {
        ok.add(c.key)
        changed = true
      }
    }
  }

  const next: InstalledState = { v: 1, published: { ...state.published }, active: { ...state.active }, units: { ...state.units }, ...(state.aliases !== undefined ? { aliases: state.aliases } : {}) }
  const activated: string[] = []
  const waiting: { key: string; missing: string[] }[] = []
  for (const c of cands) {
    if (!ok.has(c.key)) {
      waiting.push({ key: c.key, missing: [...c.missing, ...c.entry.needs.filter((n) => !satisfied(n))] })
      continue
    }
    const old = state.units[c.key]
    if (old === undefined || old.revision !== c.entry.revision || old.catalogId !== c.entry.catalogId) {
      next.units[c.key] = c.entry
      activated.push(c.key)
      next.active[c.cat.name] = installedOf(c.cat, state.published[c.cat.name], state.active[c.cat.name])
    }
  }
  for (const cat of catalogs) {
    const cur = next.published[cat.name]
    if (cur === undefined || cat.revision >= cur.revision) next.published[cat.name] = installedOf(cat, cur, state.active[cat.name])
  }
  return { state: next, activated, waiting }
}

export function updates(
  state: InstalledState,
  catalogs: VerifiedCatalog[],
): { key: string; from: number; to: number; bytes: number }[] {
  const out: { key: string; from: number; to: number; bytes: number }[] = []
  for (const cat of catalogs) {
    for (const unit of cat.catalog.units) {
      const key = `${cat.name}/${unit.id}`
      const old = state.units[key]
      if (old === undefined) continue
      const ids = unit.segments.map((i) => hex(segmentOf(cat, i).id))
      if (sameList(old.segments, ids)) continue
      const had = new Set(old.segments)
      const bytes = unit.segments.reduce((n, i, k) => n + (had.has(ids[k]!) ? 0 : segmentOf(cat, i).size), 0)
      out.push({ key, from: old.revision, to: cat.revision, bytes })
    }
  }
  return out
}
