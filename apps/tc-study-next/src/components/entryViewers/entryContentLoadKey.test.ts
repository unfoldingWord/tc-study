import { describe, expect, test } from 'bun:test'
import { entryContentLoadKey } from './entryContentLoadKey'

describe('entryContentLoadKey', () => {
  test('is stable for the same resourceKey + entryId', () => {
    expect(entryContentLoadKey('unfoldingWord/en/ta', 'translate/writing-newevent')).toBe(
      'unfoldingWord/en/ta#translate/writing-newevent'
    )
    expect(
      entryContentLoadKey('unfoldingWord/en/ta', 'translate/writing-newevent')
    ).toBe(entryContentLoadKey('unfoldingWord/en/ta', 'translate/writing-newevent'))
  })

  test('changes only when resourceKey or entryId changes (not metadata identity)', () => {
    const keyA = entryContentLoadKey('u/en/ta', 'translate/writing-newevent')
    // Simulate parent rebuilding a new metadata object each render — load key must ignore it.
    const metadataRender1 = { title: 'Translation Academy', type: 'academy' }
    const metadataRender2 = { title: 'Translation Academy', type: 'academy' }
    expect(metadataRender1).not.toBe(metadataRender2)

    const keyB = entryContentLoadKey('u/en/ta', 'translate/writing-newevent')
    expect(keyA).toBe(keyB)

    expect(entryContentLoadKey('u/en/ta', 'translate/figs-metaphor')).not.toBe(keyA)
    expect(entryContentLoadKey('u/es/ta', 'translate/writing-newevent')).not.toBe(keyA)
  })
})
