/**
 * Whether a download failed because there was no network, not because of the resource or the code.
 *
 * A download that fails with no network must not leave an error on the resource's receipt (`markError`): the
 * resource may hold rows from a language pack, and the error would show it as broken until a new download. The next
 * check with network downloads it as usual.
 *
 * Door43's client wraps nearly every failure as `NETWORK_ERROR`, so the code alone says little: what counts is the
 * device saying it is offline, or fetch's own messages for a request that got no answer. A message with an HTTP
 * status means the server answered, and stays an error.
 */

const NO_ANSWER = /failed to fetch|networkerror when attempting|load failed|network request failed/i
/** "404 Not Found", "HTTP 500", "status 503": a status as servers and fetch wrappers write it, not any 3 digits. */
const HTTP_STATUS = /\b(?:HTTP|status)\s*[1-5]\d\d\b|\b[1-5]\d\d\s+[A-Z][a-z]/

/** The navigator says offline; `undefined` (Node, no navigator) is not offline. */
export function isOffline(nav: { onLine?: boolean } | undefined = globalThis.navigator): boolean {
  return nav?.onLine === false
}

function messagesOf(error: unknown): string[] {
  const out: string[] = []
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    out.push(current.message)
    current = (current as { cause?: unknown }).cause
  }
  return out
}

export function isNetworkFailure(error: unknown, online: boolean | undefined = globalThis.navigator?.onLine): boolean {
  // The server answered with a status: a real failure of the resource, online or not.
  if ((error as { status?: unknown } | null)?.status !== undefined) return false
  const messages = messagesOf(error)
  if (messages.some((message) => HTTP_STATUS.test(message))) return false
  if (online === false) return true
  return messages.some((message) => NO_ANSWER.test(message))
}
