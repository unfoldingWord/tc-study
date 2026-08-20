import { useLocation } from 'react-router-dom'
import { languageCodeFromReadPathname } from './readBootstrapPolicy'
import { getReadLocationPathname } from './replaceReadUrlFromUi'

/** Panel-1 / navigation language from the live Read path (replaceState-safe). */
export function useReadPathLanguageCode(): string | undefined {
  useLocation()
  return languageCodeFromReadPathname(getReadLocationPathname()) ?? undefined
}
