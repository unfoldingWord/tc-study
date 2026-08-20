import { describe, expect, test } from 'bun:test'
import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BookPicker } from './BookPicker'

describe('BookPicker', () => {
  test('uses one column on narrow viewports and five from md up', () => {
    const src = readFileSync(join(import.meta.dir, 'BookPicker.tsx'), 'utf8')
    expect(src).toContain('grid grid-cols-1 md:grid-cols-5 gap-2')
    expect(src).toContain('min-w-0')
    expect(src).not.toContain('grid-cols-3')
    expect(src).not.toContain('truncate')
  })

  test('keeps book name and code on each card', () => {
    const html = renderToStaticMarkup(
      createElement(BookPicker, {
        books: [{ code: 'gen', name: 'Genesis', testament: 'OT' }],
        selectedBook: 'gen',
        selectedBookRef: createRef<HTMLButtonElement>(),
        bookTitleSource: null,
        onSelectBook: () => {},
      })
    )
    expect(html).toContain('Genesis')
    expect(html).toContain('gen')
    expect(html).toContain('min-w-0')
  })
})
