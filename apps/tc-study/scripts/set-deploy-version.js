#!/usr/bin/env node
/**
 * Set VITE_DEPLOY_VERSION for the next build and print it.
 * Usage: node scripts/set-deploy-version.js
 * Then run: bun run build:skip-check (or vite build)
 * Or use from deploy:quick which runs this then build then wrangler.
 *
 * Prints the version so you can verify in the app (menu → Version) after deploy.
 */
const version =
  process.env.VITE_DEPLOY_VERSION ||
  new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
process.env.VITE_DEPLOY_VERSION = version
console.log('Deploy version (verify in app: menu → Version):', version)
// If run as main, spawn build with this env
const [,, ...args] = process.argv
if (args.length > 0) {
  const { execSync } = require('child_process')
  execSync(args.join(' '), { env: process.env, stdio: 'inherit', shell: true })
}
