/**
 * Export and import format 3 transfer files (`.tcpack`, spec/transfer.md), without a network.
 *
 *   bun packages/resource-pipeline/cli/transfer-v3.ts export --from <folder> --mode full|update [--base <catalog file>…] --out <file.tcpack>
 *   bun packages/resource-pipeline/cli/transfer-v3.ts import --file <file.tcpack> --into <folder>
 *
 * The folder has the shape `build-v3` writes: `catalog-*.seg` and `segments/<id>.seg`.
 *  - `export full`: every catalog of the folder and every segment they name. `export update`: the catalogs and only the segments the
 *    `--base` catalogs (earlier revisions) do not name; `base` of the index is `[about.catalog, about.revision]` of each of them.
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
  'Usage: transfer-v3 export --from <folder> --mode full|update [--base <catalog file>…] --out <file.tcpack>\n' +
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
  const flags = flagsOf(argv, ['from', 'mode', 'base', 'out'], ['base'])
  for (const key of ['from', 'mode', 'out']) if (!flags.has(key)) throw new UsageError(`--${key} is required`)
  const from = flags.get('from')![0]
  const out = flags.get('out')![0]
  const mode = flags.get('mode')![0]
  const bases = flags.get('base') ?? []
  if (mode !== 'full' && mode !== 'update') throw new UsageError('--mode is "full" or "update"')
  if (mode === 'full' && bases.length > 0) throw new UsageError('--base is only for --mode update')
  if (mode === 'update' && bases.length === 0) throw new UsageError('--mode update needs at least one --base')
  if (!existsSync(from) || !statSync(from).isDirectory()) throw new UsageError(`--from ${from} is not a folder`)
  if (inside(from, out)) throw new UsageError('--out must not be inside --from')
  for (const b of bases) if (!existsSync(b) || !statSync(b).isFile()) throw new UsageError(`--base ${b} is not a file`)

  const catalogFiles = readdirSync(from).filter((f) => /^catalog-[^/\\]+\.seg$/.test(f)).sort()
  if (catalogFiles.length === 0) throw new Error(`${from} has no catalog-*.seg`)
  const catalogs: BuiltSegment[] = []
  const wanted = new Map<string, string>()
  for (const f of catalogFiles) {
    const c = await asBuilt(read(join(from, f)), 'catalog')
    if (c.seg.h.class !== 'catalog') throw new Error(`${f} is not a catalog`)
    catalogs.push(c)
    for (const e of catalogView(c.seg).segments) wanted.set(hex(e.id), e.class)
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
  for (const [id, className] of [...wanted].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (mode === 'update' && have.has(id)) continue
    const path = join(from, 'segments', `${id}.seg`)
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
  const writes: { path: string; bytes: Uint8Array }[] = []
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
      catalogs.push(name)
      writes.push({ path: join(into, `catalog-${name}.seg`), bytes })
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
  for (const w of writes) {
    const temp = `${w.path}.part`
    writeFileSync(temp, w.bytes)
    renameSync(temp, w.path)
  }
  const complete = missing.length === 0 && rejected.length === 0
  io.out?.(JSON.stringify({ ok: true, complete, mode: index.mode, catalogs, segments, unchanged, missing, rejected, complements, ...(index.base ? { base: index.base } : {}) }))
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
