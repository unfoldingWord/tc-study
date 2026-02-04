/**
 * Door43 Content Helpers
 * 
 * Helpers for fetching resource content files (USFM, TSV, Markdown, etc.)
 * from Door43 git repositories
 */

import type { Door43Resource } from './Door43ApiClient'

export interface ContentUrlOptions {
  bookCode?: string
  filename?: string
  branch?: string
}

/**
 * Get raw content URL from resource
 */
export function getContentUrl(
  resource: Door43Resource,
  options: ContentUrlOptions = {}
): string {
  const { branch = 'master' } = options
  
  // Convert /src/branch/ URL to /raw/branch/
  let baseUrl = resource.html_url || ''
  
  if (baseUrl.includes('/src/branch/')) {
    baseUrl = baseUrl.replace('/src/branch/', '/raw/branch/')
  } else {
    // Construct raw URL from repo info
    baseUrl = `https://git.door43.org/${resource.owner}/${resource.name}/raw/branch/${branch}`
  }
  
  return baseUrl
}

/**
 * Get USFM file URL for scripture resources
 */
export function getUSFMUrl(
  resource: Door43Resource,
  bookCode: string,
  branch?: string
): string {
  const baseUrl = getContentUrl(resource, { branch: branch || 'master' })
  return `${baseUrl}/${bookCode.toUpperCase()}.usfm`
}

/**
 * Get TSV file URL for translation helps (notes, questions)
 */
export function getTSVUrl(
  resource: Door43Resource,
  bookCode: string,
  prefix?: string,
  branch?: string
): string {
  const baseUrl = getContentUrl(resource, { branch: branch || 'master' })
  const filename = prefix 
    ? `${prefix}_${bookCode.toUpperCase()}.tsv`
    : `${bookCode}.tsv`
  return `${baseUrl}/${filename}`
}

/**
 * Get translation notes TSV URL
 */
export function getNotesUrl(
  resource: Door43Resource,
  bookCode: string,
  branch?: string
): string {
  return getTSVUrl(resource, bookCode, undefined, branch)
}

/**
 * Get translation questions TSV URL
 */
export function getQuestionsUrl(
  resource: Door43Resource,
  bookCode: string,
  branch?: string
): string {
  return getTSVUrl(resource, bookCode, undefined, branch)
}

/**
 * Get translation words links TSV URL
 */
export function getWordsLinksUrl(
  resource: Door43Resource,
  bookCode: string,
  branch?: string
): string {
  return getTSVUrl(resource, bookCode, 'twl', branch)
}

/**
 * Get markdown file URL (for Translation Words, Academy, etc.)
 */
export function getMarkdownUrl(
  resource: Door43Resource,
  path: string,
  branch?: string
): string {
  const baseUrl = getContentUrl(resource, { branch: branch || 'master' })
  return `${baseUrl}/${path}`
}

/**
 * Get tarball download URL for entire resource
 */
export function getTarballUrl(resource: Door43Resource): string {
  // Use tarball_url if available from catalog
  if ((resource as any).tarball_url) {
    return (resource as any).tarball_url
  }
  
  // Construct from release info
  const tag = (resource as any).release_tag || 'master'
  return `https://git.door43.org/${resource.owner}/${resource.name}/archive/${tag}.tar.gz`
}

/**
 * Fetch raw content from URL
 */
export async function fetchContent(url: string): Promise<string> {
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch content from ${url}: ${response.status} ${response.statusText}`)
  }
  
  return response.text()
}

/**
 * Fetch USFM content
 */
export async function fetchUSFM(
  resource: Door43Resource,
  bookCode: string,
  branch?: string
): Promise<string> {
  const url = getUSFMUrl(resource, bookCode, branch)
  return fetchContent(url)
}

/**
 * Fetch TSV content
 */
export async function fetchTSV(
  resource: Door43Resource,
  bookCode: string,
  prefix?: string,
  branch?: string
): Promise<string> {
  const url = getTSVUrl(resource, bookCode, prefix, branch)
  return fetchContent(url)
}

/**
 * Fetch markdown content
 */
export async function fetchMarkdown(
  resource: Door43Resource,
  path: string,
  branch?: string
): Promise<string> {
  const url = getMarkdownUrl(resource, path, branch)
  return fetchContent(url)
}
