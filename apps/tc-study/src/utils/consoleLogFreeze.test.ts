/**
 * ARCH-FREEZE (non-behavioral): success-path console.* ratchet.
 * Aligns with eslint `no-console` (allow warn/error only).
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/** Prod src console.log/info/debug must stay at zero (same freeze story). */
const CONSOLE_SUCCESS_PATH_BASELINE = 0

async function countConsoleCalls(method: 'log' | 'info' | 'debug'): Promise<number> {
  const glob = new Glob('**/*.{ts,tsx}')
  let count = 0
  const re = new RegExp(`console\\.${method}\\s*\\(`, 'g')
  for await (const path of glob.scan(ROOT)) {
    const rel = path.replace(/\\/g, '/')
    if (rel.includes('.test.') || rel.includes('__tests__')) continue
    if (rel.includes('node_modules')) continue
    const src = readFileSync(join(ROOT, path), 'utf8')
    const matches = src.match(re)
    if (matches) count += matches.length
  }
  return count
}

describe('consoleLogFreeze', () => {
  test(`prod src console.log count stays ≤ ${CONSOLE_SUCCESS_PATH_BASELINE}`, async () => {
    expect(await countConsoleCalls('log')).toBeLessThanOrEqual(CONSOLE_SUCCESS_PATH_BASELINE)
  })

  test(`prod src console.info count stays ≤ ${CONSOLE_SUCCESS_PATH_BASELINE}`, async () => {
    expect(await countConsoleCalls('info')).toBeLessThanOrEqual(CONSOLE_SUCCESS_PATH_BASELINE)
  })

  test(`prod src console.debug count stays ≤ ${CONSOLE_SUCCESS_PATH_BASELINE}`, async () => {
    expect(await countConsoleCalls('debug')).toBeLessThanOrEqual(CONSOLE_SUCCESS_PATH_BASELINE)
  })
})
