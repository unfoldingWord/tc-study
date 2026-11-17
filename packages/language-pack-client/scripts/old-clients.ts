/**
 * Usage (from the repo root or from packages/language-pack-client; not part of CI, it needs git, network for `bun install`, and minutes):
 *   LP3_PYTHON="C:/Program Files/Inkscape/bin/python.exe" bun packages/language-pack-client/scripts/old-clients.ts [ref ...]
 * Default refs: 569b88a6 302631d4 (clients from before the `obsimg` class).
 *
 * Checks that a client from before `obsimg` is not disturbed by a source that also serves the catalog `zxx-obsimg`: it builds one pack
 * folder with the sample catalogs (es-419 + common) and the fixture zxx-obsimg catalog, and one without the latter. For each ref it adds a
 * detached worktree, installs there, runs that ref's own createClient (refresh, install with defaults and Titus, read) against both
 * folders, and compares the dumps (state and reads). PASS = identical. The worktrees are removed at the end.
 * Folder layout: <dir>/catalog/<name>.seg and <dir>/seg/<id>.seg.
 *
 * With `--frames` it checks the `obs-frames` table of the common xtopics core instead: one pack folder with the sample as it is, one
 * with a sample whose common catalog was built with bible-story-builder files (so the xtopics core has `obs-frames`, and the common
 * catalog another id). The ids differ, so it compares what the old client sees and reads (`semantic`: refresh names, failures, units,
 * problems, OBS, Titus, the stories of Titus 1:1 and the sections of Titus), not the dumps. PASS = identical `semantic`.
 *   bun packages/language-pack-client/scripts/old-clients.ts --frames [ref ...]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KNOWN, readHeader, readSegment, type XtopicsCore, xtopicsView } from '@bt-synergy/language-pack-v3'
import { framesFixture } from '../test/obsFrames'
import { buildObsimgFixture } from '../test/obsimg'
import { buildSample, type Sample } from '../test/sample'

const frames = process.argv.includes('--frames')
const given = process.argv.slice(2).filter((a) => a !== '--frames')
const refs = given.length > 0 ? given : ['569b88a6', '302631d4']

function run(cmd: string, args: string[], cwd: string): { code: number; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const repo = run('git', ['rev-parse', '--show-toplevel'], process.cwd()).out.trim()
const tmp = mkdtempSync(join(tmpdir(), 'lp3-old-clients-'))

function writePacks(dir: string, sample: Sample, extra?: { catalog: Uint8Array; segments: Map<string, Uint8Array> }): void {
  mkdirSync(join(dir, 'catalog'), { recursive: true })
  mkdirSync(join(dir, 'seg'), { recursive: true })
  writeFileSync(join(dir, 'catalog', 'common.seg'), sample.commonCatalog)
  writeFileSync(join(dir, 'catalog', 'es-419.seg'), sample.langCatalog)
  for (const [id, bytes] of sample.segments) writeFileSync(join(dir, 'seg', `${id}.seg`), bytes)
  if (extra !== undefined) {
    writeFileSync(join(dir, 'catalog', 'zxx-obsimg.seg'), extra.catalog)
    for (const [id, bytes] of extra.segments) writeFileSync(join(dir, 'seg', `${id}.seg`), bytes)
  }
}

/** The runner, written inside the old worktree: it uses that ref's own client. */
const RUNNER = `
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ClientError, createClient, memoryStore } from './packages/language-pack-client/src/index'
const [dir, keyId, pub] = process.argv.slice(2)
const bytesOf = (h) => Uint8Array.from(h.match(/../g), (p) => parseInt(p, 16))
const source = {
  async catalog(name) {
    const p = join(dir, 'catalog', name + '.seg')
    if (!existsSync(p)) throw new ClientError('E_NO_PACK', 'the language has no format 3 pack yet', { status: 404 })
    return { bytes: new Uint8Array(readFileSync(p)) }
  },
  async segment(id) {
    const p = join(dir, 'seg', id + '.seg')
    if (!existsSync(p)) throw new ClientError('E_NETWORK', 'HTTP 404', { status: 404 })
    return new Uint8Array(readFileSync(p))
  },
}
const store = memoryStore()
const client = createClient({ store, source, trust: { trustedKeys: { [keyId]: bytesOf(pub) } } })
const refresh = await client.refresh('es-419')
const install = await client.install('es-419', { books: ['tit'] })
const r = await client.open('es-419')
const obs = await r.obs()
const tit = await r.book('tit')
const out = {
  refresh: { names: refresh.catalogs.map((c) => c.name), unchanged: refresh.unchanged, updates: refresh.updates },
  failed: install.failed ?? [],
  state: await store.getState(),
  blobs: (await store.ids()).sort(),
  status: await client.status('es-419'),
  read: { obsStories: obs ? obs.stories.length : null, obsTitle: obs ? obs.stories[0].title : null, tit: tit ? Object.keys(tit).length : null, problems: r.problems },
}
const safe = async (f) => { try { return await f() } catch (e) { return 'error: ' + (e && e.message) } }
const stories = await safe(async () => (await r.stories('tit 1:1')).data)
const sections = await safe(async () => (r.sections ? (await r.sections('tit')).data : 'no sections query'))
out.semantic = {
  refresh: out.refresh.names,
  failed: out.failed,
  units: Object.keys(out.state.units).sort(),
  problems: r.problems,
  read: out.read,
  stories,
  sections,
}
console.log(JSON.stringify(out, null, 1))
`

function worktreeFor(ref: string): { dir: string; how: string } {
  const dir = join(tmp, ref)
  const add = run('git', ['worktree', 'add', '--detach', dir, ref], repo)
  if (add.code !== 0) throw new Error(`git worktree add ${ref}: ${add.out}`)
  const inst = run('bun', ['install', '--frozen-lockfile', '--filter', '@bt-synergy/language-pack-client'], dir)
  if (inst.code === 0 && existsSync(join(dir, 'node_modules'))) return { dir, how: 'bun install --frozen-lockfile --filter' }
  console.log(`  bun install failed at ${ref} (${inst.out.trim().split('\n').slice(-2).join(' | ')}); linking node_modules from this checkout`)
  symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'), 'junction')
  const own = join(repo, 'packages', 'language-pack-client', 'node_modules')
  if (existsSync(own)) symlinkSync(own, join(dir, 'packages', 'language-pack-client', 'node_modules'), 'junction')
  return { dir, how: 'junction to the node_modules of this checkout' }
}

async function main(): Promise<number> {
  const sample = await buildSample()
  const withDir = join(tmp, 'packs-with')
  const withoutDir = join(tmp, 'packs-without')
  // with --frames: the "with" folder is a sample whose common xtopics core has obs-frames (its own keys)
  const withSample = frames ? await buildSample({ frames: framesFixture() }) : sample
  if (frames) {
    // the control: the "with" sample's common xtopics core has the table, the other's does not
    const keysOf = async (smp: Sample): Promise<number> => {
      for (const bytes of smp.segments.values()) {
        const h = readHeader(bytes).header.h as { class?: unknown; part?: unknown }
        if (h.class !== 'xtopics' || h.part !== 'core') continue
        return Object.keys((xtopicsView((await readSegment(bytes, { known: KNOWN.xtopics })).seg) as XtopicsCore).obsFrames ?? {}).length
      }
      return -1
    }
    const [w, wo] = [await keysOf(withSample), await keysOf(sample)]
    if (w !== 598 || wo !== 0) throw new Error(`the samples are not what they should be: obs-frames keys ${w} (want 598) and ${wo} (want 0)`)
    console.log(`control: the common xtopics core has ${w} obs-frames keys in the "with" sample, none in the other`)
    writePacks(withDir, withSample)
  }
  else writePacks(withDir, sample, await buildObsimgFixture(sample))
  writePacks(withoutDir, sample)
  console.log(`packs: ${withDir} (with ${frames ? 'obs-frames' : 'zxx-obsimg'}), ${withoutDir} (without)`)

  let failures = 0
  for (const ref of refs) {
    console.log(`\n== ${ref}`)
    try {
      const wt = worktreeFor(ref)
      console.log(`  node_modules: ${wt.how}`)
      writeFileSync(join(wt.dir, 'old-client-runner.ts'), RUNNER)
      const a = run('bun', ['old-client-runner.ts', withDir, withSample.keys.keyId, withSample.keys.publicKey], wt.dir)
      const b = run('bun', ['old-client-runner.ts', withoutDir, sample.keys.keyId, sample.keys.publicKey], wt.dir)
      if (a.code !== 0 || b.code !== 0) {
        failures++
        console.log(`FAIL ${ref}: the runner failed\n--- with:\n${a.out.slice(-1500)}\n--- without:\n${b.out.slice(-1500)}`)
        continue
      }
      const semantic = (out: string) => JSON.stringify((JSON.parse(out) as { semantic: unknown }).semantic)
      if (frames ? semantic(a.out) === semantic(b.out) : a.out === b.out) {
        const d = JSON.parse(a.out) as { state: { units: object }; read: unknown }
        console.log(`  units: ${Object.keys(d.state.units).join(', ')}\n  read: ${JSON.stringify(d.read)}`)
        if (frames) console.log(`  semantic: ${semantic(a.out).slice(0, 600)}`)
        console.log(`PASS ${ref}: identical ${frames ? 'reads with and without obs-frames' : 'dumps with and without zxx-obsimg'} (${a.out.length} chars)`)
      } else {
        failures++
        console.log(`FAIL ${ref}: the dumps differ\n--- with:\n${a.out.slice(0, 1500)}\n--- without:\n${b.out.slice(0, 1500)}`)
      }
    } catch (e) {
      failures++
      console.log(`FAIL ${ref}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return failures
}

let code = 1
try {
  code = await main()
} finally {
  for (const ref of refs) run('git', ['worktree', 'remove', '--force', join(tmp, ref)], repo)
  run('git', ['worktree', 'prune'], repo)
  rmSync(tmp, { recursive: true, force: true })
}
console.log(code === 0 ? '\nALL PASS' : `\n${code} FAILED`)
process.exit(code === 0 ? 0 : 1)
