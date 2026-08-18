import { describe, expect, test } from 'bun:test'
import { fetchLanguagesForSubjects, type LanguageListClient } from './fetchLanguagesForSubjects'

function recordingClient(
  bySubject: Record<string, Array<{ code: string; name?: string }>>
): { client: LanguageListClient; calls: Array<{ subjects?: string[]; topic?: string }> } {
  const calls: Array<{ subjects?: string[]; topic?: string }> = []
  return {
    calls,
    client: {
      async getLanguages(filters) {
        calls.push({ subjects: filters?.subjects, topic: filters?.topic })
        const subject = filters?.subjects?.[0]
        if (!subject) return [{ code: 'xx', name: 'Unfiltered' }]
        return bySubject[subject] ?? []
      },
    },
  }
}

describe('fetchLanguagesForSubjects', () => {
  test('fans out one getLanguages per subject and unions codes', async () => {
    const { client, calls } = recordingClient({
      Bible: [{ code: 'en', name: 'English' }, { code: 'es', name: 'español' }],
      'Aligned Bible': [{ code: 'en', name: 'English' }, { code: 'hi', name: 'हिन्दी' }],
      'Open Bible Stories': [{ code: 'fr', name: 'français' }],
    })
    const langs = await fetchLanguagesForSubjects(
      client,
      ['Bible', 'Aligned Bible'],
      { stage: 'prod', topic: 'tc-ready' }
    )
    expect(calls).toEqual([
      { subjects: ['Bible'], topic: 'tc-ready' },
      { subjects: ['Aligned Bible'], topic: 'tc-ready' },
    ])
    expect(langs.map((lang) => lang.code).sort()).toEqual(['en', 'es', 'hi'])
    expect(langs.map((lang) => lang.code)).not.toContain('fr')
  })

  test('empty subjects fall back to one unfiltered call (registry not ready)', async () => {
    const { client, calls } = recordingClient({})
    const langs = await fetchLanguagesForSubjects(client, [], {
      stage: 'prod',
      topic: 'tc-ready',
    })
    expect(calls).toEqual([{ subjects: undefined, topic: 'tc-ready' }])
    expect(langs.map((lang) => lang.code)).toEqual(['xx'])
  })
})
