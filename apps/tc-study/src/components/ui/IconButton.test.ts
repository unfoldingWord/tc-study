import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IconButton } from './IconButton'
import { expectNoRawPalette } from './noRawPalette.test-helper'

type IconButtonProps = Parameters<typeof IconButton>[0]

function render(props: Partial<IconButtonProps> = {}): string {
  return renderToStaticMarkup(
    createElement(IconButton, { label: 'Close', ...props } as IconButtonProps, createElement('svg'))
  )
}

describe('IconButton', () => {
  test('its accessible name and tooltip are the label', () => {
    const html = render({ label: 'Delete resource' })
    expect(html).toContain('aria-label="Delete resource"')
    expect(html).toContain('title="Delete resource"')
    expect(html).toContain('<svg')
  })

  test('defaults to type="button"', () => {
    expect(render()).toContain('type="button"')
    expect(render({ type: 'submit' })).toContain('type="submit"')
  })

  test('is a radius-8 square on the 30 / 36 / 44 ladder', () => {
    expect(render()).toContain('rounded-md')
    expect(render({ size: 'sm' })).toContain('size-[30px]')
    expect(render()).toContain('size-9')
    expect(render({ size: 'lg' })).toContain('size-11')
  })

  test('reaches the 44 px touch target under pointer: coarse at every size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      expect(render({ size })).toContain('pointer-coarse:size-11')
    }
  })

  test('a className is appended to the base classes, not replacing them', () => {
    const html = render({ className: 'ml-auto' })
    expect(html).toContain('ml-auto')
    expect(html).toContain('rounded-md')
  })

  test('markup avoids raw palette classes at every size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      expectNoRawPalette(render({ size }))
    }
  })
})
