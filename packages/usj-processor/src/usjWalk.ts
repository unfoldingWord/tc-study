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

function provisionalVerseSid(bookCode: string, chapter: number): string {
  if (!bookCode || chapter <= 0) return ''
  return `${bookCode} ${chapter}:1`
}

/**
 * Collect `\w` surfaces with verse context.
 * Verse markers are siblings (not parents) of following inline nodes.
 *
 * Words that appear after `\c` but before the first `\v` (Psalm `\d`
 * superscriptions, etc.) are assigned to `${book} ${chapter}:1` — matching
 * Door43 / TWL convention for those alignments.
 */
export function collectUsjWords(
  usj: { content?: unknown[] },
  bookCodeHint = ''
): UsjWordHit[] {
  const words: UsjWordHit[] = []
  const ctx = {
    bookCode: bookCodeHint.trim(),
    chapter: 0,
    verseSid: '',
  }

  const activeSid = () =>
    ctx.verseSid || provisionalVerseSid(ctx.bookCode, ctx.chapter)

  const walk = (nodes: unknown[]) => {
    for (const n of nodes) {
      if (typeof n === 'string') continue
      if (!isRecord(n)) continue

      if (n.type === 'book' && typeof n.code === 'string' && n.code.trim()) {
        ctx.bookCode = n.code.trim()
      }

      if (n.type === 'chapter') {
        const num =
          typeof n.number === 'number'
            ? n.number
            : parseInt(String(n.number ?? ''), 10)
        if (Number.isFinite(num)) {
          ctx.chapter = num
          // New chapter: clear prior verse; provisional sid applies until `\v`.
          ctx.verseSid = ''
        }
      }

      if (n.type === 'verse' && typeof n.sid === 'string') {
        ctx.verseSid = n.sid
        const parsed = parseVerseSid(n.sid)
        if (parsed) {
          ctx.bookCode = parsed.bookCode
          ctx.chapter = parsed.chapter
        }
      }

      if (n.type === 'char' && n.marker === 'w') {
        const sid = activeSid()
        if (sid) {
          words.push({ verseSid: sid, content: extractText(n.content) })
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
