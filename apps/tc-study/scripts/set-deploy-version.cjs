#!/usr/bin/env node
/**
 * Set VITE_DEPLOY_VERSION for the next build and print it.
 * Usage: node scripts/set-deploy-version.cjs
 * Or use from deploy:quick which runs this then build then wrangler.
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
