import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { optionsFromArgs, runPrepareLanguage, UsageError } from './prepare-language'

const COMMIT = '3b8aa380e8d8ce1f5efc61c3269a7b08cb3a21d5'

function noIdentity(): never {
  throw new Error('MACULA identity should not be read')
}

/** The command as a script: what it prints and its exit code. */
function cli(args: string[]) {
  const out = spawnSync(process.execPath, [join(import.meta.dir, 'prepare-language.ts'), ...args], { encoding: 'utf8' })
  return { code: out.status, stderr: out.stderr }
}

describe('prepare-language', () => {
  test('with --macula, prepareAndPack gets MACULA stamp from identity (not build date)', async () => {
    const calls: Array<unknown> = []
    const logs: string[] = []
    await runPrepareLanguage(['--lang', 'es-419', '--macula', '/taller/public'], {
      requireFreshBuilds: () => {},
      readMaculaIdentity: () => ({ commit: COMMIT, date: '2026-10-14T22:19:35-04:00' }),
      prepareAndPack: (async (o) => {
        calls.push(o)
        return { report: {} }
      }) as never,
      log: (line) => logs.push(line),
    })

    expect(logs[0]).toBe(`MACULA: ${COMMIT} (2026-10-14T22:19:35-04:00)`)
    expect(calls).toEqual([
      expect.objectContaining({
        language: 'es-419',
        macula: resolve('/taller/public'),
        maculaStamp: { version: '3b8aa380e8', publishedAt: '2026-10-15T02:19:35.000Z' },
      }),
    ])
  })

  test('--macula-commit and --macula-date are passed to identity, and their stamp wins', () => {
    const seen: Array<{ folder: string; given: { commit?: string; date?: string } }> = []
    const { options } = optionsFromArgs(
      ['--lang', 'es-419', '--macula', '/taller/public', '--macula-commit', '0123456789abcdef0123456789abcdef01234567', '--macula-date', '2026-10-20T10:11:12-05:00'],
      (folder, given) => {
        seen.push({ folder, given })
        return { commit: given.commit!, date: given.date! }
      }
    )

    expect(seen).toEqual([
      {
        folder: resolve('/taller/public'),
        given: { commit: '0123456789abcdef0123456789abcdef01234567', date: '2026-10-20T10:11:12-05:00' },
      },
    ])
    expect(options.maculaStamp).toEqual({ version: '0123456789', publishedAt: '2026-10-20T15:11:12.000Z' })
  })

  test('a folder that is not a git checkout works with --macula-commit and --macula-date', () => {
    const folder = mkdtempSync(join(tmpdir(), 'macula-no-git-'))
    const { options, maculaIdentity } = optionsFromArgs(['--lang', 'es-419', '--macula', folder, '--macula-commit', COMMIT, '--macula-date', '2026-10-14T22:19:35-04:00'])

    expect(maculaIdentity).toEqual({ commit: COMMIT, date: '2026-10-14T22:19:35-04:00' })
    expect(options.maculaStamp).toEqual({ version: '3b8aa380e8', publishedAt: '2026-10-15T02:19:35.000Z' })
  })

  test('a folder that is not a git checkout and only one of the flags: it says to pass both', () => {
    const folder = mkdtempSync(join(tmpdir(), 'macula-no-git-'))
    const run = () => optionsFromArgs(['--lang', 'es-419', '--macula', folder, '--macula-commit', COMMIT])
    expect(run).toThrow(UsageError)
    expect(run).toThrow('Pasa --macula-commit <sha> y --macula-date <iso>')
  })

  test('if MACULA identity cannot be read, it says to pass --macula-commit and --macula-date', () => {
    const run = () =>
      optionsFromArgs(['--lang', 'es-419', '--macula', '/not-a-repo/public'], () => {
        throw new Error('git failed')
      })
    expect(run).toThrow(UsageError)
    expect(run).toThrow('Pasa --macula-commit <sha> y --macula-date <iso>')
  })

  test('with --no-originals, MACULA identity is not read and no stamp is given', () => {
    const { options, maculaIdentity } = optionsFromArgs(['--lang', 'es-419', '--no-originals', '--macula', '/not-a-repo/public'], noIdentity)
    expect(maculaIdentity).toBeUndefined()
    expect(options.originals).toBe(false)
    expect(options.maculaStamp).toBeUndefined()
  })

  test('a short --macula-commit is a usage error', () => {
    const run = () => optionsFromArgs(['--lang', 'es-419', '--macula', '/taller/public', '--macula-commit', '3b8aa38', '--macula-date', '2026-10-15T02:19:35Z'], noIdentity)
    expect(run).toThrow(UsageError)
    expect(run).toThrow('40 caracteres')
  })

  test('a flag followed by another flag is a usage error, not its value', () => {
    const run = () => optionsFromArgs(['--lang', 'es-419', '--macula', '/taller/public', '--macula-commit', '--macula-date', '2026-10-15T02:19:35Z'], noIdentity)
    expect(run).toThrow(UsageError)
    expect(run).toThrow('Falta el valor de --macula-commit')
  })

  test('a bad --macula-date is a usage error', () => {
    const run = () => optionsFromArgs(['--lang', 'es-419', '--macula', '/taller/public', '--macula-commit', COMMIT, '--macula-date', '15/10/2026'], noIdentity)
    expect(run).toThrow(UsageError)
    expect(run).toThrow('15/10/2026')
  })

  test('as a script, a usage error exits with 2 and the usage line, without a stack trace', () => {
    const { code, stderr } = cli(['--lang', 'es-419', '--macula', tmpdir(), '--macula-commit', COMMIT, '--macula-date', '15/10/2026'])
    expect(code).toBe(2)
    expect(stderr).toContain('--macula-date no es una fecha ISO 8601')
    expect(stderr).toContain('Uso: prepare-language')
    expect(stderr).not.toContain('    at ')
  }, 30000)
})
