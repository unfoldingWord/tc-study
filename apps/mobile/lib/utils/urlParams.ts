/**
 * URL Parameter and LocalStorage Management
 * 
 * Handles the fallback hierarchy:
 * 1. URL path parameters /:owner/:language/:book (highest priority)
 * 2. URL query parameters ?ref=... (for reference)
 * 3. LocalStorage (user's last used params)
 * 4. Hardcoded defaults (lowest priority)
 */

export interface AppParams {
  owner: string
  language: string
  book: string
  ref: string
}

export interface PathParams {
  owner?: string
  language?: string
  book?: string
  ref?: string
}

export const DEFAULT_PARAMS: AppParams = {
  owner: 'unfoldingWord',
  language: 'en',
  book: 'tit',
  ref: '1:1'
}

const STORAGE_KEY = 'bt-studio-last-params'

/**
 * Get parameters from localStorage
 */
export function getStoredParams(): Partial<AppParams> | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch (error) {
    console.warn('Failed to parse stored params:', error)
    return null
  }
}

/**
 * Save parameters to localStorage
 */
export function storeParams(params: Partial<AppParams>): void {
  try {
    const current = getStoredParams() || {}
    const updated = { ...current, ...params }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch (error) {
    console.warn('Failed to store params:', error)
  }
}

/**
 * Get parameters from URL path and search params
 */
export function getUrlParams(pathParams: PathParams, searchParams: URLSearchParams): Partial<AppParams> {
  
  const params: Partial<AppParams> = {}
  
  // Path parameters take priority
  if (pathParams.owner) {
    params.owner = pathParams.owner
      }
  if (pathParams.language) {
    params.language = pathParams.language
      }
  if (pathParams.book) {
    params.book = pathParams.book
      }
  if (pathParams.ref) {
    params.ref = pathParams.ref
      }
  
  // Query parameters as fallback (especially for ref)
  if (!params.owner && searchParams.has('owner')) {
    params.owner = searchParams.get('owner') || undefined
      }
  if (!params.language && searchParams.has('language')) {
    params.language = searchParams.get('language') || undefined
      }
  if (!params.book && searchParams.has('book')) {
    params.book = searchParams.get('book') || undefined
      }
  if (!params.ref && searchParams.has('ref')) {
    params.ref = searchParams.get('ref') || undefined
      }
  
    return params
}

/**
 * Update URL with new parameters using path-based routing
 */
export function updateUrlParams(
  navigate: (url: string) => void, 
  newParams: AppParams
): void {
  // Build path-based URL: /:owner/:language/:book
  let path = `/${newParams.owner}/${newParams.language}/${newParams.book}`
  
  // Add reference as query parameter if not default
  if (newParams.ref && newParams.ref !== '1:1') {
    path += `?ref=${encodeURIComponent(newParams.ref)}`
  }
  
  navigate(path)
  }

/**
 * Resolve final parameters using fallback hierarchy
 */
export function resolveAppParams(pathParams: PathParams, searchParams: URLSearchParams): AppParams {
  const urlParams = getUrlParams(pathParams, searchParams)
  const storedParams = getStoredParams() || {}
  
  const resolved: AppParams = {
    owner: urlParams.owner || storedParams.owner || DEFAULT_PARAMS.owner,
    language: urlParams.language || storedParams.language || DEFAULT_PARAMS.language,
    book: urlParams.book || storedParams.book || DEFAULT_PARAMS.book,
    ref: urlParams.ref || storedParams.ref || DEFAULT_PARAMS.ref
  }
  

  
  return resolved
}

/**
 * Check if URL has any app parameters (path or query)
 */
export function hasUrlParams(pathParams: PathParams, searchParams: URLSearchParams): boolean {
  const hasPathParams = !!(pathParams.owner || pathParams.language || pathParams.book || pathParams.ref)
  const hasQueryParams = ['owner', 'language', 'book', 'ref'].some(param => searchParams.has(param))
  return hasPathParams || hasQueryParams
}
