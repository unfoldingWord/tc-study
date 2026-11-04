import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonicalJson, readerOutput } from '@bt-synergy/language-pack-v3'
import { main as build } from './build-v3'
import { main } from './transfer-v3'

const DATA = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests', 'data')
const LIST = join(DATA, 'es-419', 'list.json')
const ORIGINALS = join(DATA, 'originals', 'list.json')
const PARTS = join(DATA, 'parts')
const READER = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'reader-py', 'lp3read.py')
const PYTHON = process.env.LP3_PYTHON ?? 'C:\\Users\\LENOVO\\Git\\Github\\wt\\lp3-venv\\Scripts\\python.exe'

const temps: string[] = []
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'transfer-v3-'))
  temps.push(dir)
  return dir
}

async function run(args: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = await main(args, { log: (l) => err.push(l), error: (l) => err.push(l), out: (l) => out.push(l) })
  return { code, out, err, result: out.length > 0 ? JSON.parse(out[out.length - 1]) : undefined }
}

async function built(revision: number, list = LIST): Promise<string> {
  const out = temp()
  const code = await build(['--list', list, '--originals', ORIGINALS, '--parts', PARTS, '--out', out, '--revision', String(revision), '--built', '2026-11-01T10:00:00Z'], {
    log: () => {},
    error: () => {},
  })
  expect(code).toBe(0)
  return out
}

/** A list without its last part of a kind that changes the segments. */
function changedList(kind = 'notes'): string {
  const list = JSON.parse(readFileSync(LIST, 'utf8'))
  list.parts = list.parts.filter((p: { kind: string }) => p.kind !== kind)
  const path = join(temp(), 'list.json')
  writeFileSync(path, JSON.stringify(list))
  return path
}

function files(dir: string, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  if (!existsSync(join(dir, prefix))) return result
  for (const e of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const p = prefix === '' ? e.name : `${prefix}/${e.name}`
    if (p === 'report.txt') continue // build-v3's report is not part of a pack
    if (e.isDirectory()) Object.assign(result, files(dir, p))
    else result[p] = Buffer.from(readFileSync(join(dir, p))).toString('hex')
  }
  return result
}

const catalogsOf = (dir: string) => readdirSync(dir).filter((f) => /^catalog-.*\.seg$/.test(f)).map((f) => join(dir, f))

describe('transfer-v3', () => {
  test('full export then import into an empty folder', async () => {
    const from = await built(1)
    const file = join(temp(), 'a.tcpack')
    const exported = await run(['export', '--from', from, '--mode', 'full', '--out', file])
    expect(exported.err).toEqual([])
    expect(exported.code).toBe(0)
    const into = temp()
    const imported = await run(['import', '--file', file, '--into', into])
    expect(imported.code).toBe(0)
    expect(files(into)).toEqual(files(from))

    const bytes = new Uint8Array(readFileSync(file))
    const ts = await readerOutput(bytes, {})
    expect((ts as { error?: unknown }).error).toBeUndefined()
    const py = spawnSync(PYTHON, ['-I', '-X', 'utf8', READER, file], { encoding: 'buffer', maxBuffer: 1 << 29 })
    expect(py.status).toBe(0)
    expect(canonicalJson(JSON.parse(new TextDecoder().decode(py.stdout)))).toBe(canonicalJson(ts as never))
  })

  test('update carries only the changed segments and completes revision 1 into revision 2', async () => {
    const r1 = await built(1)
    const r2 = await built(2, changedList())
    const full2 = await built(2, changedList())
    const file = join(temp(), 'u.tcpack')
    const full = join(temp(), 'f.tcpack')
    const exported = await run(['export', '--from', r2, '--mode', 'update', ...catalogsOf(r1).flatMap((c) => ['--base', c]), '--out', file])
    expect(exported.code).toBe(0)
    await run(['export', '--from', r2, '--mode', 'full', '--out', full])
    expect(readFileSync(file).length).toBeLessThan(readFileSync(full).length)
    expect(exported.result.segments).toBeLessThan(Object.keys(files(r2, 'segments')).length)
    expect(exported.result.mode).toBe('update')
    const imported = await run(['import', '--file', file, '--into', r1])
    expect(imported.code).toBe(0)
    // Every file of revision 2 is there; the segments only of revision 1 are still there too.
    const got = files(r1)
    const want = files(full2)
    for (const name of Object.keys(want)) expect(got[name]).toBe(want[name])
  })

  test('a file cut in a segment imports the others and names the missing one', async () => {
    const from = await built(1)
    const file = join(temp(), 'a.tcpack')
    await run(['export', '--from', from, '--mode', 'full', '--out', file])
    const bytes = readFileSync(file)
    const cut = join(temp(), 'cut.tcpack')
    writeFileSync(cut, bytes.subarray(0, bytes.length - 5))
    const into = temp()
    const r = await run(['import', '--file', cut, '--into', into])
    expect(r.code).toBe(0)
    expect(r.result.missing.length).toBeGreaterThanOrEqual(1)
    expect(r.result.complete).toBe(false)
    const written = Object.keys(files(into, 'segments')).length
    expect(written).toBe(Object.keys(files(from, 'segments')).length - r.result.missing.length)
    for (const id of r.result.missing) expect(existsSync(join(into, 'segments', `${id}.seg`))).toBe(false)
  })

  test('a file cut in a catalog fails and writes nothing', async () => {
    const from = await built(1)
    const file = join(temp(), 'a.tcpack')
    await run(['export', '--from', from, '--mode', 'full', '--out', file])
    const cut = join(temp(), 'cut.tcpack')
    writeFileSync(cut, readFileSync(file).subarray(0, 200))
    const into = temp()
    const r = await run(['import', '--file', cut, '--into', into])
    expect(r.code).toBe(1)
    expect(readdirSync(into)).toEqual([])
  })

  test('usage errors', async () => {
    const from = await built(1)
    const cat = catalogsOf(from)[0]
    const out = join(temp(), 'x.tcpack')
    expect((await run([])).code).toBe(2)
    expect((await run(['bogus'])).code).toBe(2)
    expect((await run(['export', '--from', from, '--mode', 'full', '--out', out, '--base', cat])).code).toBe(2)
    expect((await run(['export', '--from', from, '--mode', 'update', '--out', out])).code).toBe(2)
    expect((await run(['export', '--from', from, '--mode', 'other', '--out', out])).code).toBe(2)
    expect((await run(['export', '--from', from, '--mode', 'full', '--out', join(from, 'x.tcpack')])).code).toBe(2)
    expect((await run(['import', '--file', out])).code).toBe(2)
    expect(existsSync(out)).toBe(false)
  })

  test('import over existing identical files is fine, a different segment is refused', async () => {
    const from = await built(1)
    const file = join(temp(), 'a.tcpack')
    await run(['export', '--from', from, '--mode', 'full', '--out', file])
    const into = temp()
    expect((await run(['import', '--file', file, '--into', into])).code).toBe(0)
    expect((await run(['import', '--file', file, '--into', into])).code).toBe(0)
    const seg = readdirSync(join(into, 'segments'))[0]
    writeFileSync(join(into, 'segments', seg), new Uint8Array([1, 2, 3]))
    const r = await run(['import', '--file', file, '--into', into])
    expect(r.code).toBe(1)
    expect(new Uint8Array(readFileSync(join(into, 'segments', seg)))).toEqual(new Uint8Array([1, 2, 3]))
  })

  test('full export of a language folder needs the common part (--common), as transfer.md says', async () => {
    const both = await built(1)
    const lang = temp()
    const code = await build(['--list', LIST, '--originals', ORIGINALS, '--parts', PARTS, '--out', lang, '--revision', '1', '--built', '2026-11-01T10:00:00Z', '--common', both], { log: () => {}, error: () => {} })
    expect(code).toBe(0)
    expect(existsSync(join(lang, 'catalog-common.seg'))).toBe(false)
    const file = join(temp(), 'l.tcpack')
    const refused = await run(['export', '--from', lang, '--mode', 'full', '--out', file])
    expect(refused.code).toBe(2)
    expect(existsSync(file)).toBe(false)
    const ok = await run(['export', '--from', lang, '--mode', 'full', '--common', both, '--out', file])
    expect(ok.err).toEqual([])
    expect(ok.result.catalogs).toBe(2)
    const into = temp()
    expect((await run(['import', '--file', file, '--into', into])).code).toBe(0)
    expect(files(into)).toEqual(files(both))
    // a common folder that is another build is refused
    const other = await built(2)
    expect((await run(['export', '--from', lang, '--mode', 'full', '--common', other, '--out', join(temp(), 'o.tcpack')])).code).toBe(1)
  })

  test('an update file is refused where its base revision is not, and nothing is written', async () => {
    const r1 = await built(1)
    const r2 = await built(2, changedList())
    const file = join(temp(), 'u.tcpack')
    expect((await run(['export', '--from', r2, '--mode', 'update', ...catalogsOf(r1).flatMap((c) => ['--base', c]), '--out', file])).code).toBe(0)
    const empty = temp()
    const r = await run(['import', '--file', file, '--into', empty])
    expect(r.code).toBe(1)
    expect(readdirSync(empty)).toEqual([])
    const wrong = await built(3)
    expect((await run(['import', '--file', file, '--into', wrong])).code).toBe(1)
  })

  test('a cut update keeps the older catalog and exits 1; the segments it did bring stay', async () => {
    const r1 = await built(1)
    const r2 = await built(2, changedList("tw"))
    const file = join(temp(), 'u.tcpack')
    const ex = await run(["export", "--from", r2, "--mode", "update", ...catalogsOf(r1).flatMap((c) => ["--base", c]), "--out", file])
    const cut = join(temp(), 'cut.tcpack')
    writeFileSync(cut, readFileSync(file).subarray(0, readFileSync(file).length - 5))
    const before = files(r1)
    const r = await run(['import', '--file', cut, '--into', r1])
    expect(r.code).toBe(1)
    expect(r.result.complete).toBe(false)
    expect(r.result.kept.length).toBeGreaterThanOrEqual(1)
    const after = files(r1)
    expect(after["catalog-es-419.seg"]).toBe(before["catalog-es-419.seg"])
    for (const name of Object.keys(before)) if (name.startsWith("segments/")) expect(after[name]).toBe(before[name])
  })
})
