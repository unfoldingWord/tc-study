import { describe, expect, test } from 'bun:test'
import { subjectsForCompositionAvailability } from '@bt-synergy/resource-types'
import { combinedHelpsPanelEntry, obsCombinedHelpsPanelEntry } from '../../resourceTypes/combinedHelps'
import { obsTranslationNotesResourceType } from '../../resourceTypes/obsTranslationNotes'
import { obsTranslationWordsLinksResourceType } from '../../resourceTypes/obsTranslationWordsLinks'
import { translationNotesResourceType } from '../../resourceTypes/translationNotes'
import { translationQuestionsResourceType } from '../../resourceTypes/translationQuestions'
import { translationWordsLinksResourceType } from '../../resourceTypes/translationWordsLinks'
import { scriptureResourceType } from '../../resourceTypes/scripture'
import { obsResourceType } from '../../resourceTypes/obs'

const types = [
  scriptureResourceType,
  obsResourceType,
  translationNotesResourceType,
  translationWordsLinksResourceType,
  translationQuestionsResourceType,
  obsTranslationNotesResourceType,
  obsTranslationWordsLinksResourceType,
]

const compositions = [combinedHelpsPanelEntry, obsCombinedHelpsPanelEntry]

describe('subjectsForCompositionAvailability', () => {
  test('CombinedHelps scripture consumes light TN + TWL, not TQ', () => {
    const subjects = subjectsForCompositionAvailability(compositions, types, 'scripture')
    expect(subjects).toEqual(['TSV Translation Notes', 'TSV Translation Words Links'])
    expect(subjects).not.toContain('TSV Translation Questions')
  })

  test('OBS CombinedHelps consumes light OBS TN + TWL variants', () => {
    const subjects = subjectsForCompositionAvailability(compositions, types, 'obs')
    expect(subjects).toEqual([
      'TSV OBS Translation Notes',
      'OBS Translation Notes',
      'TSV OBS Translation Words Links',
      'OBS Translation Words Links',
    ])
  })
})
