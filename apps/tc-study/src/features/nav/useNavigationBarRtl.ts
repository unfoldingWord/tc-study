import { useAnchorResource, useBookTitleSource } from '../../contexts/AppContext'
import { useWizardStore } from '../../lib/stores/wizardStore'
import { resolveNavigationBarRtl } from './resolveNavigationBarRtl'

/** RTL chrome for the navigation bar — gateway language only (see resolveNavigationBarRtl). */
export function useNavigationBarRtl(): boolean {
  const anchorResource = useAnchorResource()
  const bookTitleSource = useBookTitleSource()
  const availableLanguages = useWizardStore((s) => s.availableLanguages)

  return resolveNavigationBarRtl({
    anchorResource,
    bookTitleSource,
    availableLanguages,
  })
}
