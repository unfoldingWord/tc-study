#!/usr/bin/env node
/**
 * EMERGENCY ONLY — deploys to Cloudflare Pages `master` WITHOUT `bun run check`.
 * This is NOT a green deploy gate. Prefer `bun run deploy` (runs check) or CI.
 *
 * Required:
 *   ALLOW_UNSAFE_DEPLOY_WITHOUT_CHECK=YES
 */
const { execSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CONFIRM = 'ALLOW_UNSAFE_DEPLOY_WITHOUT_CHECK'

if (process.env[CONFIRM] !== 'YES') {
  console.error('')
  console.error('REFUSED: deploy:UNSAFE_master-without-check is hard-gated.')
  console.error('')
  console.error('This path skips `bun run check` and still pushes to Pages branch=master.')
  console.error('It must NEVER be treated as evidence of a green / quality deploy.')
  console.error('')
  console.error('Safe path:  bun run deploy          (runs check, then build, then wrangler)')
  console.error('CI path:    push to main/master     (quality + e2e must pass)')
  console.error('')
  console.error(`Emergency override (you own the risk):`)
  console.error(`  ${CONFIRM}=YES bun run deploy:UNSAFE_master-without-check`)
  console.error('')
  process.exit(1)
}

console.error('')
console.error('⚠⚠⚠ UNSAFE DEPLOY: skipping check; targeting Pages branch=master ⚠⚠⚠')
console.error('This is an emergency escape hatch, not a quality signal.')
console.error('')

execSync('node scripts/write-app-version.cjs', { cwd: ROOT, stdio: 'inherit' })
execSync('node scripts/set-deploy-version.cjs "bun run build"', {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
  shell: true,
})
execSync('node scripts/strip-preloaded-from-dist.cjs', { cwd: ROOT, stdio: 'inherit' })
execSync(
  'bunx wrangler pages deploy dist --project-name=tc-study --branch=master',
  { cwd: ROOT, stdio: 'inherit', env: process.env, shell: true }
)
