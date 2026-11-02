/**
 * Every request to Door43 goes through here. With the device offline (`navigator.onLine === false`) it fails at once,
 * the way fetch fails with no network, without asking: an app opened from a language pack, out of signal, sends
 * nothing and waits for nothing. Callers already handle a failed fetch. Online, or with no navigator (Node), it is the
 * global fetch, read at call time so tests that replace it still work.
 */
export function door43Fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator
  if (nav?.onLine === false) {
    return Promise.reject(new TypeError('Failed to fetch: this device is offline'))
  }
  return globalThis.fetch(input, init)
}
