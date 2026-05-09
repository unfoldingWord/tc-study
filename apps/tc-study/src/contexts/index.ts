/**
 * Context exports for tc-study
 */

export { AppProvider, useApp, useAnchorResource, useBookTitleSource } from './AppContext'
export {
    CatalogProvider,
    useCatalog,
    useCatalogManager,
    useLoaderRegistry,
    useResourceLoadingService,
    useResourceTypeRegistry,
    useViewerRegistry,
    useBackgroundDownloadManager,
    useCompletenessChecker,
    useCacheAdapter
} from './CatalogContext'
export {
    EntryViewerProvider,
    useEntryViewerRegistry
} from './EntryViewerContext'
export {
    NavigationProvider, useAvailableBooks,
    useCurrentPassageSet, useCurrentReference, useCurrentSectionIndex, useCurrentSections, useHasNavigationSource, useNavigation, useNavigationHistory,
    useNavigationHistoryIndex, useNavigationMode, useNavigationScope, useNavigationStore
} from './NavigationContext'
export type {
    BCVReference, BookInfo, NavigationCatalogScope, NavigationMode, PassageSet, ResourceInfo, ResourceTOC
} from './types'

