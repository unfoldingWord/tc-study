/**
 * Which MACULA a build reads, from the Taller checkout `--macula` points into (`<taller>/public`): the last commit that
 * touched its `trees/` and `referents/`, and that commit's date. Not HEAD: a Taller commit that changes only the app
 * would make the originals look new, and rebuild them, with the same MACULA.
 */

import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'

function git(cwd: string, args: string[]): string {
  const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${(run.stderr || run.error?.message || '').trim()}`)
  return run.stdout.trim()
}

export function maculaIdentity(folder: string, given: { commit?: string; date?: string }): { commit: string; date: string } {
  const root = git(folder, ['rev-parse', '--show-toplevel'])
  // Paths from the repository's root, with forward slashes, as git wants them on Windows too.
  const parts = ['trees', 'referents'].map((part) => relative(root, join(folder, part)).split('\\').join('/'))
  const commit = given.commit ?? git(root, ['log', '-1', '--format=%H', '--', ...parts])
  if (!commit) throw new Error(`No commit in ${root} touches ${parts.join(' or ')}`)
  const date = given.date ?? git(root, ['log', '-1', '--format=%cI', commit])
  return { commit, date }
}
