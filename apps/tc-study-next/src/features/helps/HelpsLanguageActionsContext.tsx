/**
 * Read panel-2 actions for CombinedHelps empty CTAs (open picker / select
 * helps language). Studio omits the provider — empty copy still renders.
 */

import { createContext, useContext, type ReactNode } from 'react'

export interface HelpsLanguageActions {
  openHelpsPicker: () => void
  selectHelpsLanguage: (languageCode: string) => void
  /** Full selected helps code (`es-419`), not CombinedHelps' collapsed primary (`es`). */
  selectedLanguageCode?: string | null
}

const HelpsLanguageActionsContext = createContext<HelpsLanguageActions | null>(null)

export function HelpsLanguageActionsProvider({
  value,
  children,
}: {
  value: HelpsLanguageActions | null
  children: ReactNode
}) {
  return (
    <HelpsLanguageActionsContext.Provider value={value}>
      {children}
    </HelpsLanguageActionsContext.Provider>
  )
}

export function useHelpsLanguageActions(): HelpsLanguageActions | null {
  return useContext(HelpsLanguageActionsContext)
}
