import { describe, expect, test } from 'bun:test'
import {
  markdownToHast,
  markdownToHastSync,
  stripMarkdownLight,
} from './markdownToHast'

describe('markdownToHast', () => {
  test('parses simple paragraph to hast root', async () => {
    const tree = await markdownToHast('Hello **world**')
    expect(tree.type).toBe('root')
    expect(Array.isArray(tree.children)).toBe(true)
    expect(tree.children.length).toBeGreaterThan(0)
  })

  test('sync and async produce matching root structure', async () => {
    const md = 'Note about [grace](rc://*/tw/dict/bible/kt/grace).'
    const asyncTree = await markdownToHast(md)
    const syncTree = markdownToHastSync(md)
    expect(syncTree.type).toBe('root')
    expect(asyncTree.children.length).toBe(syncTree.children.length)
  })

  test('stripMarkdownLight removes link markup', () => {
    expect(stripMarkdownLight('See [grace](rc://*/tw/dict/bible/kt/grace).')).toBe(
      'See grace.'
    )
  })
})
