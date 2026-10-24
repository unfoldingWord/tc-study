/**
 * What a parts unit may read from the network: nothing step 1 did not read. Every fingerprint is made from the
 * archives step 1 downloaded and hashed (kept in `<work>/zips`); a loader that falls back to Door43 (another tag, a
 * file read on its own, a raw URL) would build rows from bytes no fingerprint covers, and a carried part would then
 * keep rows nobody can say the inputs of. So a unit's Door43 client serves only the release zips step 1 kept, its
 * fetch only the answers step 1 got, and any other call is refused and recorded: the build turns it into a failure of
 * the unit naming the call (a loader may catch the refusal and go on, so the record is what counts).
 */

type AnyFetch = (input: any, init?: any) => Promise<Response>

/**
 * Marks the process-wide refusal `cacheOnlyNetwork` gives (`global`): a unit that found it already in place would
 * otherwise save it as "the process's fetch" and give it back, leaving every later fetch refused. `Symbol.for`, so a
 * second copy of this module (another bundle) marks the same.
 */
export const REFUSING_FETCH = Symbol.for('bt-synergy.parts.refusingFetch')

/** Whether `f` is a unit's refusal of the process's fetch (of this or any parts build in the process). */
export const isRefusingFetch = (f: unknown): boolean => typeof f === 'function' && (f as unknown as Record<symbol, unknown>)[REFUSING_FETCH] === true

/** One call a unit made to the network that step 1 did not make, as the failure names it. */
export type NetworkCall = string

const show = (args: unknown[]) =>
  args
    .filter((a) => typeof a !== 'function' && a !== undefined)
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(', ')

/**
 * Step 1's fetch, recording the answers a unit may be given again: every non-archive GET (the API calls that resolve
 * a lexicon's commit), its status, headers and body, and the archive URLs (served from `<work>/zips` by `fetchFn`).
 */
export function recordingFetch<F extends AnyFetch>(fetchFn: F) {
  const answers = new Map<string, { status: number; headers: [string, string][]; body: Uint8Array<ArrayBuffer> }>()
  const archives = new Set<string>()
  const recorded = (async (input: string | URL | Request, init?: RequestInit) => {
    const href = input instanceof Request ? input.url : String(input)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const res = await fetchFn(input, init)
    if (method !== 'GET') return res
    if (new URL(href).pathname.includes('/archive/')) {
      if (res.ok) archives.add(href)
      return res
    }
    const body = new Uint8Array(await res.arrayBuffer())
    const answer = { status: res.status, headers: [...res.headers] as [string, string][], body }
    answers.set(href, answer)
    return new Response(body.slice(), { status: answer.status, headers: answer.headers })
  }) as unknown as F
  return { fetch: recorded, answers, archives }
}

/**
 * A unit's network: `client` with only `downloadZipball` of a zip step 1 kept (`kept(owner, repo, ref)`), and `fetch`
 * with only what step 1 fetched (`recorded`, archives through `fetchFn`, which reads them from `<work>/zips`). Any
 * other call is pushed to `calls` and throws, unless `allow` lets it through (logged by the caller). `global` is the
 * same refusal for the process's `fetch`, which some loaders call directly for a raw URL.
 */
export function cacheOnlyNetwork<C extends object, F extends AnyFetch>(o: {
  unit: string
  client: C
  kept: (owner: string, repo: string, ref: string) => boolean
  fetchFn: F
  recorded: Pick<ReturnType<typeof recordingFetch>, 'answers' | 'archives'>
  allow?: (method: string, args: unknown[]) => boolean
}): { client: C; fetch: F; global: typeof fetch; calls: NetworkCall[] } {
  const calls: NetworkCall[] = []
  const refuse = (call: string): never => {
    calls.push(call)
    throw new Error(`${o.unit}: ${call} would read Door43 again, not what step 1 hashed; a unit reads only step 1's archives`)
  }

  const client = new Proxy(o.client, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function' || typeof prop !== 'string') return value
      return (...args: unknown[]) => {
        if (prop === 'downloadZipball') {
          const [owner, repo, ref = 'master'] = args as [string, string, string?]
          if (o.kept(owner, repo, ref)) return value.apply(target, args)
        } else if (o.allow?.(prop, args)) {
          return value.apply(target, args)
        }
        // Rejected, as the client's own (async) methods fail.
        try {
          return refuse(`${prop}(${show(args)})`)
        } catch (e) {
          return Promise.reject(e)
        }
      }
    },
  })

  const fetchOf = (input: string | URL | Request, init?: RequestInit) => {
    const href = input instanceof Request ? input.url : String(input)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method === 'GET') {
      const answer = o.recorded.answers.get(href)
      if (answer) return Promise.resolve(new Response(answer.body.slice(), { status: answer.status, headers: answer.headers }))
      if (o.recorded.archives.has(href)) return o.fetchFn(input, init)
    }
    try {
      return refuse(`fetch ${method} ${href}`)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  const global = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      const href = input instanceof Request ? input.url : String(input)
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      try {
        return refuse(`fetch ${method} ${href}`)
      } catch (e) {
        return Promise.reject(e)
      }
    },
    { [REFUSING_FETCH]: true }
  ) as unknown as typeof fetch

  return { client, fetch: fetchOf as unknown as F, global, calls }
}
