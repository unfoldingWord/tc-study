import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TextField } from './TextField'

type TextFieldProps = Parameters<typeof TextField>[0]

function render(props: Partial<TextFieldProps> = {}): string {
  return renderToStaticMarkup(createElement(TextField, { id: 'set-name', label: 'Name', ...props } as TextFieldProps))
}

describe('TextField', () => {
  test("the label's for is the input's id", () => {
    const html = render()
    const labelFor = html.match(/<label[^>]*for="([^"]+)"/)?.[1]
    const inputId = html.match(/<input[^>]*id="([^"]+)"/)?.[1]
    expect(labelFor).toBe('set-name')
    expect(inputId).toBe('set-name')
    expect(html).toContain('>Name</label>')
  })

  test('the label is a tC4 overline', () => {
    const label = render().match(/<label[^>]*>/)?.[0] ?? ''
    for (const cls of ['text-[11px]', 'font-extrabold', 'uppercase', 'tracking-[0.13em]', 'text-fg-muted']) {
      expect(label).toContain(cls)
    }
  })

  test('the input sits on the control ladder with radius 9 and an accent focus ring', () => {
    const input = render().match(/<input[^>]*>/)?.[0] ?? ''
    for (const cls of ['h-9', 'pointer-coarse:h-11', 'rounded-[9px]', 'border', 'border-border', 'bg-surface', 'px-3', 'text-sm', 'ring-accent']) {
      expect(input).toContain(cls)
    }
  })

  test('input attributes pass through to the input', () => {
    const input = render({ type: 'search', placeholder: 'Search...', required: true }).match(/<input[^>]*>/)?.[0] ?? ''
    expect(input).toContain('type="search"')
    expect(input).toContain('placeholder="Search..."')
    expect(input).toContain('required=""')
  })
})
