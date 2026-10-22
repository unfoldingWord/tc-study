import type { PackManifest, PackRequirement, PackResourceRole, PackVersions } from './types'

export type PackBuild = {
  id: string
  generator: string
  macula?: string
  lexicons?: string
  /** `owner/language/id` → `resourceContentStamp`, of everything the pack was built from. */
  stamps: Record<string, string>
}

export type PackCatalogEntry = {
  schema: 1
  /** `es-419`, or `originals`. */
  language: string
  compat: string
  build: PackBuild
  createdAt: string
  pack: { path: string; bytes: number; sha256: string }
  versions: PackVersions
  /**
   * The manifest's resources, enough for an app to decide what opening the pack would replace (Servos'
   * `packAgainstDevice`) before downloading it. `books` is empty for a resource kept by article: it comes whole.
   */
  resources: Array<{ key: string; stamp: string; role: PackResourceRole; books: string[]; subject?: string; title?: string }>
  left: Array<{ key: string; why: string }>
  requires?: PackRequirement[]
  /** Where the pack's book views live in the bucket, e.g. `v1/es-419/`. */
  views?: string
  /** A language's entry: the originals build its quote and align rows were made against, and where its pack is. */
  originals?: PackOriginalsRef
}

export type PackOriginalsRef = { build: string; path: string; bytes: number; sha256: string }

/**
 * The folder a pack lives in: two packs with the same key can be opened by the same app. It names the format
 * (major.minor) and the five versions that decide whether rows can be reused or must be rebuilt.
 */
export function compatKeyOf(formatVersion: string, versions: PackVersions): string {
  const usj = versions.sot?.usjProcessing
  const prepared = versions.prepared?.scripturePrepare
  const quote = versions.quote?.helpsQuote
  const align = versions.align?.helpsAlign
  const text = versions.text?.helpsText
  const missing = [
    ['sot.usjProcessing', usj],
    ['prepared.scripturePrepare', prepared],
    ['quote.helpsQuote', quote],
    ['align.helpsAlign', align],
    ['text.helpsText', text],
  ].filter(([, v]) => v === undefined || v === '')
  if (missing.length) {
    throw new Error(`No compatibility key: the pack lacks ${missing.map(([k]) => k).join(', ')}`)
  }
  const [major, minor] = formatVersion.split('.')
  return `f${major}.${minor}-u${String(usj).replace(/-usj$/, '')}-p${prepared}-q${quote}-a${align}-t${text}`
}

/** Keys sorted at every depth, so two equal objects always serialize to the same text. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Sixteen hex characters of the sha256 of what the pack was built from: Door43's stamps, MACULA's commit and the
 * lexicons' ref. The generator's commit is recorded beside it but left out: tc-study gets commits most days, nearly all
 * unrelated to packs, and a builder change that alters the output bumps the compat key instead (the sample-output
 * check enforces it). `crypto.subtle` works in Bun and browsers.
 */
export async function buildIdOf(build: Omit<PackBuild, 'id' | 'generator'> & { generator?: string }): Promise<string> {
  const { generator: _recorded, ...identifying } = build
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(identifying)))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

export function catalogPath(compat: string, language: string): string {
  return `catalog/${compat}/${language}.json`
}

/** Named by content, so a pack already in the bucket never has to be uploaded or fetched twice. */
export function packPath(compat: string, language: string, sha256: string): string {
  return `packs/${compat}/${language}/${sha256}.langpack.zip`
}

/** The hash is the caller's to compute; the entry only records it with the size. */
export function catalogEntryOf(p: {
  manifest: PackManifest
  compat: string
  build: PackBuild
  bytes: Uint8Array
  sha256: string
  left: Array<{ key: string; why: string }>
  views?: string
  originals?: PackOriginalsRef
}): PackCatalogEntry {
  const { manifest } = p
  const entry: PackCatalogEntry = {
    schema: 1,
    language: manifest.language,
    compat: p.compat,
    build: p.build,
    createdAt: manifest.createdAt,
    pack: { path: packPath(p.compat, manifest.language, p.sha256), bytes: p.bytes.length, sha256: p.sha256 },
    versions: manifest.versions ?? {},
    resources: manifest.resources.map((r) => ({
      key: r.key,
      stamp: r.stamp,
      role: r.role,
      books: r.books ? [...r.books] : [],
      ...(r.subject !== undefined ? { subject: r.subject } : {}),
      ...(r.title !== undefined ? { title: r.title } : {}),
    })),
    left: p.left,
  }
  if (manifest.requires) entry.requires = manifest.requires
  if (p.views) entry.views = p.views
  if (p.originals) entry.originals = { ...p.originals }
  return entry
}
