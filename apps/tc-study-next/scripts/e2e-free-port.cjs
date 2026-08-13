#!/usr/bin/env node
/** Free E2E preview port before Playwright starts (CI refuses a busy url). */
const { execSync } = require('child_process')
const PORT = process.env.E2E_PORT || '4180'

function freePort(port) {
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
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
      } catch {
        /* ignore */
      }
    }
  } else {
    try {
      execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' })
    } catch {
      /* ignore */
    }
  }
}

freePort(PORT)
