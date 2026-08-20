/**
 * Fan-out `getLanguages` one subject at a time and union by language code.
 * DCS multi-subject queries use AND and can collapse to the Aligned Bible GLs.
 */

import { ORIGINAL_LANGUAGE_CODES } from './languageAvailability'
import type { PickerDoor43Language } from './mergePickerLanguages'

export interface LanguageListClient {
  getLanguages(filters?: {
    subjects?: string[]
    stage?: string
    topic?: string
    limit?: number
  }): Promise<PickerDoor43Language[]>
}

export async function fetchLanguagesForSubjects(
  client: LanguageListClient,
  subjects: readonly string[],
  filter: { stage: string; topic?: string }
): Promise<PickerDoor43Language[]> {
  const pages =
    subjects.length === 0
      ? [await client.getLanguages({ ...filter })]
      : await Promise.all(
          subjects.map((subject) =>
            client.getLanguages({ ...filter, subjects: [subject] })
          )
        )

  const byCode = new Map<string, PickerDoor43Language>()
  for (const lang of pages.flat()) {
    const code = String(lang.code ?? '').trim()
    if (!code || ORIGINAL_LANGUAGE_CODES.has(code)) continue
    if (!byCode.has(code)) byCode.set(code, lang)
  }
  return Array.from(byCode.values())
}
