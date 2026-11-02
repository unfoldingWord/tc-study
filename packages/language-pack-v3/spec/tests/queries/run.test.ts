import { expect, test } from 'bun:test'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runQueries } from './run'

const HERE = import.meta.dir
const RUN = join(HERE, 'run.ts')
const spawn = (...args: string[]) => Bun.spawnSync(['bun', RUN, ...args], { stdout: 'pipe', stderr: 'pipe' })

test('run.ts exits 2 on a usage error or a folder that is not a build', () => {
  expect(spawn().exitCode).toBe(2)
  expect(spawn(tmpdir(), 'extra').exitCode).toBe(2)
  expect(spawn(mkdtempSync(join(tmpdir(), 'lp3-run-'))).exitCode).toBe(2)
})

// A build is needed for the two checks below: the folder named by LP3_QUERY_BUILD (the gate's English build).
const BUILD = process.env.LP3_QUERY_BUILD
test.skipIf(BUILD === undefined)('a doctored expected is reported as a difference (exit 1 from the command)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lp3-queries-'))
  for (const name of readdirSync(HERE).filter((f) => f.endsWith('.json'))) copyFileSync(join(HERE, name), join(dir, name))
  expect((await runQueries(BUILD!, dir)).failed).toBe(0)
  const file = join(dir, 'g5485.json')
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  doc.expected.key = 'G99999'
  writeFileSync(file, JSON.stringify(doc))
  const { lines, failed } = await runQueries(BUILD!, dir)
  expect(failed).toBe(1)
  expect(lines.find((l) => l.startsWith('g5485:'))).not.toContain('ok')
})
