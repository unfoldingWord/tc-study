/**
 * UGNT and UHB as the Read page finds them in the Door43 catalog. Apart from `originalLanguage`, which the
 * workers import, so these constants stay out of the worker bundles.
 */

/** The two original-language scriptures as the Read page searches the Door43 catalog for them. */
export interface OriginalLanguageSpec {
  lang: 'el-x-koine' | 'hbo'
  id: 'ugnt' | 'uhb'
  label: 'UGNT' | 'UHB'
  subject: 'Greek New Testament' | 'Hebrew Old Testament'
}

export const ORIGINAL_LANGUAGE_SPECS: readonly OriginalLanguageSpec[] = [
  { lang: 'el-x-koine', id: 'ugnt', label: 'UGNT', subject: 'Greek New Testament' },
  { lang: 'hbo', id: 'uhb', label: 'UHB', subject: 'Hebrew Old Testament' },
]

export const UGNT_RESOURCE_KEY = 'unfoldingWord/el-x-koine/ugnt'
export const UHB_RESOURCE_KEY = 'unfoldingWord/hbo/uhb'

export function originalLanguageResourceKey(spec: OriginalLanguageSpec): string {
  return `unfoldingWord/${spec.lang}/${spec.id}`
}

export const ORIGINAL_LANGUAGE_RESOURCE_KEYS: readonly string[] = ORIGINAL_LANGUAGE_SPECS.map(
  (orig) => originalLanguageResourceKey(orig)
)
