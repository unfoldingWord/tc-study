import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP_ROOT = join(import.meta.dir, '../..')

describe('deployTrustGuards', () => {
  test('deploy:preview-nocheck is removed (cannot look like a green deploy)', () => {
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['deploy:preview-nocheck']).toBeUndefined()
  })

  test('unsafe master deploy requires explicit env confirm and is clearly named', () => {
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const unsafe = pkg.scripts['deploy:UNSAFE_master-without-check']
    expect(unsafe).toBeTruthy()
    expect(unsafe).toContain('unsafe-deploy-master-without-check.cjs')

    const script = readFileSync(
      join(APP_ROOT, 'scripts/unsafe-deploy-master-without-check.cjs'),
      'utf8'
    )
    expect(script).toContain('ALLOW_UNSAFE_DEPLOY_WITHOUT_CHECK')
    expect(script).toContain("!== 'YES'")
    expect(script).toContain('process.exit(1)')
    // Must still strip preloaded JSON the same way gated deploy does
    expect(script).toContain('strip-preloaded-from-dist.cjs')
  })

  test('gated deploy.sh runs check before build', () => {
    const deploySh = readFileSync(join(APP_ROOT, 'scripts/deploy.sh'), 'utf8')
    expect(deploySh).toContain('bun run check')
    expect(deploySh).toContain('bun run build')
    expect(deploySh).toContain('strip-preloaded-from-dist.cjs')
  })

  test('e2e webserver strips preloaded JSON (deploy-dist parity)', () => {
    const webserver = readFileSync(join(APP_ROOT, 'scripts/e2e-webserver.cjs'), 'utf8')
    expect(webserver).toContain('strip-preloaded-from-dist.cjs')
  })
})
