import { describe, expect, test } from 'bun:test'
import { navItems } from './navItems'

describe('navItems', () => {
  test('does not include Passage Sets until package is wired', () => {
    expect(navItems.some((item) => item.path === '/passage-sets')).toBe(false)
    expect(navItems.some((item) => item.name === 'Passage Sets')).toBe(false)
  })

  test('includes primary surfaces', () => {
    const paths = navItems.map((i) => i.path)
    expect(paths).toContain('/read')
    expect(paths).toContain('/studio')
    expect(paths).toContain('/library')
    expect(paths).toContain('/collections')
    expect(paths).toContain('/settings')
  })
})
