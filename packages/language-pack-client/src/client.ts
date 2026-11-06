/**
 * The client: refresh the catalogs, install by unit, status, prune and verify. Calls on one client run one after the other.
 */
import { FormatError, KNOWN, readSegment } from '@bt-synergy/language-pack-v3'
import { ClientError } from './errors'
import { catalogsOf, type InstallReport, type MissingCommon, type Progress, loadState, readStored, runSteps, st } from './install'
import { planInstall, updates, type Want } from './plan'
import type { PackSource } from './source/http'
import { hex, type InstalledCatalog, type InstalledState, installedOf } from './state'
import type { BlobStore } from './store/types'
import { checkRevision, type TrustPolicy, type VerifiedCatalog, verifyCatalogFile } from './verify'

export type { InstallReport, Progress } from './install'

export type RefreshReport = {
  catalogs: InstalledCatalog[]
  updates: ReturnType<typeof updates>
  unchanged: boolean
  missingCommon?: MissingCommon
}

export type Status = {
  lang: string
  published?: InstalledCatalog
  active?: InstalledCatalog
  units: { key: string; revision: number; installed: boolean; optional: boolean; bytes: number }[]
  updates: ReturnType<typeof updates>
  missingCommon?: RefreshReport['missingCommon']
}

export interface LanguagePackClient {
  refresh(lang: string, o?: { confirmDowngrade?: boolean; signal?: AbortSignal }): Promise<RefreshReport>
  install(lang: string, want?: Want, o?: { signal?: AbortSignal; onProgress?: (p: Progress) => void }): Promise<InstallReport>
  status(lang: string): Promise<Status>
  prune(): Promise<{ removed: string[] }>
  verify(): Promise<{ bad: string[] }>
}

export function createClient(o: { store: BlobStore; source?: PackSource; trust: TrustPolicy }): LanguagePackClient {
  const { store, trust } = o
  const need = (): PackSource => {
    if (o.source === undefined) throw new ClientError('E_ARG', 'this client has no source')
    return o.source
  }

  // One promise chain: a call starts when the one before has settled, and a failed call does not stop the next.
  let tail: Promise<unknown> = Promise.resolve()
  const queued = <T>(call: () => Promise<T>): Promise<T> => {
    const run = tail.then(call)
    tail = run.then(
      () => {},
      () => {},
    )
    return run
  }

  /** Steps 1 and 2 of "Order a client follows". Nothing is written until every catalog has been verified. */
  async function refreshNow(lang: string, opts: { confirmDowngrade?: boolean; signal?: AbortSignal }): Promise<RefreshReport & { name: string }> {
    const source = need()
    const state = await loadState(store)
    const signal = opts.signal
    const confirm = opts.confirmDowngrade === true
    const known = state.published[lang]
    const sendEtag = known?.etag !== undefined && (await st(() => store.has(known.id)))
    const answer = await source.catalog(lang, { ...(sendEtag ? { etag: known!.etag } : {}), ...(signal ? { signal } : {}) })

    const next: InstalledState = { ...state, published: { ...state.published } }
    const toPut: { id: string; bytes: Uint8Array }[] = []
    let langCat: VerifiedCatalog | undefined
    let unchanged = true
    if (answer === 'not-modified') {
      langCat = await readStored(store, trust, known)
      if (langCat === undefined) throw new ClientError('E_STORE', 'the stored catalog is gone though the server says it did not change')
    } else {
      langCat = await verifyCatalogFile(answer.bytes, trust, { from: 'network' })
      // A fork or an unconfirmed lower revision throws here. A confirmed lower revision passes, so 'newer' alone proves nothing.
      checkRevision(state.published[langCat.name], langCat, confirm)
      next.published[langCat.name] = {
        ...installedOf(langCat, state.published[langCat.name]),
        ...(answer.etag !== undefined ? { etag: answer.etag } : {}),
      }
      toPut.push({ id: langCat.id, bytes: answer.bytes })
      unchanged = state.published[langCat.name]?.id === langCat.id && state.published[langCat.name]?.etag === answer.etag
    }

    let missingCommon: MissingCommon | undefined
    for (const [rname, revision, rid] of langCat.catalog.requires ?? []) {
      const id = hex(rid)
      const have = next.published[rname]
      if (have?.id === id && (await st(() => store.has(id)))) continue
      const wanted: MissingCommon = { name: rname, revision, id }
      let got: Awaited<ReturnType<PackSource['catalog']>>
      try {
        const etag = have?.etag !== undefined && (await st(() => store.has(have.id))) ? have.etag : undefined
        got = await source.catalog(rname, { ...(etag !== undefined ? { etag } : {}), ...(signal ? { signal } : {}) })
      } catch (e) {
        if (e instanceof ClientError && e.code === 'E_NO_PACK') {
          missingCommon ??= wanted
          continue
        }
        throw e
      }
      // 304: the server still has the catalog we already hold, and it is not the one this language names.
      const cv = got === 'not-modified' ? undefined : await verifyCatalogFile(got.bytes, trust, { from: 'network' })
      if (got === 'not-modified' || cv === undefined || cv.id !== id) {
        // E_COMMON: the server's common catalog is ahead or behind. The units that need it wait.
        missingCommon ??= wanted
        continue
      }
      checkRevision(have, cv, confirm)
      next.published[rname] = { ...installedOf(cv, have), ...(got.etag !== undefined ? { etag: got.etag } : {}) }
      toPut.push({ id: cv.id, bytes: got.bytes })
      unchanged = false
    }

    for (const p of toPut) await st(() => store.put(p.id, p.bytes))
    if (toPut.length > 0) await st(() => store.setState(next))

    const found = await catalogsOf(store, trust, next, langCat.name)
    return {
      name: langCat.name,
      catalogs: found.catalogs.map((c) => next.published[c.name]!),
      updates: updates(next, found.catalogs),
      unchanged,
      ...(missingCommon !== undefined ? { missingCommon } : {}),
    }
  }

  async function installNow(lang: string, want: Want, opts: { signal?: AbortSignal; onProgress?: (p: Progress) => void }): Promise<InstallReport> {
    let name = lang
    if ((await loadState(store)).published[lang] === undefined) name = (await refreshNow(lang, opts.signal ? { signal: opts.signal } : {})).name
    const state = await loadState(store)
    const { catalogs } = await catalogsOf(store, trust, state, name)
    if (catalogs.length === 0) throw new ClientError('E_STORE', `the catalog of ${name} is not in the store`)
    const have = new Set(await st(() => store.ids()))
    const plan = planInstall(catalogs, state, want, have)
    return runSteps({ store, source: need() }, catalogs, state, plan.steps, plan.unknown, opts)
  }

  async function statusNow(lang: string): Promise<Status> {
    const state = await loadState(store)
    const { lang: langCat, catalogs, missing } = await catalogsOf(store, trust, state, lang)
    const units: Status['units'] = []
    for (const cat of catalogs) {
      for (const unit of cat.catalog.units) {
        const key = `${cat.name}/${unit.id}`
        const installed = state.units[key]
        units.push({
          key,
          revision: installed?.revision ?? cat.revision,
          installed: installed !== undefined,
          optional: unit.optional === true,
          bytes: unit.segments.reduce((n, i) => n + (cat.catalog.segments[i]?.size ?? 0), 0),
        })
      }
    }
    const published = state.published[lang]
    const active = state.active[lang]
    return {
      lang,
      ...(published !== undefined ? { published } : {}),
      ...(active !== undefined ? { active } : {}),
      units,
      updates: langCat === undefined ? [] : updates(state, catalogs),
      ...(missing !== undefined ? { missingCommon: missing } : {}),
    }
  }

  async function pruneNow(): Promise<{ removed: string[] }> {
    const state = await loadState(store)
    const used = new Set<string>()
    for (const u of Object.values(state.units)) for (const s of u.segments) used.add(s)
    // The stored catalogs of `active` and `published`, and the segments they name (some may be half-fetched, for a retry).
    for (const entry of [...Object.values(state.active), ...Object.values(state.published)]) {
      used.add(entry.id)
      const cat = await readStored(store, trust, entry)
      if (cat !== undefined) for (const s of cat.catalog.segments) used.add(hex(s.id))
    }
    const removed: string[] = []
    for (const id of await st(() => store.ids())) {
      if (used.has(id)) continue
      await st(() => store.delete(id))
      removed.push(id)
    }
    return { removed }
  }

  async function verifyNow(): Promise<{ bad: string[] }> {
    const state = await loadState(store)
    const classOf = new Map<string, string>()
    for (const entry of [...Object.values(state.active), ...Object.values(state.published)]) {
      classOf.set(entry.id, 'catalog')
      const cat = await readStored(store, trust, entry)
      if (cat !== undefined) for (const s of cat.catalog.segments) classOf.set(hex(s.id), s.class)
    }
    const tables = KNOWN as Record<string, Record<string, number[]> | undefined>
    const bad: string[] = []
    for (const id of await st(() => store.ids())) {
      const bytes = await st(() => store.get(id))
      let ok = false
      if (bytes !== undefined) {
        const cls = classOf.get(id)
        // A segment no stored catalog names: it is good if it reads as any known class.
        for (const known of cls !== undefined ? [tables[cls]] : Object.values(tables)) {
          if (known === undefined) continue
          try {
            await readSegment(bytes, { known, expectedId: id })
            ok = true
            break
          } catch (e) {
            if (!(e instanceof FormatError)) throw e
          }
        }
      }
      if (!ok) bad.push(id)
    }
    return { bad }
  }

  return {
    refresh: (lang, opts = {}) =>
      queued(async () => {
        const { name: _name, ...report } = await refreshNow(lang, opts)
        return report
      }),
    install: (lang, want = {}, opts = {}) => queued(() => installNow(lang, want, opts)),
    status: (lang) => queued(() => statusNow(lang)),
    prune: () => queued(pruneNow),
    verify: () => queued(verifyNow),
  }
}
