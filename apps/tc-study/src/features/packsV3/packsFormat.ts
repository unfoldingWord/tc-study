/**
 * Which packs server this run talks to, and so which pack format it reads. Format 3 is on only for staging: with
 * production (the default) nothing of format 3 runs: no request to its routes, no database opened.
 */

export type PacksServer = 'production' | 'staging'

/** The staging packs server (a preview worker). Production is never used for format 3. */
export const V3_ORIGIN_STAGING = 'https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev'

const STORAGE_KEY = 'tc-study:packs-server'

const asServer = (v: unknown): PacksServer | null => (v === 'staging' || v === 'production' ? v : null)

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null // storage blocked (privacy mode)
  }
}

/**
 * `?packs=staging|production` in the URL wins and is remembered in localStorage; otherwise the remembered value;
 * otherwise the build's `VITE_TCS_PACKS`; otherwise production.
 */
export function packsServer(): PacksServer {
  const store = storage()
  const fromUrl = asServer(new URLSearchParams(globalThis.location?.search ?? '').get('packs'))
  if (fromUrl) {
    try {
      store?.setItem(STORAGE_KEY, fromUrl)
    } catch {
      /* not remembered */
    }
    return fromUrl
  }
  let saved: PacksServer | null = null
  try {
    saved = asServer(store?.getItem(STORAGE_KEY))
  } catch {
    /* unreadable */
  }
  return saved ?? asServer(import.meta.env?.VITE_TCS_PACKS) ?? 'production'
}

/** `3` exactly when the packs server is staging. */
export function packsFormat(): 2 | 3 {
  return packsServer() === 'staging' ? 3 : 2
}
