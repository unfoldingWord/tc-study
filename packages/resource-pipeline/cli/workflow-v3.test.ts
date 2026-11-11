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
    // the key is passed only when its file exists
    expect(run).toContain('if [ -f "$RUNNER_TEMP/sign.pem" ]; then args+=(--sign-key "$RUNNER_TEMP/sign.pem"); fi')
    expect((run.match(/sign\.pem/g) ?? []).length).toBe(3)
    expect(run).toMatch(/\[ -n "\$PACKS_V3_SIGNING_KEY" \]/)
    expect(find('Build and publish format 3').env?.PACKS_V3_SIGNING_KEY).toBe('${{ secrets.PACKS_V3_SIGNING_KEY }}')
  })

  test('an always() step deletes the key file after the format 3 step, before Status result', () => {
    const remove = names.indexOf('Remove the format 3 signing key')
    expect(remove).toBeGreaterThan(names.indexOf('Build and publish format 3'))
    expect(remove).toBeLessThan(names.indexOf('Status result'))
    const step = steps[remove]
    expect(step.if).toBe('always()')
    expect(step.run).toContain('$RUNNER_TEMP/sign.pem')
    expect(step.run).toMatch(/shred -u|rm -f/)
    expect(step.run).not.toMatch(/echo|cat|printf/)
    expect(step.env).toBeUndefined()
  })

  test('the format 3 step is skipped without topics and fails without the signing key when it would upload', () => {
    const run = find('Build and publish format 3').run as string
    const skip = run.indexOf('if [ "$TOPICS_OUTCOME" != success ]')
    const key = run.indexOf('if [ "$MODE" != no-upload ] && [ -z "$PACKS_V3_SIGNING_KEY" ]')
    expect(skip).toBeGreaterThan(-1)
    expect(key).toBeGreaterThan(skip)
    expect(run.indexOf('publish-v3.ts')).toBeGreaterThan(key)
    // --topics is never conditional
    expect(run).toContain('args+=(--topics "$RUNNER_TEMP/topics")')
    expect(run).not.toMatch(/if \[ "\$TOPICS_OUTCOME" = success \]/)
    expect(run.slice(skip, key)).toContain('exit 0')
    expect(run.slice(key, run.indexOf('work="$RUNNER_TEMP/packs-work"'))).toContain('exit 1')
  })

  test('the format 3 step maps the 2.0 work folder to publish-v3', () => {
    const run = find('Build and publish format 3').run as string
    for (const part of ['publish-v3.ts', '--list', '--originals', '--parts "$work/parts"', '--aligned', '--topics "$RUNNER_TEMP/topics"', '--no-upload'])
      expect(run).toContain(part)
    expect(run).not.toContain('--map-list')
    expect(find('Topic sources (format 3)').run).toContain('fetch-topic-sources.ts --out "$RUNNER_TEMP/topics"')
  })

  test('the format 3 step fetches the tA configs of the list before publish-v3, and a failed fetch fails it', () => {
    const run = find('Build and publish format 3').run as string
    const fetchAt = run.indexOf('fetch-ta-config.ts --list "$list" --out "$RUNNER_TEMP/ta-config"')
    expect(fetchAt).toBeGreaterThan(run.indexOf('list="${lists[0]}"'))
    expect(run.indexOf('bun packages/resource-pipeline/cli/publish-v3.ts')).toBeGreaterThan(fetchAt)
    expect(run).toContain('args+=(--ta-config "$RUNNER_TEMP/ta-config")')
    expect(run).toContain('"reason":"the tA configs could not be fetched"')
  })

  test('the 2.0 text is unchanged: the old lines are all there, in order', () => {
    const old = spawnSync('git', ['show', `${BASE}:${FILE}`], { cwd: ROOT, encoding: 'utf8' })
    if (old.status !== 0) return // no history (a shallow checkout)
    const now = text.split('\n')
    let at = 0
    for (const line of old.stdout.split('\n')) {
      // The runner was pinned on purpose (ubuntu-latest moved to 26.04, where the pack tools do not build).
      if (line.trimEnd() === '    runs-on: ubuntu-latest') {
        expect(now.map((l) => l.trimEnd())).toContain('    runs-on: ubuntu-24.04')
        continue
      }
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

describe('language-packs.yml format 3 step: language and time limit', () => {
  test('the build step lowercases the language and has a 90 minute timeout', () => {
    const step = find('Build and publish format 3') as Step & { 'timeout-minutes'?: number }
    expect(step['timeout-minutes']).toBe(90)
    expect(step.run).toContain('--lang "${LANGUAGE,,}"')
  })
})
