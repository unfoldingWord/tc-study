#!/usr/bin/env node
/**
 * Set VITE_DEPLOY_VERSION for the next build and print it.
 * Usage: node scripts/set-deploy-version.cjs
 * Used by deploy:UNSAFE_master-without-check (hard-gated emergency hatch —
 * does not run `check`; not a green gate). Prefer `bun run deploy` or CI.
 */
const { execSync } = require('child_process')

const version =
  process.env.VITE_DEPLOY_VERSION ||
  new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
process.env.VITE_DEPLOY_VERSION = version
console.log('Deploy version (verify in app: menu → Version):', version)
const [, , ...args] = process.argv
if (args.length > 0) {
  execSync(args.join(' '), { env: process.env, stdio: 'inherit', shell: true })
}
