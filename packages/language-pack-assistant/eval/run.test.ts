import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resultPath } from './run'

test('a test2 result is not overwritten unless --out names a new file', () => {
  const root = mkdtempSync(join(tmpdir(), 'lp3-run-'))
  mkdirSync(join(root, 'eval/results'), { recursive: true })
  expect(resultPath(root, 'es', 'test2', undefined)).toBe(join(root, 'eval/results/es-test2.json'))
  writeFileSync(join(root, 'eval/results/es-test2.json'), '{}')
  expect(() => resultPath(root, 'es', 'test2', undefined)).toThrow(/not overwritten/)
  expect(resultPath(root, 'es', 'test2', 'again')).toBe(join(root, 'eval/results/es-test2-again.json'))
  writeFileSync(join(root, 'eval/results/es-test2-again.json'), '{}')
  expect(() => resultPath(root, 'es', 'test2', 'again')).toThrow(/not overwritten/)
  // The other sets keep the old behaviour.
  writeFileSync(join(root, 'eval/results/es-tune.json'), '{}')
  expect(resultPath(root, 'es', 'tune', undefined)).toBe(join(root, 'eval/results/es-tune.json'))
  expect(() => resultPath(root, 'es', 'test2', 'A-b')).toThrow(/letters and digits/)
})
