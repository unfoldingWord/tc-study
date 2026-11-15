/**
 * Where the OBS loaders say what they left out (stories a directory ingredient guessed that the zip lacks, stray files of
 * old markdown helps). A loader is made inside `runDownload`, out of the caller's reach, so the parts build listens here for
 * the length of the OBS unit. No Node module: builders and loaders import it.
 */

type Listener = (lines: string[]) => void

const listeners = new Set<Listener>()

/** Calls `listener` with every report from now on; the returned function stops it. */
export function onObsIssues(listener: Listener): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Told by a loader: lines about what it skipped or could not convert. Nothing when `lines` is empty. */
export function reportObsIssues(lines: readonly string[]): void {
  if (lines.length === 0) return
  for (const listener of [...listeners]) listener([...lines])
}
