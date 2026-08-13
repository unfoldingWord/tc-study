import { describe, expect, test } from 'bun:test'
import { door43LanguageResourceToMetadata } from './door43LanguageResourceToMetadata'

describe('door43LanguageResourceToMetadata', () => {
  test('builds resourceKey and subject fallback', () => {
    const meta = door43LanguageResourceToMetadata(
      {
        owner: 'unfoldingWord',
        language: 'el-x-koine',
        id: 'ugnt',
        title: 'UGNT',
      },
      'Greek New Testament'
    )
    expect(meta.resourceKey).toBe('unfoldingWord/el-x-koine/ugnt')
    expect(meta.subject).toBe('Greek New Testament')
    expect(meta.resourceId).toBe('ugnt')
  })
})
