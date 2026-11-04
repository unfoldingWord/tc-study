import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..', '..', '..')
const FILE = '.github/workflows/language-packs.yml'
// The workflow before format 3 was added to it (the commit before the workflow step).
const BASE = '886403d7'

type Step = { name?: string; id?: string; if?: string; 'continue-on-error'?: boolean; env?: Record<string, string>; run?: string }
const text = readFileSync(join(ROOT, FILE), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))
const doc = Bun.YAML.parse(text) as {
  on: { workflow_dispatch: { inputs: Record<string, { default?: unknown; type?: string }> } }
  jobs: { packs: { steps: Step[] } }
}
const inputs = ((doc as unknown as Record<string, typeof doc.on>).on ?? (doc as unknown as Record<string, typeof doc.on>)['true']).workflow_dispatch.inputs
const steps = doc.jobs.packs.steps
const names = steps.map((s) => s.name)
const find = (n: string): Step => steps.find((s) => s.name === n) as Step

describe('language-packs.yml format 3 steps', () => {
  test('the v3 input defaults to true', () => {
    expect(inputs.v3.default).toBe('true')
  })

  test('the steps come after Build and publish and before Status result, in order', () => {
    const build = names.indexOf('Build and publish')
    const topics = names.indexOf('Topic sources (format 3)')
    const v3 = names.indexOf('Build and publish format 3')
    const status = names.indexOf('Status result')
    expect(build).toBeGreaterThan(-1)
    expect(topics).toBeGreaterThan(build)
    expect(v3).toBeGreaterThan(topics)
    expect(status).toBeGreaterThan(v3)
  })

  test('both steps continue on error', () => {
    expect(find('Topic sources (format 3)')['continue-on-error']).toBe(true)
    expect(find('Build and publish format 3')['continue-on-error']).toBe(true)
  })

  test('the condition refuses production and needs parts and v3', () => {
    const cond = String(find('Build and publish format 3').if)
    expect(cond).toContain('inputs.parts &&')
    expect(cond).toContain("inputs.v3 == 'true'")
    expect(cond).toContain("inputs.target == 'staging'")
    expect(cond).not.toContain('production')
    expect(JSON.stringify(steps)).not.toContain('PACKS_V3_PRODUCTION')
  })

  test('the status step does not read the format 3 outcome', () => {
    const status = find('Status result')
    const all = JSON.stringify(status)
    expect(all).not.toContain('format-3')
    expect(all).not.toMatch(/steps\.(v3|topics)/)
    const v3 = find('Build and publish format 3')
    expect(v3.id).toBeTruthy()
    expect(all).not.toContain(`steps.${v3.id}`)
    expect(all).not.toContain('v3-result')
  })

  test('no secret is echoed and nothing traces', () => {
    for (const s of steps) {
      const run = s.run ?? ''
      expect(run).not.toMatch(/set\s+-\w*x/)
      expect(run).not.toMatch(/echo[^\n]*PACKS_V3_SIGNING_KEY/)
      expect(run).not.toMatch(/(echo|printf)[^\n]*R2_SECRET_ACCESS_KEY/)
    }
    const run = find('Build and publish format 3').run as string
    expect(run).toContain('umask 077')
    expect(run).toContain('stop-commands')
    expect(run).not.toContain('--sign-key')
    expect(run).toMatch(/\[ -n "\$PACKS_V3_SIGNING_KEY" \]/)
    expect(find('Build and publish format 3').env?.PACKS_V3_SIGNING_KEY).toBe('${{ secrets.PACKS_V3_SIGNING_KEY }}')
  })

  test('the format 3 step maps the 2.0 work folder to publish-v3', () => {
    const run = find('Build and publish format 3').run as string
    for (const part of ['publish-v3.ts', '--list', '--originals', '--parts "$work/parts"', '--aligned', '--topics "$RUNNER_TEMP/topics"', '--no-upload'])
      expect(run).toContain(part)
    expect(run).not.toContain('--map-list')
    expect(find('Topic sources (format 3)').run).toContain('fetch-topic-sources.ts --out "$RUNNER_TEMP/topics"')
  })

  test('the 2.0 text is unchanged: the old lines are all there, in order', () => {
    const old = spawnSync('git', ['show', `${BASE}:${FILE}`], { cwd: ROOT, encoding: 'utf8' })
    if (old.status !== 0) return // no history (a shallow checkout)
    const now = text.split('\n')
    let at = 0
    for (const line of old.stdout.split('\n')) {
      const found = now.indexOf(line, at)
      expect(found).toBeGreaterThanOrEqual(at)
      at = found + 1
    }
    // And only whole blocks were added: every 2.0 step is the same object.
    const before = (Bun.YAML.parse(old.stdout) as typeof doc).jobs.packs.steps
    const kept = steps.filter((s) => before.some((b) => b.name === s.name))
    expect(kept).toEqual(before)
  })
})
