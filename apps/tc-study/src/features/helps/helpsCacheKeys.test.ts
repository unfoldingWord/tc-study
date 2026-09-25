import { describe, expect, test } from 'bun:test'
import {
  HELPS_TEXT_PREFIX,
  helpsTextKey,
  helpsTextResourcePrefix,
  isStaleHelpsTextKey,
  parseHelpsTextStamp,
} from './helpsCacheKeys'

describe('helpsCacheKeys', () => {
  test('builds helps-text keys', () => {
    expect(helpsTextKey('ta-title', 'unfoldingWord/en/ta', 'v45#pub', 'translate/figs-metaphor')).toBe(
      'helps-text:ta-title:unfoldingWord/en/ta@v45#pub:translate/figs-metaphor'
    )
    expect(helpsTextKey('tw-preview', 'unfoldingWord/en/tw', 'v1', 'kt/grace')).toBe(
      'helps-text:tw-preview:unfoldingWord/en/tw@v1:kt/grace'
    )
  })

  test('resource prefix covers every stamp for a kind+resource', () => {
    expect(helpsTextResourcePrefix('tw-title', 'unfoldingWord/en/tw')).toBe(
      'helps-text:tw-title:unfoldingWord/en/tw@'
    )
  })

  test('detects stale stamps on matching keys', () => {
    const key = helpsTextKey('ta-title', 'unfoldingWord/en/ta', 'v44', 'translate/figs-metaphor')
    expect(isStaleHelpsTextKey(key, 'v45')).toBe(true)
    expect(isStaleHelpsTextKey(key, 'v44')).toBe(false)
    expect(isStaleHelpsTextKey('prepared:scripture:x', 'v45')).toBe(false)
  })

  test('parses stamp from key', () => {
    const key = helpsTextKey('tw-title', 'owner/lang/tw', 'v45#2024', 'kt/love')
    expect(parseHelpsTextStamp(key)).toBe('v45#2024')
    expect(parseHelpsTextStamp('other:key')).toBeNull()
    expect(HELPS_TEXT_PREFIX).toBe('helps-text:')
  })
})
