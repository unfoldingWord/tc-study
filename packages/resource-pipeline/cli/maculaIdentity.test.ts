import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { maculaDateUtc, maculaFlagsProblem, maculaIdentity, maculaStamp } from './maculaIdentity'

function git(cwd: string, args: string[], date?: string): string {
  const env = { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) }
  const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, env, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(run.stderr)
  return run.stdout.trim()
}

/** A Taller-like repository: MACULA in `public/`, then a later commit that touches only the app. */
function taller() {
  const root = mkdtempSync(join(tmpdir(), 'taller-'))
  git(root, ['init', '-q'])
  for (const part of ['trees', 'referents']) {
    mkdirSync(join(root, 'public', part), { recursive: true })
    writeFileSync(join(root, 'public', part, 'TIT.json'), '{}')
  }
  git(root, ['add', '.'])
  git(root, ['commit', '-q', '-m', 'MACULA'], '2026-10-01T09:00:00-05:00')
  const macula = git(root, ['rev-parse', 'HEAD'])
  writeFileSync(join(root, 'public', 'app.js'), 'x')
  git(root, ['add', '.'])
  git(root, ['commit', '-q', '-m', 'app'], '2026-10-15T08:00:00+02:00')
  const head = git(root, ['rev-parse', 'HEAD'])
  return { root, macula, head }
}

describe('maculaIdentity', () => {
  test("MACULA's commit is the last one that touched trees or referents, with that commit's date, not HEAD's", () => {
    const { root, macula } = taller()
    expect(maculaIdentity(join(root, 'public'), {})).toEqual({ commit: macula, date: '2026-10-01T09:00:00-05:00' })
  })

  test('a commit given: its own date is read', () => {
    const { root, head } = taller()
    expect(maculaIdentity(join(root, 'public'), { commit: head })).toEqual({ commit: head, date: '2026-10-15T08:00:00+02:00' })
  })

  test('a date given is kept as given', () => {
    const { root, macula } = taller()
    expect(maculaIdentity(join(root, 'public'), { date: '2026-10-02T00:00:00Z' })).toEqual({ commit: macula, date: '2026-10-02T00:00:00Z' })
  })

  test('a folder outside any git repository fails, naming the folder', () => {
    const folder = mkdtempSync(join(tmpdir(), 'no-git-'))
    expect(() => maculaIdentity(folder, {})).toThrow(folder)
  })

  test('a folder outside any git repository, with the commit and the date given: they are kept, git is not asked', () => {
    const folder = mkdtempSync(join(tmpdir(), 'no-git-'))
    const given = { commit: 'f1e2d3c4b5a69788f1e2d3c4b5a69788f1e2d3c4', date: '2026-10-01T09:00:00-05:00' }
    expect(maculaIdentity(folder, given)).toEqual(given)
  })
})

describe('maculaStamp', () => {
  test('uses the same short commit and UTC date publishLanguage used before', () => {
    expect(maculaStamp({ commit: 'f1e2d3c4b5a69788f1e2d3c4b5a69788f1e2d3c4', date: '2026-10-01T09:00:00-05:00' })).toEqual({
      version: 'f1e2d3c4b5',
      publishedAt: '2026-10-01T14:00:00.000Z',
    })
  })

  test('refuses a date that is not ISO 8601', () => {
    expect(() => maculaStamp({ commit: 'f1e2d3c4b5a69788f1e2d3c4b5a69788f1e2d3c4', date: 'yesterday' })).toThrow('yesterday')
    expect(() => maculaDateUtc('15/10/2026')).toThrow('15/10/2026')
  })

  test('a time with no zone is refused: it would be read as the machine\'s local time', () => {
    expect(() => maculaDateUtc('2026-10-15T02:19:35')).toThrow('2026-10-15T02:19:35')
  })

  test('an offset is that instant in UTC', () => {
    expect(maculaDateUtc('2026-10-14T22:19:35-04:00')).toBe('2026-10-15T02:19:35.000Z')
  })
})

describe('maculaFlagsProblem', () => {
  const sha = '3b8aa380e8d8ce1f5efc61c3269a7b08cb3a21d5'
  const commitProblem = (commit: string) => `--macula-commit no es un commit (40 caracteres hexadecimales): ${JSON.stringify(commit)}`
  const dateProblem = (date: string) => `--macula-date no es una fecha ISO 8601 con zona (Z o -04:00): ${JSON.stringify(date)}`

  test('a full sha and a zoned instant: nothing is wrong', () => {
    expect(maculaFlagsProblem({ commit: sha, date: '2026-10-15T02:19:35Z' })).toBeNull()
  })

  test('nothing given: nothing is wrong', () => {
    expect(maculaFlagsProblem({})).toBeNull()
  })

  test('a short sha: the commit message', () => {
    expect(maculaFlagsProblem({ commit: '3b8aa38' })).toBe(commitProblem('3b8aa38'))
  })

  test('a flag read as the commit: the commit message', () => {
    expect(maculaFlagsProblem({ commit: '--macula-date' })).toBe(commitProblem('--macula-date'))
  })

  test('a time with no zone: the date message', () => {
    expect(maculaFlagsProblem({ date: '2026-10-15T02:19:35' })).toBe(dateProblem('2026-10-15T02:19:35'))
  })

  test('a date with no time: the date message', () => {
    expect(maculaFlagsProblem({ date: '2026-10-15' })).toBe(dateProblem('2026-10-15'))
  })

  test('a date that is not ISO: the date message', () => {
    expect(maculaFlagsProblem({ date: '15/10/2026' })).toBe(dateProblem('15/10/2026'))
  })

  test('an offset: nothing is wrong', () => {
    expect(maculaFlagsProblem({ date: '2026-10-14T22:19:35-04:00' })).toBeNull()
  })
})
