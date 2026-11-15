/**
 * One OBS owner per language. The stories come from the catalog's `prod` OBS of the Bible pack's owner, else from the
 * language's `prod` OBS of any owner (several: the most recent `prod` release; a tie: the owner name in code-point
 * order). Each OBS help (notes, questions, word links) comes from the owner of the chosen stories, else by the same
 * fallback. Nothing here needs the `tc-ready` topic.
 */

import { catalogHitRelease } from './catalogHits'
import { catalogIdentity, type CatalogEntry } from './readCatalogIdentity'

/** A Door43 catalog search hit, as `searchCatalog` returns it. */
export type CatalogHit = CatalogEntry

export type ObsKind = 'stories' | 'notes' | 'questions' | 'links'

export type ObsPick = {
  stories?: CatalogHit
  notes?: CatalogHit
  questions?: CatalogHit
  links?: CatalogHit
  /** One line per kind, in the order stories, notes, questions, links: `owner/repo@tag` or `none in the catalog`. */
  lines: string[]
}

const KINDS: readonly ObsKind[] = ['stories', 'notes', 'questions', 'links']

/** The OBS kind a catalog subject names, if any (`TSV OBS Translation Notes`, `OBS Translation Notes`, …). */
export function obsKindOfSubject(subject: string): ObsKind | undefined {
  if (/^open bible stories$/i.test(subject.trim())) return 'stories'
  if (!/\bOBS\b/i.test(subject)) return undefined
  if (/words?\s+links?/i.test(subject)) return 'links'
  if (/questions/i.test(subject)) return 'questions'
  if (/notes/i.test(subject)) return 'notes'
  return undefined
}

type Candidate = { hit: CatalogHit; owner: string; repo: string; tag: string; published: string }

function candidateOf(hit: CatalogHit): Candidate | undefined {
  const id = catalogIdentity(hit, '')
  if (!id) return undefined
  const release = catalogHitRelease(id)
  if (!release?.tag_name) return undefined
  return { hit, owner: id.ownerStr, repo: id.repoName, tag: release.tag_name, published: release.published_at ?? '' }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Most recent release first; then owner, then repository, in code-point order. */
function best(candidates: Candidate[]): Candidate | undefined {
  return [...candidates].sort((a, b) => cmp(b.published, a.published) || cmp(a.owner, b.owner) || cmp(a.repo, b.repo))[0]
}

export function pickObs(hits: CatalogHit[], bibleOwner: string | undefined): ObsPick {
  const byKind: Record<ObsKind, Candidate[]> = { stories: [], notes: [], questions: [], links: [] }
  for (const hit of hits) {
    const id = catalogIdentity(hit, '')
    const kind = id ? obsKindOfSubject(id.subject) : undefined
    const candidate = kind ? candidateOf(hit) : undefined
    if (kind && candidate) byKind[kind].push(candidate)
  }

  const choose = (kind: ObsKind, owner: string | undefined): Candidate | undefined => {
    const own = owner === undefined ? [] : byKind[kind].filter((c) => c.owner === owner)
    return best(own) ?? best(byKind[kind])
  }

  const stories = choose('stories', bibleOwner)
  const storyOwner = stories?.owner ?? bibleOwner
  const picked: Record<ObsKind, Candidate | undefined> = {
    stories,
    notes: choose('notes', storyOwner),
    questions: choose('questions', storyOwner),
    links: choose('links', storyOwner),
  }

  const pick: ObsPick = { lines: [] }
  for (const kind of KINDS) {
    const c = picked[kind]
    if (c) pick[kind] = c.hit
    pick.lines.push(c ? `${c.owner}/${c.repo}@${c.tag}` : 'none in the catalog')
  }
  return pick
}
