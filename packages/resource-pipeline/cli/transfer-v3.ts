/**
 * Export and import format 3 transfer files (`.tcpack`, spec/transfer.md), without a network.
 *
 *   bun packages/resource-pipeline/cli/transfer-v3.ts export --from <folder> --mode full|update [--base <catalog file>…] [--common <folder>] --out <file.tcpack>
 *   bun packages/resource-pipeline/cli/transfer-v3.ts import --file <file.tcpack> --into <folder>
 *
 * The folder has the shape `build-v3` writes: `catalog-*.seg` and `segments/<id>.seg`.
 *  - `export full`: every catalog of the folder and every segment they name. `export update`: the catalogs and only the segments the
 *    `--base` catalogs (earlier revisions) do not name; `base` of the index is `[about.catalog, about.revision]` of each of them.
 *  - `export full` holds the common catalog and its segments too (spec/transfer.md): a language folder that has no `catalog-common.seg`
 *    (every language but the map language) needs `--common <folder>`, the `v3-out` or published copy of the common part; without it the
 *    export is refused (exit 2), and a `--common` whose catalog is not the one `requires` names is exit 1.
 *  - `import` of an `update` file checks that `--into` holds the `base` revisions of the file (else exit 1, nothing written). Segments are
 *    written first, a catalog last, and only when every segment it names is there. A catalog that would replace an older one with
 *    holes is not written: the old one stays and the exit is 1. With no older catalog, an incomplete one is written (exit 0, `complete: false`).
 *  - `import`: `readTransfer`; every whole, verified segment goes to `segments/<id>.seg`, the catalogs to `catalog-<name>.seg`. A cut
 *    file imports its whole entries and lists the missing ones. A catalog that is cut (or any defect of the file) is exit 1 and nothing
 *    is written. A segment already there with other bytes is an error (ids are hashes) and nothing is written; a catalog is replaced.
 *    Entries whose status is not ok, and complements (no place for them in the folder shape), are not written and are listed.
 *
 * Stdout: one JSON line. Exit 0 ok, 1 failure, 2 usage.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { catalogView, hex, KNOWN, readSegment, readTransfer, writeTransfer, type BuiltSegment, type KnownTables } from '@bt-synergy/language-pack-v3'

class UsageError extends Error {}

export const USAGE =
  'Usage: transfer-v3 export --from <folder> --mode full|update [--base <catalog file>…] [--common <folder>] --out <file.tcpack>\n' +
  '       transfer-v3 import --file <file.tcpack> --into <folder>'

type Io = { log: (line: string) => void; error: (line: string) => void; out?: (line: string) => void }

const read = (path: string): Uint8Array => new Uint8Array(readFileSync(path))
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i])

function flagsOf(argv: string[], allowed: string[], repeatable: string[] = []): Map<string, string[]> {
  const flags = new Map<string, string[]>()
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i]
    const key = name.slice(2)
    if (!name.startsWith('--') || !allowed.includes(key)) throw new UsageError(`Unknown argument ${JSON.stringify(name)}`)
    if (flags.has(key) && !repeatable.includes(key)) throw new UsageError(`${name} is given twice`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new UsageError(`The value of ${name} is missing`)
    flags.set(key, [...(flags.get(key) ?? []), value])
    i += 1
  }
  return flags
}

const inside = (parent: string, child: string): boolean => {
  const r = relative(resolve(parent), resolve(child))
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

async function asBuilt(bytes: Uint8Array, className: string, id?: string): Promise<BuiltSegment & { model?: ReturnType<typeof catalogView> }> {
  const known = (KNOWN as Record<string, number[]>)[className] ?? {}
  const r = await readSegment(bytes, { known, expectedId: id })
  return { seg: r.seg, bytes, id: r.id, inputs: '' }
}

async function exportFile(argv: string[], io: Io): Promise<number> {
  const flags = flagsOf(argv, ['from', 'mode', 'base', 'out', 'common'], ['base'])
  for (const key of ['from', 'mode', 'out']) if (!flags.has(key)) throw new UsageError(`--${key} is required`)
  const from = flags.get('from')![0]
  const out = flags.get('out')![0]
  const mode = flags.get('mode')![0]
  const bases = flags.get('base') ?? []
  if (mode !== 'full' && mode !== 'update') throw new UsageError('--mode is "full" or "update"')
  if (mode === 'full' && bases.length > 0) throw new UsageError('--base is only for --mode update')
  const commonDir = flags.get('common')?.[0]
  if (commonDir !== undefined && mode !== 'full') throw new UsageError('--common is only for --mode full')
  if (commonDir !== undefined && (!existsSync(commonDir) || !statSync(commonDir).isDirectory())) throw new UsageError(`--common ${commonDir} is not a folder`)
  if (mode === 'update' && bases.length === 0) throw new UsageError('--mode update needs at least one --base')
  if (!existsSync(from) || !statSync(from).isDirectory()) throw new UsageError(`--from ${from} is not a folder`)
  if (inside(from, out)) throw new UsageError('--out must not be inside --from')
  for (const b of bases) if (!existsSync(b) || !statSync(b).isFile()) throw new UsageError(`--base ${b} is not a file`)

  const catalogFiles = readdirSync(from).filter((f) => /^catalog-[^/\\]+\.seg$/.test(f)).sort()
  if (catalogFiles.length === 0) throw new Error(`${from} has no catalog-*.seg`)
  const catalogs: BuiltSegment[] = []
  const wanted = new Map<string, { class: string; dir: string }>()
  const addCatalog = async (file: string, dir: string): Promise<void> => {
    const c = await asBuilt(read(file), 'catalog')
    if (c.seg.h.class !== 'catalog') throw new Error(`${file} is not a catalog`)
    catalogs.push(c)
    for (const e of catalogView(c.seg).segments) wanted.set(hex(e.id), { class: e.class, dir })
  }
  for (const f of catalogFiles) await addCatalog(join(from, f), from)
  if (mode === 'full') {
    // `full` is what an empty device needs: every catalog a catalog `requires` has to be in the file, with the id it names.
    const nameOf = (c: BuiltSegment): string => catalogView(c.seg).about.catalog
    for (const c of [...catalogs]) {
      for (const [name, , id] of catalogView(c.seg).requires ?? []) {
        if (catalogs.some((k) => nameOf(k) === name && k.id === hex(id))) continue
        if (commonDir === undefined) {
          throw new UsageError(`a full export needs the ${name} catalog ${hex(id)} that ${nameOf(c)} requires, and ${from} does not have it: add --common <folder> with the ${name} catalog and its segments`)
        }
        const file = join(commonDir, `catalog-${name}.seg`)
        if (!existsSync(file)) throw new Error(`--common: ${file} is not there`)
        await addCatalog(file, commonDir)
        if (!catalogs.some((k) => nameOf(k) === name && k.id === hex(id))) {
          throw new Error(`--common: the ${name} catalog in ${commonDir} is not the one ${nameOf(c)} requires (${hex(id)})`)
        }
      }
    }
  }
  const have = new Set<string>()
  const base: [string, number][] = []
  for (const b of bases) {
    const { seg } = await readSegment(read(b), { known: KNOWN.catalog, expectedClass: 'catalog' })
    const model = catalogView(seg)
    base.push([model.about.catalog, model.about.revision])
    for (const e of model.segments) have.add(hex(e.id))
  }
  const entries: BuiltSegment[] = []
  for (const [id, { class: className, dir }] of [...wanted].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (mode === 'update' && have.has(id)) continue
    const path = join(dir, 'segments', `${id}.seg`)
    if (!existsSync(path)) throw new Error(`the catalogs name the segment ${id} and ${path} is not there`)
    entries.push(await asBuilt(read(path), className, id))
  }
  const bytes = writeTransfer({
    mode,
    catalogs,
    entries,
    ...(mode === 'update' ? { base } : {}),
    made: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    by: 'transfer-v3 (bt-synergy)',
  })
  mkdirSync(dirname(resolve(out)), { recursive: true })
  writeFileSync(out, bytes)
  io.out?.(JSON.stringify({ ok: true, mode, catalogs: catalogs.length, segments: entries.length, bytes: bytes.length, ...(mode === 'update' ? { base } : {}) }))
  return 0
}

async function importFile(argv: string[], io: Io): Promise<number> {
  const flags = flagsOf(argv, ['file', 'into'])
  for (const key of ['file', 'into']) if (!flags.has(key)) throw new UsageError(`--${key} is required`)
  const file = flags.get('file')![0]
  const into = flags.get('into')![0]
  if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`--file ${file} is not a file`)
  if (existsSync(into) && !statSync(into).isDirectory()) throw new UsageError(`--into ${into} is not a folder`)

  const { index, entries, missing } = await readTransfer(read(file), { known: KNOWN as KnownTables })
  // An update file is for a receiver that has its base revisions (transfer.md): without them nothing is written.
  for (const [name, revision] of index.base ?? []) {
    const file = join(into, `catalog-${name}.seg`)
    let have: number | undefined
    if (/^[A-Za-z0-9._-]+$/.test(name) && existsSync(file)) {
      const { seg } = await readSegment(read(file), { known: KNOWN.catalog, expectedClass: 'catalog' })
      have = catalogView(seg).about.revision
    }
    if (have !== revision) throw new Error(`the update file needs the base revision ${revision} of the catalog ${name} in ${into}, which ${have === undefined ? 'has no such catalog' : `has the revision ${have}`}`)
  }
  const writes: { path: string; bytes: Uint8Array; catalog?: { name: string; ids: string[] } }[] = []
  const catalogs: string[] = []
  const rejected: { id: string; status: string }[] = []
  const complements: string[] = []
  let unchanged = 0
  let segments = 0
  for (const e of entries) {
    if (e.kind === 'complement') {
      complements.push(e.id)
      continue
    }
    if (e.status !== 'ok') {
      if (e.status !== 'missing') rejected.push({ id: e.id, status: e.status })
      continue
    }
    const bytes = e.bytes!
    if (index.catalogs.includes(e.id)) {
      const { seg } = await readSegment(bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })
      const name = catalogView(seg).about.catalog
      if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.')) throw new Error(`the catalog name ${JSON.stringify(name)} is not a safe file name`)
      writes.push({ path: join(into, `catalog-${name}.seg`), bytes, catalog: { name, ids: catalogView(seg).segments.map((s) => hex(s.id)) } })
      continue
    }
    const path = join(into, 'segments', `${e.id}.seg`)
    if (existsSync(path)) {
      if (!same(read(path), bytes)) throw new Error(`${path} exists with other bytes than the segment ${e.id}`)
      unchanged++
      continue
    }
    segments++
    writes.push({ path, bytes })
  }
  mkdirSync(join(into, 'segments'), { recursive: true })
  const put = (w: { path: string; bytes: Uint8Array }): void => {
    const temp = `${w.path}.part`
    writeFileSync(temp, w.bytes)
    renameSync(temp, w.path)
  }
  // Segments first; a catalog last, and only when every segment it names is there, so that a cut never leaves a catalog with holes
  // in place of a good one. With no older catalog of that name there is nothing to lose: it is written and the result says `complete: false`.
  for (const w of writes) if (w.catalog === undefined) put(w)
  const kept: string[] = []
  let holes = false
  for (const w of writes) {
    if (w.catalog === undefined) continue
    const incomplete = w.catalog.ids.some((id) => !existsSync(join(into, 'segments', `${id}.seg`)))
    if (incomplete && existsSync(w.path)) {
      kept.push(w.catalog.name)
      continue
    }
    put(w)
    catalogs.push(w.catalog.name)
    if (incomplete) holes = true
  }
  const complete = missing.length === 0 && rejected.length === 0 && kept.length === 0 && !holes
  io.out?.(JSON.stringify({ ok: kept.length === 0, complete, mode: index.mode, catalogs, segments, unchanged, missing, rejected, complements, ...(kept.length > 0 ? { kept } : {}), ...(index.base ? { base: index.base } : {}) }))
  if (kept.length > 0) {
    io.error(`transfer-v3: the segments of the catalog ${kept.join(', ')} are not all there: the older catalog stays`)
    return 1
  }
  return 0
}

export async function main(argv: string[], io: Io = { log: console.log, error: console.error, out: console.log }): Promise<number> {
  try {
    const [command, ...rest] = argv
    if (command === 'export') return await exportFile(rest, io)
    if (command === 'import') return await importFile(rest, io)
    throw new UsageError(command === undefined ? 'A command is required' : `Unknown command ${JSON.stringify(command)}`)
  } catch (error) {
    if (error instanceof UsageError) {
      io.error(error.message)
      io.error(USAGE)
      return 2
    }
    const code = (error as { code?: string }).code
    io.error(`transfer-v3: ${code ? `${code} ` : ''}${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

// `main` is Bun's; this package's type check has no Bun types.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  process.exitCode = await main(process.argv.slice(2))
}
