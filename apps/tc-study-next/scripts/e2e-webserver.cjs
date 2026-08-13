#!/usr/bin/env node
/**
 * Playwright webServer entry: free port, production-build, then vite preview.
 * Kills the listen port first so Playwright cannot treat a leftover preview as
 * ready while `vite build` is still running.
 *
 * Preview is spawned without a shell so the process stays alive for the full
 * Playwright run on Windows.
 */
const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PORT = process.env.E2E_PORT || '4180'
const HOST = '127.0.0.1'

function freePort(port) {
  console.log(`[e2e-webserver] freeing port ${port}...`)
  try {
    if (process.platform === 'win32') {
      let out = ''
      try {
        out = execSync('netstat -ano', { encoding: 'utf8' })
      } catch {
        return
      }
      const pids = new Set()
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes(`:${port}`)) continue
        if (!/LISTENING/i.test(line)) continue
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid)
      }
      for (const pid of pids) {
        console.log(`[e2e-webserver] taskkill PID ${pid}`)
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' })
        } catch {
          /* ignore */
        }
      }
    } else {
      try {
        execSync(`fuser -k ${port}/tcp`, { stdio: 'inherit' })
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn('[e2e-webserver] freePort warning:', err && err.message)
  }
  execSync(process.platform === 'win32' ? 'ping -n 3 127.0.0.1 >NUL' : 'sleep 2', {
    stdio: 'ignore',
    shell: true,
  })
}

function resolveViteCli() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    path.join(ROOT, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  // Last resort: package.json main adjacent bin
  try {
    const pkg = require.resolve('vite/package.json', { paths: [ROOT] })
    const cli = path.join(path.dirname(pkg), 'bin', 'vite.js')
    if (fs.existsSync(cli)) return cli
  } catch {
    /* ignore */
  }
  throw new Error('Could not resolve vite CLI (bin/vite.js)')
}

freePort(PORT)

const useExistingDist = process.env.E2E_USE_EXISTING_DIST === '1'
const distIndex = path.join(ROOT, 'dist', 'index.html')

if (useExistingDist) {
  if (!fs.existsSync(distIndex)) {
    throw new Error(
      'E2E_USE_EXISTING_DIST=1 but dist/index.html is missing (CI must download tc-study-dist first)'
    )
  }
  console.log('[e2e-webserver] using existing dist (CI artifact / deploy parity)')
  execSync('node scripts/strip-preloaded-from-dist.cjs', { cwd: ROOT, stdio: 'inherit' })
} else {
  execSync('node scripts/write-app-version.cjs', { cwd: ROOT, stdio: 'inherit' })
  execSync('bun run build', { cwd: ROOT, stdio: 'inherit', env: process.env })
  // Same post-process as Cloudflare deploy (see docs/E2E_DEPLOY_ARTIFACT_PARITY.md)
  execSync('node scripts/strip-preloaded-from-dist.cjs', { cwd: ROOT, stdio: 'inherit' })
}
// Do not freePort after build — that can kill a listener Playwright already
// treated as ready and causes mid-suite ERR_CONNECTION_REFUSED.

const viteJs = resolveViteCli()
console.log(`[e2e-webserver] starting preview ${HOST}:${PORT} via ${viteJs}`)
const child = spawn(
  process.execPath,
  [viteJs, 'preview', '--host', HOST, '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'inherit', env: process.env, shell: false }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  }
  process.exit(code ?? 1)
})

process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
