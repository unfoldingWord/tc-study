/**
 * AppContexts - Combined context providers for BT Studio
 * 
 * This component combines all the context providers in the correct order
 * following the architecture layers from ARCHITECTURE.md
 */

import React from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { ResourceModalWrapper } from '../components/modals/ResourceModalWrapper'
import { getAppConfig } from '../config/app-resources'
import { NavigationProvider } from './NavigationContext'
import { ResourceModalProvider } from './ResourceModalContext'
import { WorkspaceProvider } from './WorkspaceContext'

interface AppContextsProps {
  children: React.ReactNode
  initialOwner?: string
  initialLanguage?: string
  initialServer?: string
  initialBook?: string
}

export function AppContexts({ 
  children, 
  initialOwner = getAppConfig().defaultOwner,
  initialLanguage = getAppConfig().defaultLanguage, 
  initialServer = getAppConfig().defaultServer,
  initialBook = getAppConfig().defaultBook
}: AppContextsProps) {
  return (
    <ErrorBoundary>
      <WorkspaceProvider 
        initialOwner={initialOwner}
        initialLanguage={initialLanguage}
        initialServer={initialServer}
      >
        <ErrorBoundary>
          <NavigationProvider initialBook={initialBook}>
            <ResourceModalProvider>
              {children}
              {/* ResourceModal rendered at app level, outside of panels */}
              <ResourceModalWrapper />
            </ResourceModalProvider>
          </NavigationProvider>
        </ErrorBoundary>
      </WorkspaceProvider>
    </ErrorBoundary>
  )
}

// Export individual providers for flexibility
export { NavigationProvider, useAvailableBooks, useCurrentNavigation, useNavigation, useNavigationActions, useNavigationSelector } from './NavigationContext'
export { ResourceModalProvider, useResourceModal } from './ResourceModalContext'
export { useWorkspace, useWorkspaceConfig, useWorkspaceLoading, useWorkspaceResources, useWorkspaceSelector, WorkspaceProvider } from './WorkspaceContext'

