import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { compatKeyOf, PACK_FORMAT_VERSION, PARTS_FORMAT_VERSION } from '@bt-synergy/language-pack'
import { PACK_VERSIONS } from '../src/language/packVersions'
import { partsCode } from '../src/language/partsCode'

const R2 = { R2_ENDPOINT: 'https://r2.invalid', R2_BUCKET: 'b', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' }

/** Runs a CLI of this folder with no R2_* but those given; a MACULA folder that does not exist ends any accepted run. */
function run(script: string, args: string[], r2: Partial<typeof R2> = {}) {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith('R2_')) env[k] = v
  const out = spawnSync(process.execPath, [join(import.meta.dir, script), ...args], { env: { ...env, ...r2 }, encoding: 'utf8' })
  return { code: out.status, stdout: out.stdout.trim(), stderr: out.stderr }
}

const base = ['--lang', 'es-419', '--work', '/nonexistent/work', '--macula', '/nonexistent/taller/public', '--lexicons-ref', 'master']
/** Past the argument checks, the first thing a run does is read MACULA's commit: that is how an accepted run shows. */
const ACCEPTED = 'No se pudo leer el commit de MACULA'

describe('publish-language refuses the combinations that would do something other than asked', () => {
  const refused: Array<[string, string[], Partial<typeof R2>, string]> = [
    ['--parts with --dry-run (a parts run decides by building)', ['--parts', '--dry-run'], {}, '--parts y --dry-run no van juntos'],
    ['--previous without --parts', ['--no-upload', '--generator', 'g', '--previous', '/x'], {}, '--previous solo va con --parts --no-upload'],
    ['--previous with a parts publish (a folder says nothing of the bucket)', ['--parts', '--previous', '/x'], R2, '--previous solo va con --parts --no-upload'],
    ['--previous with --force (force reads no previous list)', ['--parts', '--no-upload', '--previous', '/x', '--force'], {}, '--previous y --force no van juntos'],
    ['--previous with no folder', ['--parts', '--no-upload', '--previous'], {}, 'Falta la carpeta de --previous'],
    ['--parts with R2 half set', ['--parts', '--no-upload'], { R2_ENDPOINT: R2.R2_ENDPOINT, R2_BUCKET: R2.R2_BUCKET }, 'Faltan R2_ENDPOINT'],
    ['a parts publish without R2', ['--parts'], {}, 'Faltan R2_ENDPOINT'],
    ['--parts with --obs (its loader reads each story from Door43)', ['--parts', '--no-upload', '--obs'], {}, 'OBS parts wait for the OBS loader to read the hashed zip'],
    ['--dry-run with --no-upload (as before)', ['--generator', 'g', '--dry-run', '--no-upload'], {}, '--dry-run y --no-upload no van juntos'],
    ['a whole publish without --generator (as before)', [], R2, 'Faltan --generator'],
  ]
  for (const [what, args, r2, why] of refused) {
    test(`${what}: exit 2, saying why`, () => {
      const out = run('publish-language.ts', [...base, ...args], r2)
      expect(out.stderr).toContain(why)
      expect(out.code).toBe(2)
      expect(out.stdout).toBe('')
    })
  }

  const accepted: Array<[string, string[], Partial<typeof R2>]> = [
    ['a parts publish with the four R2_*', ['--parts'], R2],
    ['a forced parts publish', ['--parts', '--force'], R2],
    ['--parts --no-upload without R2', ['--parts', '--no-upload'], {}],
    ['--parts --no-upload reading the previous lists from R2', ['--parts', '--no-upload'], R2],
    ['--parts --no-upload --previous', ['--parts', '--no-upload', '--previous', '/x'], {}],
    ['a whole --no-upload --force (as before)', ['--generator', 'g', '--no-upload', '--force'], {}],
    ['a whole --no-upload with --obs (as before)', ['--generator', 'g', '--no-upload', '--obs'], {}],
  ]
  for (const [what, args, r2] of accepted) {
    test(`${what}: past the argument checks`, () => {
      const out = run('publish-language.ts', [...base, ...args], r2)
      expect(out.stderr).toContain(ACCEPTED)
    })
  }
})

describe('packs-status --print-compat', () => {
  test('without --parts: the whole packs compat (f1.1), the one the Worker reads', () => {
    const out = run('packs-status.ts', ['--print-compat'])
    expect(out.code).toBe(0)
    expect(out.stdout).toBe(compatKeyOf(PACK_FORMAT_VERSION, PACK_VERSIONS))
    expect(out.stdout).toStartWith('f1.1-')
  })

  test('with --parts: the parts compat (f2.0), so a parts run has its own status', () => {
    const out = run('packs-status.ts', ['--print-compat', '--parts'])
    expect(out.code).toBe(0)
    expect(out.stdout).toBe(compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS))
    expect(out.stdout).toStartWith('f2.0-')
  })
})

describe('packs-status: the builder file', () => {
  test('--print-code prints the code a parts build of this checkout writes in its lists, and needs no bucket', async () => {
    const out = run('packs-status.ts', ['--print-code'])
    expect(out.code).toBe(0)
    expect(out.stdout).toBe(await partsCode())
    expect(out.stdout).toMatch(new RegExp(`^${compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS).replace(/\./g, '\\.')}\\+[0-9a-f]{16}$`))
  })

  const COMMIT = '0123456789abcdef0123456789abcdef01234567'
  const refused: Array<[string, string[], Partial<typeof R2>, string]> = [
    ['--builder without --commit', ['--builder'], R2, 'Falta --commit'],
    ['--builder with a commit that is not a whole sha', ['--builder', '--commit', 'abc123'], R2, '--commit no es un commit'],
    ['--builder with --compat (it writes the compat this code builds)', ['--builder', '--commit', COMMIT, '--compat', compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)], R2, '--builder no lleva --compat'],
    ['--builder with R2 half set', ['--builder', '--commit', COMMIT], { R2_ENDPOINT: R2.R2_ENDPOINT, R2_BUCKET: R2.R2_BUCKET }, 'Faltan R2_ENDPOINT'],
    ['--builder without R2', ['--builder', '--commit', COMMIT], {}, 'Faltan R2_ENDPOINT'],
  ]
  for (const [what, args, r2, why] of refused) {
    test(`${what}: exit 2, saying why`, () => {
      const out = run('packs-status.ts', args, r2)
      expect(out.stderr).toContain(why)
      expect(out.code).toBe(2)
      expect(out.stdout).toBe('')
    })
  }
})
