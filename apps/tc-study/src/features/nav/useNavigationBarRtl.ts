import { useAnchorResource, useBookTitleSource } from '../../contexts/AppContext'
import { useReadPathLanguageCode } from '../read/useReadPathLanguageCode'
import { useWizardStore } from '../../lib/stores/wizardStore'
import { resolveNavigationBarRtl } from './resolveNavigationBarRtl'

/**
 * RTL chrome for the navigation bar — text language only (Read URL `:languageCode`).
 * Helps language must not drive the header. Studio (no URL lang) falls back to
 * gateway scripture / anchor (see resolveNavigationBarRtl).
 */
export function useNavigationBarRtl(): boolean {
  const textLanguageCode = useReadPathLanguageCode()
  const anchorResource = useAnchorResource()
  const bookTitleSource = useBookTitleSource()
  const availableLanguages = useWizardStore((s) => s.availableLanguages)

  return resolveNavigationBarRtl({
    anchorResource,
    bookTitleSource,
    availableLanguages,
    textLanguageCode,
  })
}
