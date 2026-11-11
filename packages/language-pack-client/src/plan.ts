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

/**
 * Activates the units that are complete and whose needs are (catalog.md "Activation").
 *
 * Mixed revisions: a unit keeps the revision it was activated from until its own segments change, and a shared dependency (the
 * common `orig:<book>`, `xmap`) may move on to a later revision under it when another language updates it. That is allowed here;
 * correctness is kept on the reader side, which never uses alignment positions against an original of another stamp (ids.md
 * "Positions in the original", `query/renderings.ts`). The other way is refused: a unit installed from a later revision is not moved
 * back by an older catalog of its name that is not the published one (a language built against an older common catalog), so an old
 * file does not undo an update (catalog.md "Going back"); the installed unit serves the needs instead.
 *
 * A published catalog replaces a local one (transfer.md "Old packs") unit by unit, and only where it has a replacement. A unit of
 * the local catalog is replaced by the same unit of the published catalog of its name when that one activates; a bridged
 * `<name>/orig:<book>` is dropped once a published `orig:<book>` of another catalog (the common one) is installed and no unit kept
 * needs it, so `prune` removes its segments (and the local catalog once none of its units is left). A bridged unit with no
 * published replacement (a book the published catalog lacks) stays, with what it needs. A local unit the published catalog of its
 * name does not list never serves a need of a published unit, so a published book does not activate against the bridged orig.
 *
 * `only`: when given, the only units considered (an import: what the file brought, what is installed, and their needs).
 * `localCatalogs`: the ids of the stored catalogs whose origin is local, which tell the units of a state saved before units carried
 * `local` (`localCatalogIds`).
 */
export function activate(
  state: InstalledState,
  catalogs: VerifiedCatalog[],
  have: ReadonlySet<string>,
  o: { strict?: boolean; only?: ReadonlySet<string>; localCatalogs?: ReadonlySet<string> } = {},
): { state: InstalledState; activated: string[]; waiting: { key: string; missing: string[] }[] } {
  type Cand = { key: string; cat: VerifiedCatalog; entry: InstalledUnit; missing: string[] }
  const cands: Cand[] = []
  for (const cat of catalogs) {
    for (const unit of cat.catalog.units) {
      if (o.only !== undefined && !o.only.has(`${cat.name}/${unit.id}`)) continue
      const segments = unit.segments.map((i) => hex(segmentOf(cat, i).id))
      const entry: InstalledUnit = {
        catalog: cat.name,
        revision: cat.revision,
        catalogId: cat.id,
        segments,
        needs: (unit.needs ?? []).map((n) => qualify(catalogs, cat.name, n)),
        ...(unit.optional ? { optional: true as const } : {}),
        ...(cat.origin === 'local' ? { local: true as const } : {}),
      }
      cands.push({ key: `${cat.name}/${unit.id}`, cat, entry, missing: segments.filter((s) => !have.has(s)) })
    }
  }
  const byKey = new Map(cands.map((c) => [c.key, c]))
  const publishedOf = new Map(catalogs.filter((c) => c.origin === 'published').map((c) => [c.name, c]))
  // From a local catalog: the flag, or (a state saved before the flag) the catalog its units came from is a local one.
  const fromLocal = (u: InstalledUnit): boolean =>
    u.local === true ||
    o.localCatalogs?.has(u.catalogId) === true ||
    (state.active[u.catalog]?.origin === 'local' && state.active[u.catalog]!.id === u.catalogId)
  // A local unit the published catalog of its name does not list (the bridged orig): it serves no need of a published unit.
  const unlisted = (key: string): boolean => {
    const u = state.units[key]
    const pub = u === undefined ? undefined : publishedOf.get(u.catalog)
    return u !== undefined && pub !== undefined && fromLocal(u) && !pub.catalog.units.some((x) => `${pub.name}/${x.id}` === key)
  }
  const ok = new Set<string>()
  const satisfied = (c: Cand) => (need: string): boolean =>
    ok.has(need) || (!byKey.has(need) && state.units[need] !== undefined && !(c.cat.origin === 'published' && unlisted(need)))
  // A unit whose segments and needs are the installed ones only takes the new revision. `strict`: `have` covers every segment of
  // the catalogs (an import), so a segment the store lost also holds back a unit that would otherwise only take the revision.
  const same = (c: Cand): boolean => {
    const old = state.units[c.key]
    return old !== undefined && sameList(old.segments, c.entry.segments) && sameList(old.needs, c.entry.needs)
  }
  const held = (c: Cand): boolean => {
    const old = state.units[c.key]
    return old !== undefined && old.revision > c.entry.revision && state.published[c.cat.name]?.id !== c.cat.id
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const c of cands) {
      if (ok.has(c.key)) continue
      if (held(c) || (same(c) && (o.strict !== true || c.missing.length === 0)) || (c.missing.length === 0 && c.entry.needs.every(satisfied(c)))) {
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
      waiting.push({ key: c.key, missing: [...c.missing, ...c.entry.needs.filter((n) => !satisfied(c)(n))] })
      continue
    }
    if (held(c)) continue
    const old = state.units[c.key]
    if (old === undefined || old.revision !== c.entry.revision || old.catalogId !== c.entry.catalogId) {
      next.units[c.key] = c.entry
      activated.push(c.key)
      // A bridged unit activated next to a published catalog (an old pack of a book the device lacks) leaves `active` on it.
      if (!(c.cat.origin === 'local' && next.active[c.cat.name]?.origin === 'published')) {
        next.active[c.cat.name] = installedOf(c.cat, state.published[c.cat.name], state.active[c.cat.name])
      }
    }
  }
  // A bridged `<name>/orig:<book>` whose replacement is installed: `orig:<book>` of a published catalog of another name. It goes
  // once no unit kept needs it (a bridged book the published catalog has not replaced yet keeps it).
  const replacedOrig = (key: string, u: InstalledUnit): boolean => {
    const id = key.slice(key.indexOf('/') + 1)
    if (!id.startsWith('orig:') || !fromLocal(u)) return false
    return Object.entries(next.units).some(([k, v]) => k !== key && k === `${v.catalog}/${id}` && v.catalog !== u.catalog && !fromLocal(v))
  }
  const gone = new Set(Object.entries(next.units).filter(([k, u]) => replacedOrig(k, u)).map(([k]) => k))
  for (let changed = true; changed; ) {
    changed = false
    const needed = new Set(Object.entries(next.units).flatMap(([k, u]) => (gone.has(k) ? [] : u.needs)))
    for (const k of gone) {
      if (!needed.has(k)) continue
      gone.delete(k)
      changed = true
    }
  }
  for (const k of gone) delete next.units[k]
  for (const cat of catalogs) {
    const cur = next.published[cat.name]
    if (cur === undefined || (cur.publisher === cat.publisher && cat.revision >= cur.revision)) next.published[cat.name] = installedOf(cat, cur, state.active[cat.name])
  }
  return { state: next, activated, waiting }
}

/**
 * The units to offer: each installed unit whose segments changed in the catalogs, and each bridged unit (from a local catalog)
 * that a published catalog lists, whose replacement is installed by the same install (transfer.md "Old packs"). A bridged unit
 * is listed even when its segments are the published ones (the bridge makes the same ids): the published unit needs other units
 * (the common catalog's `orig:<book>` in place of the bridged `<lang>/orig:<book>`), so it activates only once those are here,
 * and no install would ask for them otherwise. Those needs that are not installed are listed too, so the install of the listed
 * keys brings them and the sizes add up without counting a segment twice; `from` is the revision of the bridged unit of the same
 * id they replace (0 when none). `bytes` counts the segments the replaced unit does not have.
 *
 * `localCatalogs`: the ids of the stored local catalogs, which tell the bridged units of a state saved before units carried `local`.
 */
export function updates(
  state: InstalledState,
  catalogs: VerifiedCatalog[],
  localCatalogs?: ReadonlySet<string>,
): { key: string; from: number; to: number; bytes: number }[] {
  const out: { key: string; from: number; to: number; bytes: number }[] = []
  const listed = new Set<string>()
  const fromLocal = (u: InstalledUnit): boolean =>
    u.local === true ||
    localCatalogs?.has(u.catalogId) === true ||
    (state.active[u.catalog]?.origin === 'local' && state.active[u.catalog]!.id === u.catalogId)
  const sizeOf = (cat: VerifiedCatalog, unit: Unit, had: ReadonlySet<string>): number =>
    unit.segments.reduce((n, i) => {
      const s = segmentOf(cat, i)
      return n + (had.has(hex(s.id)) ? 0 : s.size)
    }, 0)
  const replacing: Found[] = []
  for (const cat of catalogs) {
    for (const unit of cat.catalog.units) {
      const key = `${cat.name}/${unit.id}`
      const old = state.units[key]
      if (old === undefined) continue
      const bridged = cat.origin === 'published' && old.catalogId !== cat.id && fromLocal(old)
      const ids = unit.segments.map((i) => hex(segmentOf(cat, i).id))
      if (sameList(old.segments, ids) && !bridged) continue
      out.push({ key, from: old.revision, to: cat.revision, bytes: sizeOf(cat, unit, new Set(old.segments)) })
      listed.add(key)
      if (bridged) replacing.push({ cat, unit })
    }
  }
  // What the replacements need that is not installed, and what that needs in turn.
  const bridgedTwin = (id: string): InstalledUnit | undefined =>
    Object.entries(state.units).find(([k, u]) => k.slice(k.indexOf('/') + 1) === id && fromLocal(u))?.[1]
  const addNeeds = ({ cat, unit }: Found): void => {
    for (const n of unit.needs ?? []) {
      const key = qualify(catalogs, cat.name, n)
      if (listed.has(key) || state.units[key] !== undefined) continue
      const f = find(catalogs, key)
      if (f === undefined) continue
      listed.add(key)
      const twin = bridgedTwin(f.unit.id)
      out.push({ key, from: twin?.revision ?? 0, to: f.cat.revision, bytes: sizeOf(f.cat, f.unit, new Set(twin?.segments ?? [])) })
      addNeeds(f)
    }
  }
  replacing.forEach(addNeeds)
  return out
}
