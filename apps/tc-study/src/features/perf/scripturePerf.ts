/**
 * Dev-only scripture performance harness.
 *
 * Marks and measures book load, layout build, chapter upgrade commits,
 * underline/highlight signal application, and long tasks.
 */

export type ScripturePerfPhase =
  | 'book-load'
  | 'layout-build'
  | 'chapter-sequence'
  | 'chapter-upgrade'
  | 'underline-signal'
  | 'highlight-signal'
  | 'quote-build'
  | 'align-tokens'
  | 'underline-groups'
  | 'title-preload'

export interface ScripturePerfSample {
  phase: ScripturePerfPhase | 'longtask'
  durationMs: number
  detail?: string
  at: number
}

const MARK_PREFIX = 'tc-scripture:'
const MAX_SAMPLES = 80

let enabled = false
let samples: ScripturePerfSample[] = []
const listeners = new Set<() => void>()
let longTaskObserver: PerformanceObserver | null = null

function notify(): void {
  for (const listener of listeners) listener()
}

function pushSample(sample: ScripturePerfSample): void {
  samples = [...samples.slice(-(MAX_SAMPLES - 1)), sample]
  notify()
}

export function isScripturePerfEnabled(): boolean {
  return enabled
}

export function getScripturePerfSamples(): readonly ScripturePerfSample[] {
  return samples
}

export function clearScripturePerfSamples(): void {
  samples = []
  notify()
}

export function subscribeScripturePerf(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function markName(phase: ScripturePerfPhase, edge: 'start' | 'end', detail?: string): string {
  return `${MARK_PREFIX}${phase}${detail ? `:${detail}` : ''}:${edge}`
}

export function markScripturePerfStart(phase: ScripturePerfPhase, detail?: string): void {
  if (!enabled || typeof performance === 'undefined') return
  try {
    performance.mark(markName(phase, 'start', detail))
  } catch {
    /* ignore */
  }
}

export function markScripturePerfEnd(phase: ScripturePerfPhase, detail?: string): void {
  if (!enabled || typeof performance === 'undefined') return
  const start = markName(phase, 'start', detail)
  const end = markName(phase, 'end', detail)
  const measureName = `${MARK_PREFIX}${phase}${detail ? `:${detail}` : ''}`
  try {
    performance.mark(end)
    performance.measure(measureName, start, end)
    const entries = performance.getEntriesByName(measureName, 'measure')
    const last = entries[entries.length - 1]
    if (last) {
      pushSample({
        phase,
        durationMs: Math.round(last.duration * 10) / 10,
        detail,
        at: performance.now(),
      })
    }
    performance.clearMarks(start)
    performance.clearMarks(end)
    performance.clearMeasures(measureName)
  } catch {
    /* ignore */
  }
}

/** Sync wrap for CPU work that should be measured. */
export function measureScripturePerfSync<T>(
  phase: ScripturePerfPhase,
  detail: string | undefined,
  fn: () => T
): T {
  if (!enabled) return fn()
  markScripturePerfStart(phase, detail)
  try {
    return fn()
  } finally {
    markScripturePerfEnd(phase, detail)
  }
}

function startLongTaskObserver(): void {
  if (typeof PerformanceObserver === 'undefined') return
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        pushSample({
          phase: 'longtask',
          durationMs: Math.round(entry.duration * 10) / 10,
          detail: entry.name || 'longtask',
          at: performance.now(),
        })
      }
    })
    longTaskObserver.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit)
  } catch {
    longTaskObserver = null
  }
}

function stopLongTaskObserver(): void {
  longTaskObserver?.disconnect()
  longTaskObserver = null
}

/** Enable only in DEV. No-op in production builds. */
export function setScripturePerfEnabled(next: boolean): void {
  const want = next && import.meta.env.DEV === true
  if (want === enabled) return
  enabled = want
  if (enabled) {
    startLongTaskObserver()
  } else {
    stopLongTaskObserver()
    clearScripturePerfSamples()
  }
  notify()
}

export function useScripturePerfSnapshot(): {
  enabled: boolean
  samples: readonly ScripturePerfSample[]
} {
  // Lazy require to keep this module usable from non-React contexts (cache, workers).
  // Callers in React should import useSyncExternalStore themselves — see AdminPanel.
  return {
    enabled,
    samples,
  }
}
