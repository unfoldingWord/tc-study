import { describe, expect, test } from 'bun:test'
import {
  handleScriptureKeyDown,
  moveRovingFocus,
  pickEntryItem,
  resolveRovingKey,
  ROVING_ITEM_SELECTOR,
  selectionAnnouncement,
  type RovingItem,
  type ScriptureKeyEvent,
} from './scriptureKeyboardNav'

/** A word or verse-number span: attributes, a vertical box, focus/click log. */
class FakeItem implements RovingItem {
  attrs = new Map<string, string>()
  focused = 0
  clicked = 0
  constructor(
    readonly textContent: string,
    readonly top: number,
    attrs: Record<string, string> = {}
  ) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v)
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }
  removeAttribute(name: string) {
    this.attrs.delete(name)
  }
  hasAttribute(name: string) {
    return this.attrs.has(name)
  }
  focus() {
    this.focused++
  }
  click() {
    this.clicked++
  }
  getBoundingClientRect() {
    return { top: this.top, bottom: this.top + 20 }
  }
}

const word = (text: string, top = 0, attrs: Record<string, string> = {}) =>
  new FakeItem(text, top, { 'data-token-semantic-id': text, ...attrs })
const verse = (n: number, top = 0) =>
  new FakeItem(String(n), top, { 'data-verse-number': String(n), tabindex: '-1' })

function keyEvent(key: string, target: unknown, extra: Partial<ScriptureKeyEvent> = {}) {
  const e = {
    key,
    target,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    prevented: false,
    preventDefault() {
      e.prevented = true
    },
    ...extra,
  }
  return e
}

function scrollport(items: FakeItem[], top = 0, bottom = 100) {
  const selectors: string[] = []
  return {
    selectors,
    querySelectorAll(selector: string) {
      selectors.push(selector)
      return items
    },
    getBoundingClientRect: () => ({ top, bottom }),
  }
}

function run(
  e: ReturnType<typeof keyEvent>,
  container: ReturnType<typeof scrollport>,
  rtl = false
) {
  const calls = { pane: 0, activated: [] as RovingItem[] }
  handleScriptureKeyDown(e, container, {
    rtl,
    onActivatePane: () => calls.pane++,
    onActivated: (item) => calls.activated.push(item),
  })
  return calls
}

describe('resolveRovingKey', () => {
  // v1 a b v2 c d
  const flags = [true, false, false, true, false, false]

  test('Right/Left follow reading order and stop at the ends', () => {
    expect(resolveRovingKey('ArrowRight', 1, flags, false)).toEqual({ kind: 'move', index: 2 })
    expect(resolveRovingKey('ArrowLeft', 1, flags, false)).toEqual({ kind: 'move', index: 0 })
    expect(resolveRovingKey('ArrowLeft', 0, flags, false)).toBeNull()
    expect(resolveRovingKey('ArrowRight', 5, flags, false)).toBeNull()
  })

  test('RTL swaps Left and Right (Left reads on)', () => {
    expect(resolveRovingKey('ArrowLeft', 1, flags, true)).toEqual({ kind: 'move', index: 2 })
    expect(resolveRovingKey('ArrowRight', 1, flags, true)).toEqual({ kind: 'move', index: 0 })
  })

  test('Down/Up jump between verse numbers', () => {
    expect(resolveRovingKey('ArrowDown', 1, flags, false)).toEqual({ kind: 'move', index: 3 })
    expect(resolveRovingKey('ArrowDown', 3, flags, false)).toBeNull()
    expect(resolveRovingKey('ArrowUp', 4, flags, false)).toEqual({ kind: 'move', index: 3 })
    expect(resolveRovingKey('ArrowUp', 3, flags, false)).toEqual({ kind: 'move', index: 0 })
    expect(resolveRovingKey('ArrowUp', 0, flags, false)).toBeNull()
  })

  test('Home/End go to the ends; Enter and Space activate; others are not ours', () => {
    expect(resolveRovingKey('Home', 4, flags, false)).toEqual({ kind: 'move', index: 0 })
    expect(resolveRovingKey('End', 1, flags, false)).toEqual({ kind: 'move', index: 5 })
    expect(resolveRovingKey('Enter', 1, flags, false)).toEqual({ kind: 'activate' })
    expect(resolveRovingKey(' ', 1, flags, false)).toEqual({ kind: 'activate' })
    expect(resolveRovingKey('a', 1, flags, false)).toBeNull()
  })
})

describe('moveRovingFocus', () => {
  test('one tabindex=0 at a time; a word goes back to no tabindex, a verse number to -1', () => {
    const a = word('a')
    const v = verse(2)
    const b = word('b')
    moveRovingFocus(null, a)
    expect(a.getAttribute('tabindex')).toBe('0')
    expect(a.focused).toBe(1)

    moveRovingFocus(a, v)
    expect(a.hasAttribute('tabindex')).toBe(false)
    expect(v.getAttribute('tabindex')).toBe('0')

    moveRovingFocus(v, b)
    expect(v.getAttribute('tabindex')).toBe('-1')
    expect(b.getAttribute('tabindex')).toBe('0')
    expect(b.focused).toBe(1)
  })
})

describe('pickEntryItem', () => {
  test('first item in view when nothing is focused or selected', () => {
    const items = [word('a', -200), word('b', -100), word('c', 10), word('d', 50), word('e', 300)]
    expect(pickEntryItem(items, 0, 100)).toBe(items[2])
  })

  test('the selected word in view wins over the first in view', () => {
    const items = [word('a', 10), word('b', 40, { 'aria-current': 'true' })]
    expect(pickEntryItem(items, 0, 100)).toBe(items[1])
  })

  test('the last focused item wins while still in view, not once scrolled away', () => {
    const items = [word('a', 10), word('b', 40, { 'aria-current': 'true' }), word('c', 60)]
    items[2].setAttribute('tabindex', '0')
    expect(pickEntryItem(items, 0, 100)).toBe(items[2])
    expect(pickEntryItem(items, 0, 50)).toBe(items[1])
  })

  test('falls back to the first item when none is in view; null when empty', () => {
    const items = [word('a', 500), word('b', 600)]
    expect(pickEntryItem(items, 0, 100)).toBe(items[0])
    expect(pickEntryItem([], 0, 100)).toBeNull()
  })
})

describe('handleScriptureKeyDown', () => {
  test('Tab on the scrollport moves focus to the first word in view', () => {
    const items = [verse(1, -100), word('a', -100), verse(5, 20), word('b', 20)]
    const container = scrollport(items)
    const e = keyEvent('Tab', container)
    run(e, container)
    expect(e.prevented).toBe(true)
    expect(items[2].getAttribute('tabindex')).toBe('0')
    expect(items[2].focused).toBe(1)
    expect(container.selectors).toEqual([ROVING_ITEM_SELECTOR])
  })

  test('Tab hands the tab stop over from a scrolled-away item', () => {
    const items = [word('a', -100), word('b', 20)]
    items[0].setAttribute('tabindex', '0')
    const container = scrollport(items)
    run(keyEvent('Tab', container), container)
    expect(items[0].hasAttribute('tabindex')).toBe(false)
    expect(items[1].getAttribute('tabindex')).toBe('0')
  })

  test('Shift+Tab and Tab with no words are left to the browser', () => {
    const items = [word('a', 20)]
    const container = scrollport(items)
    const back = keyEvent('Tab', container, { shiftKey: true })
    run(back, container)
    expect(back.prevented).toBe(false)

    const empty = scrollport([])
    const tab = keyEvent('Tab', empty)
    run(tab, empty)
    expect(tab.prevented).toBe(false)
  })

  test('Enter/Space on the scrollport itself activate the pane (anchor)', () => {
    const container = scrollport([word('a')])
    const e = keyEvent(' ', container)
    const calls = run(e, container)
    expect(e.prevented).toBe(true)
    expect(calls.pane).toBe(1)
  })

  test('arrows move focus between words and across a verse number', () => {
    const items = [word('a'), verse(5), word('adquieres')]
    const container = scrollport(items)
    run(keyEvent('ArrowRight', items[0]), container)
    expect(items[1].focused).toBe(1)
    run(keyEvent('ArrowRight', items[1]), container)
    expect(items[2].focused).toBe(1)
    expect(items[2].getAttribute('tabindex')).toBe('0')
    expect(items[1].getAttribute('tabindex')).toBe('-1')
  })

  test('in RTL, ArrowLeft reads on', () => {
    const items = [word('א'), word('ב')]
    const container = scrollport(items)
    run(keyEvent('ArrowLeft', items[0]), container, true)
    expect(items[1].focused).toBe(1)
  })

  test('Enter on a word clicks it (the mouse path) and reports it; pane is not activated', () => {
    const items = [word('a'), word('adquieres')]
    const container = scrollport(items)
    const e = keyEvent('Enter', items[1])
    const calls = run(e, container)
    expect(e.prevented).toBe(true)
    expect(items[1].clicked).toBe(1)
    expect(calls.activated).toEqual([items[1]])
    expect(calls.pane).toBe(0)
  })

  test('Space on a verse number clicks it (verse filter)', () => {
    const items = [verse(5), word('a')]
    const container = scrollport(items)
    run(keyEvent(' ', items[0]), container)
    expect(items[0].clicked).toBe(1)
  })

  test('keys it does not own, modified keys and non-item targets are ignored', () => {
    const items = [word('a'), word('b')]
    const container = scrollport(items)
    for (const e of [
      keyEvent('a', items[0]),
      keyEvent('ArrowRight', items[0], { ctrlKey: true }),
      keyEvent('ArrowRight', { other: true }),
      keyEvent('ArrowLeft', items[0]),
    ]) {
      run(e, container)
      expect(e.prevented).toBe(false)
    }
    expect(items[1].focused).toBe(0)
    // Unhandled keys do not even query the DOM.
    expect(container.selectors.length).toBe(2)
  })
})

describe('selectionAnnouncement', () => {
  test('selected / deselected from aria-current; verse numbers say nothing', () => {
    expect(selectionAnnouncement(word('adquieres', 0, { 'aria-current': 'true' }))).toBe(
      'adquieres selected'
    )
    expect(selectionAnnouncement(word('adquieres'))).toBe('adquieres deselected')
    expect(selectionAnnouncement(verse(5))).toBeNull()
  })
})
