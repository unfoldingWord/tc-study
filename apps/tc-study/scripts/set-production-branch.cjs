#!/usr/bin/env node
/**
 * Set Cloudflare Pages project production branch to main.
 * Uses wrangler's OAuth token from config. Run from apps/tc-study.
 *
 * Usage: node scripts/set-production-branch.cjs
 * Or: CLOUDFLARE_ACCOUNT_ID=xxx node scripts/set-production-branch.cjs
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '5a3ffd86280d3ed086be76d955829242'
const PROJECT_NAME = 'tc-study'
const PRODUCTION_BRANCH = 'master'

// Find wrangler config (same paths wrangler uses)
const home = process.env.HOME || process.env.USERPROFILE
const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config')
const configPaths = [
  path.join(home, '.wrangler', 'config', 'default.toml'),
  path.join(xdgConfig, '.wrangler', 'config', 'default.toml'),
  path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'xdg.config', '.wrangler', 'config', 'default.toml'),
]

let token = process.env.CLOUDFLARE_API_TOKEN
if (!token) {
  for (const p of configPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8')
      const m = content.match(/oauth_token\s*=\s*"([^"]+)"/)
      if (m) {
        token = m[1]
        break
      }
    }
  }
}

if (!token) {
  console.error('No token found. Run "wrangler login" or set CLOUDFLARE_API_TOKEN.')
  process.exit(1)
}

const body = JSON.stringify({ production_branch: PRODUCTION_BRANCH })
const options = {
  hostname: 'api.cloudflare.com',
  path: `/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}`,
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}

const req = https.request(options, (res) => {
  let data = ''
  res.on('data', (ch) => { data += ch })
  res.on('end', () => {
    const json = JSON.parse(data)
    if (json.success) {
      console.log(`Production branch set to "${PRODUCTION_BRANCH}" for tc-study.pages.dev`)
    } else {
      console.error('API error:', json.errors?.[0]?.message || json)
      process.exit(1)
    }
  })
})

req.on('error', (e) => {
  console.error('Request error:', e.message)
  process.exit(1)
})
req.write(body)
req.end()
