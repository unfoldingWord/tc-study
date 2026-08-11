import { describe, expect, test } from 'bun:test'
import { toPanelResourceMetadata } from './toPanelResourceMetadata'

describe('toPanelResourceMetadata', () => {
  test('maps catalog-like fields into panel filter metadata', () => {
    expect(
      toPanelResourceMetadata({
        type: 'scripture',
        language: 'en',
        owner: 'unfoldingWord',
        subject: 'Bible',
        contentMetadata: { testament: 'nt' },
        tags: ['primary'],
      })
    ).toEqual({
      type: 'scripture',
      language: 'en',
      owner: 'unfoldingWord',
      subject: 'Bible',
      testament: 'NT',
      tags: ['primary'],
      categories: undefined,
      scope: undefined,
    })
  })

  test('merges extras over mapped fields', () => {
    expect(
      toPanelResourceMetadata(
        { type: 'notes', language: 'es' },
        { tags: ['helps'], language: 'en' }
      )
    ).toMatchObject({
      type: 'notes',
      language: 'en',
      tags: ['helps'],
    })
  })
})
