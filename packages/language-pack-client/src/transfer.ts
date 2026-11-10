/**
 * Transfer files and old packs: the rules of `transfer.md` ("Receiving", "Old packs") and of `resource-pipeline/cli/transfer-v3.ts`
 * (`import`, `export update`), applied to a `BlobStore` instead of a folder. No Node module here.
 *
 * Import checks before it writes: the file, every catalog (signature, revision), the base of an update. Then the verified segments
 * go to the store, the catalogs after them, and `activate` runs over what the file brought; the state is saved once at the end, so a
 * store that fails halfway leaves the state it started from and keeps the segments already written.
 */
import {
  CATALOG_TABLES,
  FormatError,
  KNOWN,
  type BuiltSegment,
  type KnownTables,
  bridgeZip,
  readSegment,
  readTransfer,
  type RowSource,
  writeTransfer,
} from '@bt-synergy/language-pack-v3'
import { ClientError } from './errors'
import { loadState, localCatalogIds, readStored, st, verifiedHave } from './install'
import { activate } from './plan'
import { hex, type InstalledCatalog, type InstalledState, installedOf, qualify } from './state'
import type { BlobStore } from './store/types'
import { checkRevision, type TrustPolicy, type VerifiedCatalog, verifyCatalogFile } from './verify'

export type ImportReport = {
  catalogs: InstalledCatalog[]
  /** The ids of the segments written to the store. */
  stored: string[]
  /** Entries that did not verify: they are not stored. */
  rejected: { id: string; code: string }[]
  /** Old pack only: a published catalog of that language is installed and the pack brings nothing it has not installed already. */
  skipped?: true
  /** Entries a cut file lost. */
  missing: string[]
  activated: string[]
  waiting: { key: string; missing: string[] }[]
}

type Env = { store: BlobStore; trust: TrustPolicy }
type Seg = { id: string; bytes: Uint8Array; class: string }

const tables = KNOWN as Record<string, Record<string, number[]> | undefined>

/** Every segment is checked as a downloaded one would be; one that is not the segment its id says goes to `rejected`. */
async function checkSegments(items: { id: string; class: string; bytes: Uint8Array }[]): Promise<{ ok: Seg[]; rejected: ImportReport['rejected'] }> {
  const ok: Seg[] = []
  const rejected: ImportReport['rejected'] = []
  for (const it of items) {
    const known = tables[it.class]
    if (known === undefined) {
      rejected.push({ id: it.id, code: 'E_TABLE' })
      continue
    }
    try {
      await readSegment(it.bytes, { known, expectedId: it.id })
      ok.push(it)
    } catch (e) {
      if (!(e instanceof FormatError)) throw e
      rejected.push({ id: it.id, code: e.code })
    }
  }
  return { ok, rejected }
}

/**
 * The catalogs `activate` works with: the language catalogs of the file, the catalog each one `requires` by id (from the file or
 * the store; a file catalog of the same name with another id is not the one required, so it is only published), and the rest.
 */
async function activationSet(env: Env, fileCats: VerifiedCatalog[]): Promise<VerifiedCatalog[]> {
  const required = new Map<string, VerifiedCatalog>()
  for (const cat of fileCats) {
    for (const [rname, revision, rid] of cat.catalog.requires ?? []) {
      const id = hex(rid)
      const found =
        fileCats.find((c) => c.id === id) ?? (await readStored(env.store, env.trust, { name: rname, publisher: cat.publisher, revision, id, origin: 'published' }))
      if (found !== undefined && found.name === rname) required.set(rname, found)
    }
  }
  const set = fileCats.filter((c) => !required.has(c.name) || required.get(c.name)!.id === c.id)
  for (const r of required.values()) if (!set.some((c) => c.id === r.id)) set.push(r)
  return set
}

/**
 * Writes segments then catalogs, activates over `fileCats`, saves the state once. `publish`: the file catalogs that become the
 * published one of their name (the others are common catalogs a language requires by id that are older than the installed one).
 */
async function commit(
  env: Env,
  state: InstalledState,
  fileCats: VerifiedCatalog[],
  segs: Seg[],
  cut: string[] = [],
  publish: VerifiedCatalog[] = fileCats,
  onlyKeys?: ReadonlySet<string>,
): Promise<Pick<ImportReport, 'catalogs' | 'stored' | 'activated' | 'waiting'>> {
  const { store } = env
  const next: InstalledState = { ...state, published: { ...state.published } }
  for (const cat of publish) next.published[cat.name] = installedOf(cat, state.published[cat.name])

  const set = await activationSet(env, fileCats)
  for (const s of segs) await st(() => store.put(s.id, s.bytes))
  for (const cat of fileCats) await st(() => store.put(cat.id, cat.bytes))

  const stored = new Set(await st(() => store.ids()))
  const everything = set.flatMap((cat) => cat.catalog.segments.map((e) => ({ id: hex(e.id), class: e.class, size: e.size })))
  const have = await verifiedHave(store, [{ key: '', catalog: '', unit: '', segments: everything, complete: false }], stored)
  // Only the units the file brought a segment of (or lost one in a cut), the units already installed, and what those need are
  // activated: a unit whose segments merely sit in the store (an optional `aligned:*`, a half-fetched one) is not asked for.
  const arrived = new Set([...segs.map((s) => s.id), ...cut])
  const only = new Set<string>(onlyKeys ?? [])
  const visit = (key: string): void => {
    if (only.has(key)) return
    only.add(key)
    const slash = key.indexOf('/')
    const cat = set.find((c) => c.name === key.slice(0, slash))
    const unit = cat?.catalog.units.find((u) => u.id === key.slice(slash + 1))
    for (const n of unit?.needs ?? []) visit(qualify(set, cat!.name, n))
  }
  if (onlyKeys === undefined) {
    for (const cat of set) {
      for (const unit of cat.catalog.units) {
        const key = `${cat.name}/${unit.id}`
        if (state.units[key] !== undefined || unit.segments.some((i) => arrived.has(hex(cat.catalog.segments[i]!.id)))) visit(key)
      }
    }
  }
  const r = activate(next, set, have, { strict: true, only, localCatalogs: await localCatalogIds(store, state) })

  const catalogs = fileCats.map((c) => {
    const p = r.state.published[c.name] ?? next.published[c.name]
    return p?.id === c.id ? p : installedOf(c)
  })
  // A unit is reported waiting when the file brought some of it (or lost some in a cut) or it is already installed; the rest of the catalog is not asked for.
  const waiting = r.waiting.filter((w) => {
    if (state.units[w.key] !== undefined) return true
    const slash = w.key.indexOf('/')
    const cat = set.find((c) => c.name === w.key.slice(0, slash))
    const unit = cat?.catalog.units.find((u) => u.id === w.key.slice(slash + 1))
    return unit !== undefined && unit.segments.some((i) => arrived.has(hex(cat!.catalog.segments[i]!.id)))
  })
  await st(() => store.setState(r.state))
  return { catalogs, stored: segs.map((s) => s.id), activated: r.activated, waiting }
}

export async function importTransfer(env: Env, bytes: Uint8Array, o: { confirmDowngrade?: boolean } = {}): Promise<ImportReport> {
  const state = await loadState(env.store)
  const { index, entries, missing } = await readTransfer(bytes, { known: KNOWN as KnownTables })

  // Everything below up to `commit` only reads: nothing is written if a catalog, a revision or the base is refused.
  const fileCats: VerifiedCatalog[] = []
  for (const id of index.catalogs) {
    const e = entries.find((x) => x.id === id)
    if (e === undefined || e.status !== 'ok' || e.bytes === undefined) throw new FormatError('E_TRUNCATED', `the catalog ${id} is not whole in the file`)
    fileCats.push(await verifyCatalogFile(e.bytes, env.trust, { from: 'transfer', expectedId: id }))
  }
  // One file does not carry two catalogs of one name: they would share the completeness of their units.
  for (const cat of fileCats) {
    if (fileCats.some((o2) => o2 !== cat && o2.name === cat.name && o2.publisher === cat.publisher && o2.id !== cat.id)) {
      throw new ClientError('E_DOWNGRADE', `the file carries two different catalogs ${cat.name}`)
    }
  }
  if (index.mode === 'update' && (index.base ?? []).length === 0) throw new ClientError('E_NO_BASE', 'an update file names no base')
  // A catalog another catalog of the file requires by id (the common catalog of a full export) is used by id for that language's
  // units; when it is older than the installed one of its name, or of another publisher, it is stored but not published, so it does
  // not trip the downgrade check. Any other catalog is the file's offer of the published one of its name.
  const requiredIds = new Set(fileCats.flatMap((c) => (c.catalog.requires ?? []).map((r) => hex(r[2]))))
  const publish: VerifiedCatalog[] = []
  for (const cat of fileCats) {
    try {
      checkRevision(state.published[cat.name], cat, o.confirmDowngrade === true)
      publish.push(cat)
    } catch (e) {
      if (!(requiredIds.has(cat.id) && e instanceof ClientError && e.code === 'E_DOWNGRADE')) throw e
    }
  }
  for (const [name, revision] of index.base ?? []) {
    const have = state.active[name]?.revision === revision || state.published[name]?.revision === revision
    if (!have) throw new ClientError('E_NO_BASE', `the update file needs the revision ${revision} of the catalog ${name}`)
  }

  const items: { id: string; class: string; bytes: Uint8Array }[] = []
  const rejected: ImportReport['rejected'] = []
  for (const e of entries) {
    if (e.kind === 'complement' || index.catalogs.includes(e.id)) continue
    if (e.status === 'missing') continue
    if (e.status !== 'ok' || e.bytes === undefined || e.class === undefined) rejected.push({ id: e.id, code: e.status })
    else items.push({ id: e.id, class: e.class, bytes: e.bytes })
  }
  const checked = await checkSegments(items)
  rejected.push(...checked.rejected)

  const done = await commit(env, state, fileCats, checked.ok, missing, publish)
  return { ...done, rejected, missing }
}

export async function importOldPack(
  env: Env,
  zip: Uint8Array,
  o: { originals?: RowSource; device?: string; now?: string; confirmDowngrade?: boolean } = {},
): Promise<ImportReport> {
  const state = await loadState(env.store)
  const none: RowSource = { async resources() { return [] }, async *rows() {} }
  let built: Awaited<ReturnType<typeof bridgeZip>>
  try {
    built = await bridgeZip(zip, o.originals ?? none, o.device ?? 'this-device', o.now ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z'))
  } catch (e) {
    throw new ClientError('E_ARG', `not a language pack of format 1: ${e instanceof Error ? e.message : String(e)}`)
  }
  const cat = await verifyCatalogFile(built.catalog.bytes, env.trust, { from: 'bridge', expectedId: built.catalog.id })
  const checked = await checkSegments(built.segments.map((s) => ({ id: s.id, class: s.seg.h.class, bytes: s.bytes })))

  const current = state.published[cat.name]
  if (current !== undefined && current.origin !== 'local') {
    // A published catalog is already here: what the device installed from it wins, and stays. The pack bridges only the units the
    // device does not have from a published catalog (a book never installed, with its orig and what it needs) into the local
    // catalog, which does not become the published one of the name. With nothing of that kind, the segments are kept (the
    // published catalog names the same ids when the book is the same) and the pack is skipped.
    const localIds = await localCatalogIds(env.store, state)
    const only = bridgeOnly(cat, state, localIds)
    if (only.size === 0) {
      for (const s of checked.ok) await st(() => env.store.put(s.id, s.bytes))
      return { catalogs: [], stored: checked.ok.map((s) => s.id), rejected: checked.rejected, skipped: true, missing: [], activated: [], waiting: [] }
    }
    // Units bridged on another device (a local catalog of another publisher, active or behind installed units) are not replaced
    // by this device's pack unless confirmed, as when no published catalog is here.
    const bridged = new Set(Object.values(state.units).filter((u) => u.catalog === cat.name && (u.local === true || localIds.has(u.catalogId))).map((u) => u.catalogId))
    const active = state.active[cat.name]
    if (active?.origin === 'local') bridged.add(active.id)
    for (const id of bridged) {
      const known = active?.id === id ? active : await storedLocal(env.store, id)
      if (known !== undefined && known.publisher !== cat.publisher) checkRevision(known, cat, o.confirmDowngrade === true)
    }
    const done = await commit(env, state, [cat], checked.ok, [], [], only)
    return { ...done, rejected: checked.rejected, missing: [] }
  }
  // A local catalog of another device (another publisher) is treated like a lower revision. Two packs of this device are not
  // compared: every bridged catalog is revision 1 with the time it was made in it.
  if (current !== undefined && current.publisher !== cat.publisher) checkRevision(current, cat, o.confirmDowngrade === true)
  const done = await commit(env, state, [cat], checked.ok)
  return { ...done, rejected: checked.rejected, missing: [] }
}

/** A stored local catalog as an installed-catalog entry (read without trust: a local catalog has no signature); `undefined` when gone. */
async function storedLocal(store: BlobStore, id: string): Promise<InstalledCatalog | undefined> {
  const bytes = await st(() => store.get(id))
  if (bytes === undefined) return undefined
  try {
    return installedOf(await verifyCatalogFile(bytes, {}, { from: 'store', expectedId: id }))
  } catch (e) {
    if (e instanceof FormatError) return undefined
    throw e
  }
}

/**
 * The units of a bridged catalog to activate next to a published catalog of its name: each unit the device has not installed
 * from a published catalog (`<name>/<unit>` absent, or bridged with other segments), and what it needs, except what the device
 * has already: installed from a published catalog (that serves the need), or bridged with the same segments. Empty when the pack
 * brings nothing new (the same pack again, say).
 */
export function bridgeOnly(cat: VerifiedCatalog, state: InstalledState, localIds: ReadonlySet<string>): Set<string> {
  const fromPublished = (key: string): boolean => {
    const u = state.units[key]
    return u !== undefined && u.local !== true && !localIds.has(u.catalogId)
  }
  const keys = cat.catalog.units.map((u) => `${cat.name}/${u.id}`)
  const bridgedSame = (key: string): boolean => {
    const u = state.units[key]
    const unit = cat.catalog.units.find((x) => `${cat.name}/${x.id}` === key)
    if (u === undefined || unit === undefined || fromPublished(key)) return false
    const ids = unit.segments.map((i) => hex(cat.catalog.segments[i]!.id))
    return ids.length === u.segments.length && ids.every((id, n) => id === u.segments[n])
  }
  const has = (key: string): boolean => fromPublished(key) || bridgedSame(key)
  const only = new Set<string>()
  const visit = (key: string): void => {
    if (only.has(key) || has(key) || !keys.includes(key)) return
    only.add(key)
    const unit = cat.catalog.units.find((u) => `${cat.name}/${u.id}` === key)!
    for (const n of unit.needs ?? []) visit(qualify([cat], cat.name, n))
  }
  // Seeds: the units that are not installed at all, or are installed from a bridged catalog. A unit only a published unit's need
  // would reach (the bridged orig of a book installed from the published catalog) is not one: it is reached from its book or not at all.
  for (const key of keys) {
    const id = key.slice(cat.name.length + 1)
    if (has(key) || id.startsWith('orig:')) continue
    visit(key)
  }
  return only
}

export async function exportTransfer(
  env: Env,
  o: { lang: string; mode: 'full' | 'update'; books?: string[]; units?: string[]; base?: Uint8Array[] },
): Promise<Uint8Array> {
  const { store } = env
  if (o.mode !== 'full' && o.mode !== 'update') throw new ClientError('E_ARG', `the mode ${JSON.stringify(o.mode)} is not "full" or "update"`)
  if (o.mode === 'update' && (o.base === undefined || o.base.length === 0)) throw new ClientError('E_ARG', 'an update export needs the receiver\'s catalog files as base')
  if (o.mode === 'full' && o.base !== undefined) throw new ClientError('E_ARG', 'base is only for an update export')

  const state = await loadState(store)
  const name = state.aliases?.[o.lang] ?? o.lang
  const active = state.active[name]
  if (active === undefined) throw new ClientError('E_NOT_INSTALLED', `${o.lang} has no active units`)
  const lang = await readStored(store, env.trust, active)
  if (lang === undefined) throw new ClientError('E_STORE', `the active catalog of ${name} is not in the store`)
  const cats = [lang]
  for (const [rname, revision, rid] of lang.catalog.requires ?? []) {
    const c = await readStored(store, env.trust, { name: rname, publisher: lang.publisher, revision, id: hex(rid), origin: 'published' })
    if (c !== undefined && c.name === rname) cats.push(c)
    else if (o.mode === 'full') throw new ClientError('E_NOT_INSTALLED', `a full export needs the ${rname} catalog ${hex(rid)} that ${name} requires, and it is not stored`)
  }

  // A unit goes in when it is active with exactly the segments one of these catalogs lists for it. The revision it was activated
  // from does not matter (a later common revision may keep the segments); a unit still on other segments is not described by them.
  // From a published catalog, a unit bridged from an old pack does not go (its orig and what it needs are in the local catalog,
  // which a published export does not carry): naming it is E_NOT_INSTALLED.
  const localIds = lang.origin === 'published' ? await localCatalogIds(store, state) : new Set<string>()
  const activeKeys = Object.entries(state.units)
    .filter(([, u]) => !(lang.origin === 'published' && (u.local === true || localIds.has(u.catalogId))))
    .filter(([key, u]) => {
      const cat = cats.find((c) => c.name === u.catalog)
      const unit = cat?.catalog.units.find((x) => `${cat.name}/${x.id}` === key)
      return cat !== undefined && unit !== undefined && unit.segments.length === u.segments.length && unit.segments.every((i, n) => hex(cat.catalog.segments[i]!.id) === u.segments[n])
    })
    .map(([k]) => k)
  let chosen: string[]
  if (o.books === undefined && o.units === undefined) {
    chosen = activeKeys
  } else {
    const seeds: string[] = []
    for (const d of ['xmap', 'map', 'xtopics', 'topics']) seeds.push(...activeKeys.filter((k) => k.slice(k.indexOf('/') + 1) === d))
    const named = [...(o.books ?? []).map((b) => `book:${b}`), ...(o.units ?? [])]
    for (const n of named) {
      const keys = n.includes('/') ? activeKeys.filter((k) => k === n) : activeKeys.filter((k) => k.slice(k.indexOf('/') + 1) === n)
      if (keys.length === 0) throw new ClientError('E_NOT_INSTALLED', `the unit ${n} is not active`)
      seeds.push(...keys)
    }
    const seen = new Set<string>()
    const walk = (key: string): void => {
      if (seen.has(key) || !activeKeys.includes(key)) return
      seen.add(key)
      for (const n of state.units[key]!.needs) walk(n)
    }
    seeds.forEach(walk)
    chosen = [...seen]
  }

  const baseIds = new Set<string>()
  const base: [string, number][] = []
  for (const b of o.base ?? []) {
    const c = await verifyCatalogFile(b, env.trust, { from: 'transfer' })
    base.push([c.name, c.revision])
    for (const e of c.catalog.segments) baseIds.add(hex(e.id))
  }

  const classOf = new Map<string, string>()
  for (const c of cats) for (const e of c.catalog.segments) classOf.set(hex(e.id), e.class)
  const wanted = new Set<string>()
  for (const key of chosen) for (const id of state.units[key]!.segments) if (!(o.mode === 'update' && baseIds.has(id))) wanted.add(id)

  const entries: BuiltSegment[] = []
  for (const id of [...wanted].sort()) {
    const cls = classOf.get(id)
    const known = cls === undefined ? undefined : tables[cls]
    const blob = await st(() => store.get(id))
    if (known === undefined || blob === undefined) throw new ClientError('E_STORE', `the active segment ${id} is not in the store`)
    try {
      const r = await readSegment(blob, { known, expectedId: id })
      entries.push({ seg: r.seg, bytes: blob, id: r.id, inputs: '' })
    } catch (e) {
      if (e instanceof FormatError) throw new ClientError('E_STORE', `the stored segment ${id} is damaged (${e.code})`)
      throw e
    }
  }
  const catalogs: BuiltSegment[] = []
  for (const c of cats) {
    const r = await readSegment(c.bytes, { known: CATALOG_TABLES, expectedClass: 'catalog', expectedId: c.id })
    catalogs.push({ seg: r.seg, bytes: c.bytes, id: r.id, inputs: '' })
  }
  return writeTransfer({
    mode: o.mode,
    catalogs,
    entries,
    ...(o.mode === 'update' ? { base } : {}),
    made: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    by: 'language-pack-client',
  })
}
