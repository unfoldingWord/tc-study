/**
 * React-free markdown → hast pipeline (remark-parse + GFM + remark-rehype).
 * Safe for workers / preparers.
 */

import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

export type HastRoot = {
  type: 'root'
  children: unknown[]
  [key: string]: unknown
}

/** Shared preprocess used before parse (escaped chars, [[rc://]] links). */
export function preprocessMarkdown(content: string): string {
  let processed = content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\r/g, '\r')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  processed = processed.replace(/\[\[rc:\/\/([^\]]+)\]\]/g, '[rc://$1](rc://$1)')
  processed = processed.replace(/\[\[(\.\.[^\]]+)\]\]/g, '[$1]($1)')
  return processed
}

/** Light strip of markdown markers for plain-text note bodies. */
export function stripMarkdownLight(text: string): string {
  if (!text) return ''
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function createHastProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
}

// Typed from what it builds: `ReturnType<typeof unified>` is the processor before any plugin, and does not accept it.
let hastProcessor: ReturnType<typeof createHastProcessor> | null = null

function getHastProcessor() {
  if (!hastProcessor) hastProcessor = createHastProcessor()
  return hastProcessor
}

/**
 * Parse markdown to a serializable hast JSON tree.
 */
export async function markdownToHast(content: string): Promise<HastRoot> {
  if (!content) {
    return { type: 'root', children: [] }
  }
  const preprocessed = preprocessMarkdown(content)
  const processor = getHastProcessor()
  const file = await processor.run(processor.parse(preprocessed))
  return file as HastRoot
}

/** Sync variant for preparers (worker-safe). */
export function markdownToHastSync(content: string): HastRoot {
  if (!content) {
    return { type: 'root', children: [] }
  }
  const preprocessed = preprocessMarkdown(content)
  const processor = getHastProcessor()
  return processor.runSync(processor.parse(preprocessed)) as HastRoot
}
