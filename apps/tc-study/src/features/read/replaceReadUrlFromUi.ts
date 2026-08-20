/**
 * In-app Read URL updates: address bar only.
 * `history.replaceState` must not look like a React Router navigation
 * (that remounted Read and re-ran hydrate in 3b82305).
 */

import type { ReadNavigationSource } from './readUrlGrammar'

let navigationSource: ReadNavigationSource = 'external'
let inMemoryPathname: string | null = null

export function getReadNavigationSource(): ReadNavigationSource {
  return navigationSource
}

export function markReadNavigationInternal(): void {
  navigationSource = 'internal'
}

export function markReadNavigationExternal(): void {
  navigationSource = 'external'
}

export function shouldHydrateReadLanguages(source: ReadNavigationSource = navigationSource): boolean {
  return source === 'external'
}

export function getReadLocationPathname(): string {
  if (inMemoryPathname) return inMemoryPathname
  if (typeof window !== 'undefined') return window.location.pathname
  return ''
}

export function replaceReadUrlFromUi(path: string): void {
  navigationSource = 'internal'
  inMemoryPathname = path
  if (typeof window === 'undefined') return
  window.history.replaceState(window.history.state, '', path)
}

/** Browser back/forward is external — hydrate from the path. */
export function applyReadPopstate(): void {
  navigationSource = 'external'
  inMemoryPathname = typeof window !== 'undefined' ? window.location.pathname : inMemoryPathname
}

export function subscribeReadPopstate(onPop?: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => {
    applyReadPopstate()
    onPop?.()
  }
  window.addEventListener('popstate', handler)
  return () => window.removeEventListener('popstate', handler)
}

export function resetReadNavigationSourceForTests(): void {
  navigationSource = 'external'
  inMemoryPathname = null
}
