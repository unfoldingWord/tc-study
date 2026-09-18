/**
 * Schedule work for the next idle period (requestIdleCallback with setTimeout fallback).
 * Returns a cancel function.
 */
export function scheduleIdle(run: () => void, timeoutMs = 1500): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => run(), { timeout: timeoutMs })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(run, 0)
  return () => clearTimeout(id)
}
