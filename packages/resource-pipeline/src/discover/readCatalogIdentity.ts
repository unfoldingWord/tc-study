/**
 * Door43 catalog search identity helpers for Read hydrate.
 * Kept out of loadReadLanguageCatalog so the orchestrator stays under god-size.
 */

export type CatalogEntry = {
  repo?: CatalogEntry
  catalog?: { prod?: CatalogEntry['release'] }
  owner?: unknown
  name?: unknown
  repo_name?: unknown
  title?: unknown
  language?: unknown
  language_code?: unknown
  language_title?: unknown
  identifier?: unknown
  subject?: unknown
  content_format?: unknown
  format?: unknown
  description?: unknown
  metadata_url?: unknown
  ingredients?: unknown
  abbreviation?: unknown
  html_url?: unknown
  release?: {
    tag_name?: string
    zipball_url?: string
    tarball_url?: string
    published_at?: string
    html_url?: string
  }
  [key: string]: unknown
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function ownerField(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const o = value as { login?: unknown; username?: unknown }
    if (typeof o.login === 'string') return o.login
    if (typeof o.username === 'string') return o.username
  }
  return undefined
}

/**
 * What the release's manifest says. `repo` carries the same fields as the default branch has them now, which can
 * list books the release does not contain, so they are never taken from `repo`, even when the hit lacks them.
 */
const RELEASE_SCOPED_FIELDS = new Set([
  'ingredients',
  'books',
  'relations',
  'checking_level',
  'title',
  'subject',
  'abbreviation',
  'identifier',
  'language',
  'language_code',
  'language_title',
  'language_direction',
  'language_is_gl',
  'content_format',
  'format',
  'flavor',
  'flavor_type',
  'metadata_type',
  'metadata_version',
  'metadata_url',
  'release',
])

/**
 * A catalog search hit describes one release; its `repo` describes the repository on its default branch. The hit
 * wins for every field it carries, and `repo` only fills in the repository's own fields the hit lacks (description,
 * html_url, catalog, ...).
 */
export function catalogHitItem(entry: CatalogEntry): CatalogEntry {
  const repo = entry.repo
  if (!repo) return entry
  const item: CatalogEntry = { ...entry }
  for (const [key, value] of Object.entries(repo)) {
    if (item[key] == null && !RELEASE_SCOPED_FIELDS.has(key)) item[key] = value
  }
  return item
}

export function catalogIdentity(entry: CatalogEntry, languageCode: string) {
  const item = catalogHitItem(entry)
  const repoName = asString(item.name) || asString(item.repo_name)
  if (!repoName) return null

  const ownerStr = ownerField(item.owner) ?? ownerField(entry.owner) ?? 'unknown'
  const langStr = asString(item.language) || asString(item.language_code) || languageCode
  const resourceId =
    asString(item.identifier) ||
    (repoName.includes('_') ? repoName.split('_').slice(1).join('_') : repoName)
  const resourceKey = `${ownerStr}/${langStr}/${resourceId}`
  const subjectRaw = item.subject ?? ''
  const subject = String((Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw) ?? '').trim()

  return { item, repoName, ownerStr, langStr, resourceId, resourceKey, subject }
}
