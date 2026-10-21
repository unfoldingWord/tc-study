/**
 * The build state the serving Worker reads to decide whether to dispatch another build (its dispatch guard): a build
 * in flight, one that just failed, or one that keeps failing. It lives next to the catalog entries in the same bucket
 * and is written by the workflow around publish-language, so a crashed run leaves `running` behind, which the Worker
 * stops trusting after 5.5 hours (longer than the job's 300-minute timeout) and then counts as one more failure.
 */

import { isLanguageCode, type PackBucket } from './publishLanguage'

export type PackState = 'running' | 'ok' | 'failed'

export type PackStatus = { state: PackState; at: string; failures: number; run: string }

export const statusPath = (compat: string, language: string) => `status/${compat}/${language}.json`

/**
 * The shape compatKeyOf produces, as the serving Worker checks it (translation-helps-mcp src/packs/dispatch.ts): a compat
 * that arrives as a workflow input becomes a bucket key, so nothing else may pass.
 */
export const COMPAT_RE = /^f\d+\.\d+-u[\w.]+-p\d+-q\d+-a\d+-t\d+$/

export const isCompatKey = (s: string) => COMPAT_RE.test(s)

/** `failed` adds one to the failures in a row, `ok` clears them, and `running` leaves them as they were. */
export async function packsStatus(o: {
  bucket: PackBucket
  compat: string
  language: string
  state: PackState
  /** URL of the workflow run, for whoever reads the status. */
  run: string
  now?: Date
}): Promise<void> {
  if (!isLanguageCode(o.language)) throw new Error(`Not a language code: ${JSON.stringify(o.language)}`)
  if (!isCompatKey(o.compat)) throw new Error(`Not a compat key: ${JSON.stringify(o.compat)}`)
  const key = statusPath(o.compat, o.language)
  // A status that does not parse (a hand edit gone wrong) would otherwise make the language unbuildable: the next run
  // could not write `running`. Network and HTTP errors still stop the run.
  const previous = await o.bucket.getJson<Partial<PackStatus>>(key).catch((e: unknown) => {
    if (e instanceof SyntaxError) return null
    throw e
  })
  // A hand-edited or damaged file must not turn the count into NaN, which no comparison would ever catch.
  const before = Number.isInteger(previous?.failures) && (previous!.failures as number) > 0 ? (previous!.failures as number) : 0
  const failures = o.state === 'failed' ? before + 1 : o.state === 'ok' ? 0 : before
  const status: PackStatus = { state: o.state, at: (o.now ?? new Date()).toISOString(), failures, run: o.run }
  await o.bucket.put(key, JSON.stringify(status), { contentType: 'application/json', cacheControl: 'no-cache' })
}
