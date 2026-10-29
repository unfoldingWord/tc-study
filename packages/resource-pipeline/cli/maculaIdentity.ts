/**
 * Which MACULA a build reads, from the Taller checkout `--macula` points into (`<taller>/public`): the last commit that
 * touched its `trees/` and `referents/`, and that commit's date. Not HEAD: a Taller commit that changes only the app
 * would make the originals look new, and rebuild them, with the same MACULA.
 */

import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'

export type MaculaIdentity = { commit: string; date: string }
export type MaculaStamp = { version: string; publishedAt: string }

function git(cwd: string, args: string[]): string {
  const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${(run.stderr || run.error?.message || '').trim()}`)
  return run.stdout.trim()
}

/** With both `commit` and `date` given nothing is read: the folder need not be a git checkout. */
export function maculaIdentity(folder: string, given: { commit?: string; date?: string }): MaculaIdentity {
  if (given.commit && given.date) return { commit: given.commit, date: given.date }
  const root = git(folder, ['rev-parse', '--show-toplevel'])
  // Paths from the repository's root, with forward slashes, as git wants them on Windows too.
  const parts = ['trees', 'referents'].map((part) => relative(root, join(folder, part)).split('\\').join('/'))
  const commit = given.commit ?? git(root, ['log', '-1', '--format=%H', '--', ...parts])
  if (!commit) throw new Error(`No commit in ${root} touches ${parts.join(' or ')}`)
  const date = given.date ?? git(root, ['log', '-1', '--format=%cI', commit])
  return { commit, date }
}

/** ISO 8601 with a time and a zone. A time with no zone is the machine's local time, so the stamp would not match production. */
const MACULA_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/** MACULA's commit date as its rows carry it. In UTC: apps compare the dates as text, and two offsets would not sort. */
export function maculaDateUtc(date: string): string {
  const when = new Date(date)
  if (!MACULA_INSTANT.test(date) || Number.isNaN(when.getTime())) {
    throw new Error(`Not an ISO 8601 date for MACULA's commit: ${JSON.stringify(date)}`)
  }
  return when.toISOString()
}

/**
 * What is wrong with `--macula-commit` and `--macula-date` as given, in the words a CLI prints, or null when nothing is.
 * Both CLIs use it (prepare-language, publish-language), so a pack and a production list stamp MACULA alike.
 */
export function maculaFlagsProblem(given: { commit?: string; date?: string }): string | null {
  const { commit, date } = given
  if (commit !== undefined && !/^[0-9a-f]{40}$/.test(commit)) {
    return `--macula-commit no es un commit (40 caracteres hexadecimales): ${JSON.stringify(commit)}`
  }
  if (date !== undefined) {
    try {
      maculaDateUtc(date)
    } catch {
      return `--macula-date no es una fecha ISO 8601 con zona (Z o -04:00): ${JSON.stringify(date)}`
    }
  }
  return null
}

/** The stamp of MACULA's rows: the commit's first ten characters and its date in UTC. */
export function maculaStamp(identity: MaculaIdentity): MaculaStamp {
  return { version: identity.commit.slice(0, 10), publishedAt: maculaDateUtc(identity.date) }
}
