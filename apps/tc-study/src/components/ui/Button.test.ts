import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './Button'
import { expectNoRawPalette } from './noRawPalette.test-helper'

type ButtonProps = Parameters<typeof Button>[0]

function render(props: Partial<ButtonProps> = {}): string {
  return renderToStaticMarkup(createElement(Button, props as ButtonProps, 'Go'))
}

describe('Button', () => {
  test('defaults to a fill pill of tC4 action type, type="button"', () => {
    const html = render()
    expect(html).toContain('type="button"')
    for (const cls of ['rounded-full', 'font-extrabold', 'text-[13.5px]', 'px-5', 'h-9']) {
      expect(html).toContain(cls)
    }
    for (const cls of ['bg-accent-fill', 'text-accent-fill-fg', 'hover:bg-accent-fill-hover', 'active:bg-accent-fill-press']) {
      expect(html).toContain(cls)
    }
    expect(html).toContain('>Go<')
  })

  test('reaches the 44 px touch target under pointer: coarse at both sizes', () => {
    expect(render({ size: 'md' })).toContain('pointer-coarse:h-11')
    const lg = render({ size: 'lg' })
    expect(lg).toContain('h-11')
    expect(lg).not.toContain('h-9')
    expect(lg).toContain('pointer-coarse:h-11')
  })

  test('outline is a 1.5 px helps-border stroke with helps-fg text', () => {
    const html = render({ variant: 'outline' })
    expect(html).toContain('border-[1.5px]')
    expect(html).toContain('border-helps-border')
    expect(html).toContain('text-helps-fg')
    expect(html).not.toContain('bg-accent-fill')
  })

  test('quiet and danger are text actions with a soft hover', () => {
    const quiet = render({ variant: 'quiet' })
    expect(quiet).toContain('text-fg-secondary')
    expect(quiet).toContain('hover:bg-muted')
    const danger = render({ variant: 'danger' })
    expect(danger).toContain('text-danger')
    expect(danger).toContain('hover:bg-danger-soft')
    expect(danger).not.toContain('bg-accent-fill')
  })

  test('no variant uses a raw palette class', () => {
    for (const variant of ['fill', 'outline', 'quiet', 'danger'] as const) {
      expectNoRawPalette(render({ variant }))
    }
  })

  test('an explicit type and the other button props pass through', () => {
    const html = render({ type: 'submit', disabled: true, 'aria-label': 'Send' })
    expect(html).toContain('type="submit"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-label="Send"')
  })

  test('a className is appended to the base classes, not replacing them', () => {
    const html = render({ className: 'w-full' })
    expect(html).toContain('w-full')
    expect(html).toContain('rounded-full')
    expect(html).toContain('bg-accent-fill')
  })
})
