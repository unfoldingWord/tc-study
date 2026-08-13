/** Redirects for deferred or legacy routes. */
export const ROUTE_REDIRECTS = [
  { from: '/passage-sets', to: '/data', reason: 'Passage Sets package not wired' },
  { from: '/catalog', to: '/library', reason: 'Legacy catalog path' },
  { from: '/create-package', to: '/collections', reason: 'Legacy create-package path' },
] as const
