/** Minimal USJ tree helpers for the spike adapter. */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let s = ''
  for (const c of content) {
    if (typeof c === 'string') s += c
    else if (isRecord(c) && c.type === 'text' && typeof c.content === 'string') {
      s += c.content
    }
  }
  return s
}

/** Walk nested USJ char/note children (unlike `extractText`, which is shallow). */
export function extractDeepText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(extractDeepText).join('')
  if (!isRecord(content)) return ''
  if (content.type === 'text' && typeof content.content === 'string') {
    return content.content
  }
  if (Array.isArray(content.content)) return extractDeepText(content.content)
  if (typeof content.content === 'string') return content.content
  return ''
}

export interface UsjWordHit {
  verseSid: string
  content: string
}

/**
 * Collect `\w` surfaces with verse context.
 * Verse markers are siblings (not parents) of following inline nodes.
 */
export function collectUsjWords(usj: { content?: unknown[] }): UsjWordHit[] {
  const words: UsjWordHit[] = []
  const ctx = { verseSid: '' }

  const walk = (nodes: unknown[]) => {
    for (const n of nodes) {
      if (typeof n === 'string') continue
      if (!isRecord(n)) continue

      if (n.type === 'verse' && typeof n.sid === 'string') {
        ctx.verseSid = n.sid
      }

      if (n.type === 'char' && n.marker === 'w') {
        if (ctx.verseSid) {
          words.push({ verseSid: ctx.verseSid, content: extractText(n.content) })
        }
      }

      if (Array.isArray(n.content)) {
        walk(n.content)
      }
    }
  }

  walk(usj.content ?? [])
  return words
}

export function parseVerseSid(sid: string): {
  bookCode: string
  chapter: number
  verse: number
} | null {
  const m = sid.match(/^(\S+)\s+(\d+):(\d+)$/)
  if (!m) return null
  return { bookCode: m[1], chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) }
}
