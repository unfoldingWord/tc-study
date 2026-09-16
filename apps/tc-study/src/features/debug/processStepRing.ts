/**
 * Small ring buffer of process/debug step events for engineers.
 * Payloads stay tiny (keys/paths/status) — never file bodies.
 */

export type ProcessStepWorker =
  | 'catalog-download'
  | 'warm'
  | 'prepare'
  | 'session'

export interface ProcessStepEvent {
  /** Epoch ms */
  t: number
  worker: ProcessStepWorker
  step: string
  detail?: string
}

export const PROCESS_STEP_RING_CAPACITY = 80

export type ProcessStepRing = {
  capacity: number
  events: ProcessStepEvent[]
}

export function createProcessStepRing(
  capacity = PROCESS_STEP_RING_CAPACITY
): ProcessStepRing {
  return { capacity: Math.max(1, capacity), events: [] }
}

export function pushProcessStep(
  ring: ProcessStepRing,
  event: Omit<ProcessStepEvent, 't'> & { t?: number }
): ProcessStepEvent {
  const next: ProcessStepEvent = {
    t: event.t ?? Date.now(),
    worker: event.worker,
    step: event.step,
    detail: event.detail,
  }
  ring.events.push(next)
  while (ring.events.length > ring.capacity) {
    ring.events.shift()
  }
  return next
}

export function listProcessSteps(
  ring: ProcessStepRing,
  limit?: number
): ProcessStepEvent[] {
  if (limit == null || limit >= ring.events.length) return [...ring.events]
  if (limit <= 0) return []
  return ring.events.slice(-limit)
}

export function clearProcessSteps(ring: ProcessStepRing): void {
  ring.events.length = 0
}

export function formatProcessStepLine(
  event: ProcessStepEvent,
  now = Date.now()
): string {
  const ageSec = Math.max(0, Math.floor((now - event.t) / 1000))
  const age =
    ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m ${ageSec % 60}s`
  const detail = event.detail ? ` ${event.detail}` : ''
  return `-${age} [${event.worker}] ${event.step}${detail}`
}

/** Compact explainers for warm lane gate codes. */
export function explainWarmLaneGate(code: string | null | undefined): string | null {
  if (!code) return null
  if (code === 'lane1-busy') {
    return 'L2/L3 gated: lane1 owners still busy (open chapter not ready)'
  }
  if (code === 'scroll-unsettled') return 'L2/L3 gated: scroll unsettled'
  if (code === 'document-hidden') return 'L2/L3 gated: document hidden'
  if (code === 'admit-cooldown') return 'L3 gated: admit cooldown'
  if (code.startsWith('pending>=')) {
    return `L3 gated: ${code} warm jobs still pending`
  }
  return code
}
