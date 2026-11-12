import type { PackReader } from '@bt-synergy/language-pack-client'
import { ResourceFormat, ResourceType, type ResourceMetadata } from '@bt-synergy/resource-catalog'

/** One entry of `tc-study-catalog`. `rights` and `attribution` are the format's own fields; the app's row type has no place for them. */
export type CatalogEntryRow = { key: string; metadata: ResourceMetadata & { rights?: string; attribution?: string } }

/** Door43's server name: the keys of the rows (`{owner}/{lang}/{id}`) are the same as the Door43 loaders write, so the row says it came from there. */
const SERVER = 'git.door43.org'

/** The ingredient of a book held: the format has no file path for it. */
export const ingredientOf = (identifier: string) => ({ identifier, title: identifier, path: '', exists: true, downloaded: true })

/** The type and format the resource selector infers from a subject, with the subjects of the OBS resources told apart. */
function kindOf(subject: string): { type: ResourceType; format: ResourceFormat } {
  const s = subject.toLowerCase()
  if (s.includes('open bible stories') || s.includes('obs')) {
    if (s.includes('questions')) return { type: ResourceType.OBS_QUESTIONS, format: ResourceFormat.TSV }
    if (s.includes('links')) return { type: ResourceType.OBS_WORDS_LINKS, format: ResourceFormat.TSV }
    if (s.includes('notes')) return { type: ResourceType.OBS_NOTES, format: ResourceFormat.TSV }
    return { type: ResourceType.OBS, format: ResourceFormat.MARKDOWN }
  }
  if (s.includes('bible')) return { type: ResourceType.SCRIPTURE, format: ResourceFormat.USFM }
  if (s.includes('academy')) return { type: ResourceType.ACADEMY, format: ResourceFormat.MARKDOWN }
  if (s.includes('links')) return { type: ResourceType.WORDS_LINKS, format: ResourceFormat.TSV }
  if (s.includes('words')) return { type: ResourceType.WORDS, format: ResourceFormat.MARKDOWN }
  if (s.includes('questions')) return { type: ResourceType.QUESTIONS, format: ResourceFormat.TSV }
  if (s.includes('notes')) return { type: ResourceType.NOTES, format: ResourceFormat.TSV }
  return { type: ResourceType.UNKNOWN, format: ResourceFormat.UNKNOWN }
}

/**
 * One catalog entry per resource the catalogs list (`reader.resources()`), in the shape the Door43 loaders and
 * `openLanguagePacks` write:
 *
 * - `resourceKey` as the catalog gives it (`{owner}/{lang}/{id}`), `owner`, `language` and `resourceId` taken from it;
 * - `release.tag_name` and `version`: the format's `release`, which is the release tag alone (`v42`). The format does not keep
 *   `published_at`, so `resourceContentStamp` of this row is the tag (`v42`), not `v42#2024-...` as a Door43 row gives; the
 *   sync keeps a Door43 row's `release` when it has the same tag, so the stamp stays the one its derived rows were made under;
 * - `contentMetadata` lists no books: the catalogs do not say which a resource has, so the sync fills them in.
 */
export function catalogRowsV3(reader: PackReader): CatalogEntryRow[] {
  const seen = new Set<string>()
  const rows: CatalogEntryRow[] = []
  for (const r of reader.resources()) {
    if (seen.has(r.key)) continue // a resource of both catalogs (`common` and the language) is one entry
    seen.add(r.key)
    const [owner = '', language = '', resourceId = ''] = r.key.split('/')
    const { type, format } = kindOf(r.subject)
    rows.push({
      key: r.key,
      metadata: {
        resourceKey: r.key,
        server: SERVER,
        owner,
        language,
        resourceId,
        subject: r.subject,
        version: r.release,
        title: r.title,
        type,
        format,
        contentType: 'text/plain',
        contentStructure: type === ResourceType.SCRIPTURE || type === ResourceType.NOTES || type === ResourceType.QUESTIONS || type === ResourceType.WORDS_LINKS ? 'book' : 'entry',
        availability: { online: true, offline: true, bundled: false, partial: false },
        locations: [],
        contentMetadata: { ingredients: [], downloadedIngredients: [], books: [] },
        release: { tag_name: r.release, zipball_url: '', published_at: '' },
        license: { id: r.license },
        ...(r.rights !== undefined ? { rights: r.rights } : {}),
        ...(r.attribution !== undefined ? { attribution: r.attribution } : {}),
        catalogedAt: new Date().toISOString(),
      },
    })
  }
  return rows
}
