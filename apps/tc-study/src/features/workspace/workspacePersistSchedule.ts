/**
 * Debounced workspace persist for tab-activate (activeIndex only).
 * Membership mutations still call persistWorkspacePackage immediately.
 * Flushes on hide/unload so last-active tab survives reload.
 */

import { persistWorkspacePackage } from './workspacePersistence'
import type { WorkspacePackage } from './workspaceTypes'

const PERSIST_DEBOUNCE_MS = 400

let timer: ReturnType<typeof setTimeout> | null = null
let readPkg: (() => WorkspacePackage | null) | null = null
let flushBound = false

export function scheduleWorkspacePersist(getPkg: () => WorkspacePackage | null): void {
  readPkg = getPkg
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const pkg = readPkg?.()
    if (pkg) persistWorkspacePackage(pkg)
  }, PERSIST_DEBOUNCE_MS)
  bindPersistFlush()
}

export function flushScheduledWorkspacePersist(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const pkg = readPkg?.()
  if (pkg) persistWorkspacePackage(pkg)
}

export function cancelScheduledWorkspacePersist(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function bindPersistFlush(): void {
  if (flushBound || typeof window === 'undefined') return
  flushBound = true
  const flush = () => flushScheduledWorkspacePersist()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
