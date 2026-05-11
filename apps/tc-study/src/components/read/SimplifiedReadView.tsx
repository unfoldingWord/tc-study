/**
 * Simplified Read View
 * 
 * A simplified version of the Studio for reading resources
 * - No sidebar, no drag-and-drop
 * - Language picker to auto-load all tc-ready resources
 * - Two-panel layout with navigation (same as Studio)
 */

import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { verifyResourceContents } from '../../lib/services/ResourceContentVerifier'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    TouchSensor,
    pointerWithin,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import {
    LinkedPanel,
    LinkedPanelsContainer,
    createDefaultPluginRegistry,
    type LinkedPanelsConfig,
} from 'linked-panels'
import { CheckCircle2, Loader2, Package, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  useCacheAdapter,
  useCatalogManager,
  useCompletenessChecker,
  useCurrentPassageSet,
  useCurrentReference,
  useCurrentSections,
  useCurrentSectionIndex,
  useNavigation,
  useNavigationMode,
  useNavigationScope,
  useNavigationStore,
  useResourceTypeRegistry,
  useViewerRegistry,
} from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useBackgroundDownload, useCatalogBackgroundDownload, useResourceManagement, useStudioResources, useSwipeGesture } from '../../hooks'
import { createResourceMetadata, mapContentFormat, mapSubjectToResourceType } from '../../lib/services/ResourceMetadataFactory'
import { usePackageStore } from '../../lib/stores/packageStore'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
    entryLinkClickPlugin,
    linkClickPlugin,
    notesTokenGroupsPlugin,
    obsFrameHighlightPlugin,
    obsFrameQuotesPlugin,
    scriptureContentRequestPlugin,
    scriptureContentResponsePlugin,
    scriptureTokensBroadcastPlugin,
    tokenClickPlugin,
    verseFilterPlugin,
} from '../../plugins/messageTypePlugins'
import { useStudyStore } from '../../store/studyStore'
import type { ExportWorkerMessage, ExportWorkerResponse } from '../../workers/collectionExport.worker'
import { CollectionImportDialog } from '../collections/CollectionImportDialog'
import { EntryResourceModal } from '../common/EntryResourceModal'
import { COMBINED_HELPS_IDS, CombinedHelpsViewer, COMBINED_HELPS_RESOURCE_ID, FallbackViewer, OBS_COMBINED_HELPS_RESOURCE_ID } from '../resources'
import { DroppablePanel } from '../studio/DroppablePanel'
import { EmptyPanelState } from '../studio/EmptyPanelState'
import { GlobalSignalBridge } from '../studio/GlobalSignalBridge'
import { NavigationBar } from '../studio/NavigationBar'
import { PanelHeader } from '../studio/PanelHeader'
import { DownloadIndicator } from './DownloadIndicator'
import {
  buildReadPath,
  buildReadRouteTailFromNavigation,
  findPassageSetByNavSlug,
  navigationModeFromReadNav,
  navigationScopeFromResourceType,
  parseBibleNavRef,
  parseBibleSectionNavRef,
  parseObsFrameNavRef,
  parseObsStoryNavRef,
  type PartialRouteHint,
  type ReadRouteTail,
} from '../../utils/readRoutes'

/** Set to true to disable automatic background downloads (e.g. for debugging). */
const DISABLE_BACKGROUND_DOWNLOAD = false

function primaryLangSegment(code: string): string {
  return String(code || '')
    .trim()
    .split(/[-_/]/)[0]!
    .toLowerCase()
}

/**
 * Resolve TN/TWL catalog keys from the app store right after Phase 1 load.
 * scope='scripture' returns scripture-TN + scripture-TWL keys.
 * scope='obs' returns OBS-TN + OBS-TWL keys.
 */
function findHelpsKeysForScope(
  langCode: string,
  scope: 'scripture' | 'obs'
): { tnKey?: string; twlKey?: string } {
  const loaded = useAppStore.getState().loadedResources
  const want = primaryLangSegment(langCode)
  let tnKey: string | undefined
  let twlKey: string | undefined
  const list = Object.values(loaded).filter(Boolean) as ResourceInfo[]

  // Type IDs expected for each scope
  const tnTypes = scope === 'obs' ? ['obs-notes'] : ['notes', 'tn']
  const twlTypes = scope === 'obs' ? ['obs-words-links'] : ['words-links', 'words_links', 'twl']

  const keyMatchesLang = (key: string) => {
    if (!want) return true
    const seg = primaryLangSegment(key.split('/')[1] || '')
    return seg === want
  }

  for (const r of list) {
    const key = r.key || r.id
    if (!key || COMBINED_HELPS_IDS.has(key)) continue
    const t = String(r.type).toLowerCase()
    if (!keyMatchesLang(key)) continue
    if (tnTypes.includes(t) && !tnKey) tnKey = key
    if (twlTypes.includes(t) && !twlKey) twlKey = key
  }

  // Fallback: constrain by resource key path to avoid cross-language matches
  for (const r of list) {
    const key = r.key || r.id
    if (!key || COMBINED_HELPS_IDS.has(key)) continue
    if (want && !keyMatchesLang(key)) continue
    const t = String(r.type).toLowerCase()
    if (!tnKey && tnTypes.includes(t)) tnKey = key
    if (!twlKey && twlTypes.includes(t)) twlKey = key
  }

  return { tnKey, twlKey }
}

/** @deprecated Use findHelpsKeysForScope instead. */
function findTnTwlKeysForLanguage(langCode: string): { tnKey?: string; twlKey?: string } {
  return findHelpsKeysForScope(langCode, 'scripture')
}

/**
 * Derive the reading scope for a resource key:
 * - 'scripture': scripture resources + scripture-companion helps
 * - 'obs': OBS resources + OBS-companion helps
 * - null: shared resources (TW, TA) or unknown types (show in both scopes)
 *
 * The combined-helps IDs have fixed scopes encoded in their ID.
 */
function getResourceAppliesToScope(
  resourceKey: string,
  loadedResources: Record<string, ResourceInfo | undefined>,
  resourceTypeRegistry: { getTypeForSubject: (s: string) => string | undefined; getScopeForType: (id: string) => string | null }
): string | null {
  if (resourceKey === COMBINED_HELPS_RESOURCE_ID) return 'scripture'
  if (resourceKey === OBS_COMBINED_HELPS_RESOURCE_ID) return 'obs'

  const resource = loadedResources[resourceKey]
  if (!resource) return null

  if (resource.appliesToScope === 'shared') return null
  if (resource.appliesToScope === 'scripture' || resource.appliesToScope === 'obs') {
    return resource.appliesToScope
  }

  const subject = resource.subject || resource.category || ''
  const typeId = resourceTypeRegistry.getTypeForSubject(subject)
  if (!typeId) return null

  return resourceTypeRegistry.getScopeForType(typeId)
}

/**
 * Returns false only when we can positively determine that a book-structured resource
 * does NOT contain the given book. Returns true (show) when:
 *   - the resource is entry-structured (TW, TA, etc.)
 *   - the resource is a combined-helps virtual resource (no ingredients of its own)
 *   - ingredients / toc are not yet loaded (fail-open while async load is in progress)
 *   - the book IS present in the resource's ingredients or toc
 */
function resourceSupportsBook(
  resourceKey: string,
  loadedResources: Record<string, ResourceInfo | undefined>,
  bookCode: string
): boolean {
  // Combined-helps are virtual — no book-level ingredients, always show
  if (resourceKey === COMBINED_HELPS_RESOURCE_ID || resourceKey === OBS_COMBINED_HELPS_RESOURCE_ID) {
    return true
  }
  // OBS is not book-structured in the scripture sense
  if (bookCode === 'obs') return true

  const resource = loadedResources[resourceKey]
  if (!resource) return true // not yet in store — fail open

  const code = bookCode.toLowerCase()

  // verifiedIngredients is the authoritative source when present.
  // Check it BEFORE the entry-structured guard so that book-companion resources
  // (TN, TWL, TQ) that were verified can be correctly hidden when their book is
  // absent from the published ref, even though their contentStructure is 'entry'.
  //
  // Sentinel semantics:
  //   undefined  → never processed; fall through to other checks (fail-open)
  //   []         → processed, book absent from ref → hide
  //   [...]      → processed, check if this book is in the confirmed list
  if (resource.verifiedIngredients !== undefined) {
    return resource.verifiedIngredients.some(
      (ing) => ing.identifier?.toLowerCase() === code
    )
  }

  // Entry-structured resources (TW, TA) without verification data — always show
  const structure = resource.contentStructure ?? (resource as any).contentMetadata?.contentStructure
  if (structure && structure !== 'book') return true

  // Fall back to flattened ingredients (populated by catalog fetch)
  const ingredients = resource.ingredients ?? (resource as any).contentMetadata?.ingredients
  if (ingredients && ingredients.length > 0) {
    return ingredients.some(
      (ing: { identifier?: string }) =>
        ing.identifier?.toLowerCase() === code
    )
  }

  // Check runtime toc.books (set by ScriptureViewer/useTOC)
  const tocBooks = resource.toc?.books
  if (tocBooks && tocBooks.length > 0) {
    return tocBooks.some((b) => b.code?.toLowerCase() === code)
  }

  // No book info loaded yet — fail open (don't hide while still loading)
  return true
}

/**
 * Renders a panel resource by id. Subscribes only to loadedResources[resourceId],
 * so metadata updates for other resources do not cause this panel to re-render.
 * Used to keep panelConfig stable when loadedResources changes.
 */
function ResourcePanelByKey({
  resourceId,
  viewerRegistry,
  onEntryLinkClick,
}: {
  resourceId: string
  viewerRegistry: ReturnType<typeof useViewerRegistry>
  onEntryLinkClick: (resourceId: string, entryId?: string) => void
}) {
  const resource = useAppStore((s) => s.loadedResources[resourceId])
  if (!resource) {
    return (
      <div className="h-full flex items-center justify-center" role="status" aria-label="Loading resource">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }
  const resourceKey = resource.key || resource.id
  const resourceMetadata = {
    type: resource.type,
    subject: resource.subject,
    resourceId: resource.id,
    key: resourceKey,
    title: resource.title,
    language: resource.language,
    owner: resource.owner,
  } as any
  let ViewerComponent = viewerRegistry.getViewer(resourceMetadata)
  if (!ViewerComponent && resource.type) {
    ViewerComponent = viewerRegistry.getViewerByType(resource.type)
  }
  if (ViewerComponent) {
    const viewerProps: any = {
      resourceId: resource.id,
      resourceKey,
      resource,
    }
    const typeStr = String(resource.type || '').toLowerCase()
    if (
      typeStr === 'words' ||
      typeStr === 'words-links' ||
      resource.category === 'words-links' ||
      typeStr === 'twl' ||
      typeStr === 'academy' ||
      typeStr === 'ta' ||
      typeStr === 'tn' ||
      typeStr === 'notes' ||
      typeStr === 'obs-notes' ||
      typeStr === 'obs-words-links' ||
      typeStr === 'combined-helps'
    ) {
      viewerProps.onEntryLinkClick = onEntryLinkClick
    }
    return <ViewerComponent {...viewerProps} />
  }
  return (
    <FallbackViewer
      resourceId={resource.id}
      resourceKey={resourceKey}
      resourceType={resource.type}
    />
  )
}

interface SimplifiedReadViewProps {
  initialLanguage?: string
  /** True when the URL is `/read` without `:languageCode` — language modal opens and cannot be skipped. */
  requireLanguageInUrl?: boolean
  /** Deep link: `/read/{lang}/bible|obs/{navType}/{navRef}` */
  readRouteTail?: ReadRouteTail | null
  /** Partial deep link: `/read/{lang}/bible|obs[/{navType}]` — sets scope (and mode when navType is present) without overriding the current reference. */
  partialRouteHint?: PartialRouteHint
}

export function SimplifiedReadView({
  initialLanguage,
  requireLanguageInUrl = false,
  readRouteTail = null,
  partialRouteHint,
}: SimplifiedReadViewProps = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const catalogManager = useCatalogManager()
  const cacheAdapter = useCacheAdapter()
  const viewerRegistry = useViewerRegistry()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const navigation = useNavigation()
  const navigationScope = useNavigationScope()
  const navigationMode = useNavigationMode()
  const currentNavRef = useCurrentReference()
  const currentPassageSet = useCurrentPassageSet()
  const currentSectionIndex = useCurrentSectionIndex()
  const currentSections = useCurrentSections()

  // Experimental Read-only: combined TN + TWL viewer (synthetic resource type)
  useEffect(() => {
    if (!viewerRegistry.hasViewer('combined-helps')) {
      viewerRegistry.registerViewer({
        resourceType: 'combined-helps',
        displayName: 'Helps',
        component: CombinedHelpsViewer as any,
        canHandle: (metadata: { type?: string }) => metadata?.type === 'combined-helps',
      })
    }
  }, [viewerRegistry])
  const loadedResources = useAppStore((s) => s.loadedResources)
  const completenessChecker = useCompletenessChecker()
  const packageStore = usePackageStore()
  
  // Use workspace store for panel management
  const assignResourceToPanel = useWorkspaceStore((s) => s.assignResourceToPanel)
  const setActiveResourceInPanel = useWorkspaceStore((s) => s.setActiveResourceInPanel)
  const getPanel = useWorkspaceStore((s) => s.getPanel)
  const removeResourceFromPanel = useWorkspaceStore((s) => s.removeResourceFromPanel)
  
  // Use resource management hook for adding resources
  const { addResource } = useResourceManagement()
  
  // Resource management hooks for both panels
  const panel1Resources = useStudioResources('panel-1')
  const panel2Resources = useStudioResources('panel-2')
  
  // Navigation state
  const [navState, setNavState] = useState<'dismissed' | 'compact'>('compact')
  
  // Panel split state (percentage for panel 1)
  const [panel1Width, setPanel1Width] = useState(50)
  const [isResizingPanels, setIsResizingPanels] = useState(false)
  const [resizeStartLayout, setResizeStartLayout] = useState<'vertical' | 'horizontal'>('horizontal')
  const resizeContainerRef = useRef<HTMLDivElement>(null)
  
  // Loading state
  const [isLoadingResources, setIsLoadingResources] = useState(false)
  
  // Expected resources from catalog search (for deterministic background download waiting)
  const [expectedResources, setExpectedResources] = useState<string[]>([])
  
  // Track metadata updates to trigger background download check
  // Increments each time metadata is added to catalog in Phase 2
  const [metadataUpdateCounter, setMetadataUpdateCounter] = useState(0)
  
  // Debug: Log metadata updates
  useEffect(() => {
    if (metadataUpdateCounter > 0) {
      console.log(`[BG-DL] 📊 Metadata update #${metadataUpdateCounter} - triggering background download check`)
    }
  }, [metadataUpdateCounter])
  
  // Language picker: always open on `/read` until the user picks a language (navigates to `/read/:code`)
  const [shouldAutoOpenLanguagePicker, setShouldAutoOpenLanguagePicker] = useState(requireLanguageInUrl)

  useEffect(() => {
    setShouldAutoOpenLanguagePicker(requireLanguageInUrl)
  }, [requireLanguageInUrl])

  const suppressUrlSyncRef = useRef(false)
  const readRouteAppliedSigRef = useRef<string | null>(null)
  const pendingSectionRef = useRef<{ book: string; section1Based: number } | null>(null)

  useEffect(() => {
    if (!readRouteTail) readRouteAppliedSigRef.current = null
  }, [readRouteTail])

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null)
  /** Track which panel (if any) is being hovered over during cross-panel drag */
  const [hoverPanelId, setHoverPanelId] = useState<string | null>(null)
  /** Track the drop target index for placeholder positioning */
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  
  // Collection dialog state
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  
  // Track current language and collection cache status
  const [currentLanguageCode, setCurrentLanguageCode] = useState<string | null>(initialLanguage || null)
  const [isCollectionFullyCached, setIsCollectionFullyCached] = useState(false)

  // Apply `/read/{lang}/bible|obs[/{navType}]` (no navRef) — switch scope and optionally mode.
  // The URL-sync effect will then rewrite the URL to the full canonical form.
  const partialHintAppliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!partialRouteHint) return
    if (!currentLanguageCode || isLoadingResources) return
    const sig = `${partialRouteHint.resourceType}|${partialRouteHint.navType ?? ''}`
    if (partialHintAppliedRef.current === sig) return
    partialHintAppliedRef.current = sig
    navigation.setNavigationScope(navigationScopeFromResourceType(partialRouteHint.resourceType))
    if (partialRouteHint.navType) {
      const mode = navigationModeFromReadNav(partialRouteHint.resourceType, partialRouteHint.navType)
      if (mode) navigation.setNavigationMode(mode)
    }
  }, [partialRouteHint, currentLanguageCode, isLoadingResources, navigation])

  // Apply `/read/:lang/bible|obs/:navType/:navRef` once resources are ready
  useEffect(() => {
    if (!readRouteTail) {
      pendingSectionRef.current = null
      return
    }
    const sig = `${readRouteTail.resourceType}|${readRouteTail.navType}|${readRouteTail.navRef}`
    if (readRouteAppliedSigRef.current === sig) return
    if (!currentLanguageCode || isLoadingResources) return

    suppressUrlSyncRef.current = true
    let cancelled = false

    const run = async () => {
      try {
        const rt = readRouteTail.resourceType
        const mode = navigationModeFromReadNav(rt, readRouteTail.navType)
        if (!mode) {
          console.warn('[read route] Unknown nav type for resource', readRouteTail)
          readRouteAppliedSigRef.current = sig
          return
        }

        navigation.setNavigationScope(navigationScopeFromResourceType(rt))
        navigation.setNavigationMode(mode)

        if (rt === 'obs') {
          const nt = readRouteTail.navType.toLowerCase()
          if (nt === 'story') {
            const ref = parseObsStoryNavRef(readRouteTail.navRef)
            if (ref) navigation.navigateToReference(ref)
          } else if (nt === 'ref') {
            const ref = parseObsFrameNavRef(readRouteTail.navRef)
            if (ref) navigation.navigateToReference(ref)
          }
        } else {
          const nt = readRouteTail.navType.toLowerCase()
          if (nt === 'passage') {
            const set = await findPassageSetByNavSlug(readRouteTail.navRef)
            if (cancelled) return
            if (set) navigation.loadPassageSet(set)
            else console.warn('[read route] Passage set not found:', readRouteTail.navRef)
          } else if (nt === 'section') {
            const parsed = parseBibleSectionNavRef(readRouteTail.navRef)
            if (parsed) {
              pendingSectionRef.current = { book: parsed.book, section1Based: parsed.section1Based }
              navigation.navigateToReference({ book: parsed.book, chapter: 1, verse: 1 })
            } else {
              console.warn('[read route] Invalid section nav ref', readRouteTail.navRef)
            }
          } else {
            const parsed = parseBibleNavRef(readRouteTail.navRef)
            if (parsed) navigation.navigateToReference(parsed.ref)
            else console.warn('[read route] Invalid bible nav ref', readRouteTail.navRef)
          }
        }

        readRouteAppliedSigRef.current = sig
      } finally {
        if (!cancelled) {
          requestAnimationFrame(() => {
            suppressUrlSyncRef.current = false
          })
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [readRouteTail, currentLanguageCode, isLoadingResources, navigation])

  // Pre-fetch catalog ingredients for book-structured resources that are missing them,
  // then verify which ingredients actually exist at the published ref (git/trees check).
  // This hydrates `ResourceInfo.ingredients` and `ResourceInfo.verifiedIngredients` so
  // the per-book tab filter in `resourceSupportsBook` / `filteredPanel*Keys` can hide tabs.
  //
  // Performance notes:
  // - `toProcess` only includes resources not yet verified, so the effect is a no-op
  //   after the first pass once all resources are verified.
  // - We pass `knownRef` (from ResourceMetadata.release.tag_name) directly to the
  //   verifier, avoiding a redundant findRepository network call per resource.
  // - The verifyCache in ResourceContentVerifier deduplicates concurrent calls for
  //   the same resource.
  useEffect(() => {
    // Include only book-structured scripture resources that have NEVER been through the
    // verification pipeline. `verifiedIngredients === undefined` (not just falsy) is the
    // sentinel: once written (even as []) the resource is permanently excluded from future
    // runs, preventing the Immer-write → loadedResources-change → effect-re-run loop.
    //
    // Exclude OBS resources explicitly: "Open Bible Stories" contains the word "bible" and
    // would otherwise match the subject substring check, causing unnecessary write cycles.
    const toProcess = Object.values(loadedResources).filter((r): r is ResourceInfo => {
      if (!r) return false
      const subjectLower = String(r.subject ?? '').toLowerCase()
      const typeLower = String(r.type ?? '').toLowerCase()
      // Bible-scope book-companion types (notes=TN, words-links=TWL, questions=TQ)
      // have per-book files and need verification, but their contentStructure is 'entry'.
      // Only skip OBS variants of these types.
      const isBibleBookCompanion =
        (typeLower === 'notes' || typeLower === 'words-links' || typeLower === 'questions') &&
        !subjectLower.includes('obs') &&
        !subjectLower.includes('open bible stories')
      const isBookStructured =
        isBibleBookCompanion ||
        r.contentStructure === 'book' ||
        String(r.category).toLowerCase() === 'scripture' ||
        typeLower === 'scripture' ||
        // Match scripture/bible subjects but not "Open Bible Stories"
        (subjectLower.includes('bible') && !subjectLower.includes('open bible stories'))
      if (!isBookStructured) return false
      // Sentinel: undefined = never processed; [] or non-empty = already attempted
      return r.verifiedIngredients === undefined
    })
    if (!toProcess.length) return

    const door43Client = getDoor43ApiClient()
    let cancelled = false

    void Promise.all(
      toProcess.map(async (r) => {
        const k = r.key ?? r.id
        // Step 1: read from local catalog (no network). Populates ingredients and prod ref.
        let ings = r.ingredients
        let knownRef: string | undefined
        try {
          const md = await catalogManager.getResourceMetadata(k)
          if (!ings || !ings.length) {
            ings = (md?.contentMetadata?.ingredients ?? []) as ResourceInfo['ingredients']
          }
          // Pass the prod ref so the verifier skips an extra findRepository call
          knownRef = md?.release?.tag_name ?? undefined
        } catch {
          if (!ings) ings = []
        }
        // Step 2: verify ingredients against the published ref (one network call: git/trees)
        // `verifiedIngredients` is initialised to `ings` as the fail-open value.
        let verifiedIngredients: ResourceInfo['ingredients'] = ings ?? []
        let verifiedRef: string | undefined
        if (ings && ings.length) {
          try {
            const resourceForVerify = { ...r, ingredients: ings } as ResourceInfo
            const result = await verifyResourceContents(resourceForVerify, door43Client, knownRef)
            if (result.treeFetched) {
              verifiedIngredients = result.verifiedIngredients
              verifiedRef = result.verifiedRef
            }
          } catch {
            // fail-open — verifiedIngredients stays as full ingredient list
          }
        }
        return { k, ings, verifiedIngredients, verifiedRef }
      })
    ).then((results) => {
      if (cancelled) return
      useAppStore.setState((state) => {
        for (const { k, ings, verifiedIngredients, verifiedRef } of results) {
          const r = state.loadedResources[k]
          if (!r) continue
          if (ings && ings.length) r.ingredients = ings as typeof r.ingredients
          // Always write verifiedIngredients (even as []) as a "processed" sentinel so
          // `r.verifiedIngredients === undefined` is false on the next effect run.
          // This breaks the Immer write-cycle loop for resources with no ingredients.
          r.verifiedIngredients = (verifiedIngredients ?? []) as typeof r.verifiedIngredients
          if (verifiedRef) r.verifiedRef = verifiedRef
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [loadedResources, catalogManager])

  // After sections load, jump to 1-based section from URL
  useEffect(() => {
    const pending = pendingSectionRef.current
    if (!pending) return
    if (currentNavRef.book !== pending.book) return
    if (!currentSections.length) return
    const idx = pending.section1Based - 1
    if (idx < 0 || idx >= currentSections.length) {
      pendingSectionRef.current = null
      return
    }
    const sec = currentSections[idx]
    pendingSectionRef.current = null
    navigation.navigateToReference({
      book: pending.book,
      chapter: sec.start.chapter,
      verse: sec.start.verse,
      endChapter: sec.end.chapter !== sec.start.chapter ? sec.end.chapter : undefined,
      endVerse: sec.end.verse,
    })
  }, [navigation, currentNavRef.book, currentSections])

  // Keep URL in sync with navigation (canonical `/read/...` template)
  useEffect(() => {
    if (requireLanguageInUrl || !currentLanguageCode) return
    if (suppressUrlSyncRef.current) return

    const tail = buildReadRouteTailFromNavigation({
      scope: navigationScope,
      mode: navigationMode,
      ref: currentNavRef,
      passageSet: currentPassageSet,
      section1Based: navigationMode === 'section' && currentSectionIndex >= 0 ? currentSectionIndex + 1 : null,
    })
    if (!tail) return

    const path = buildReadPath(currentLanguageCode, tail)
    if (location.pathname !== path) {
      navigate(path, { replace: true })
    }
  }, [
    requireLanguageInUrl,
    currentLanguageCode,
    navigationScope,
    navigationMode,
    currentNavRef,
    currentPassageSet,
    currentSectionIndex,
    location.pathname,
    navigate,
  ])
  
  // Export progress state
  const [exportProgress, setExportProgress] = useState<{
    isExporting: boolean
    current: number
    total: number
    message: string
  }>({
    isExporting: false,
    current: 0,
    total: 0,
    message: ''
  })
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 5 },
    })
  )
  
  // Handle panel resize (mouse)
  const handlePanelDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = document.querySelector('.panels-resize-container')
    if (container) {
      const style = window.getComputedStyle(container)
      const isVertical = style.flexDirection === 'column'
      setResizeStartLayout(isVertical ? 'vertical' : 'horizontal')
    }
    setIsResizingPanels(true)
  }, [])
  
  // Handle panel resize (touch)
  const handlePanelDividerTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    const container = document.querySelector('.panels-resize-container')
    if (container) {
      const style = window.getComputedStyle(container)
      const isVertical = style.flexDirection === 'column'
      setResizeStartLayout(isVertical ? 'vertical' : 'horizontal')
    }
    setIsResizingPanels(true)
  }, [])

  // dnd-kit drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
    setHoverPanelId(null)
    setDropTargetIndex(null)
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) {
        setHoverPanelId(null)
        setDropTargetIndex(null)
        return
      }

      const activeKey = String(active.id)
      const overKey = String(over.id)

      // Find which panel owns the active item
      const panel1Keys = panel1Resources.resourceKeys
      const panel2Keys = panel2Resources.resourceKeys
      const activePanel = panel1Keys.includes(activeKey) ? 'panel-1' : panel2Keys.includes(activeKey) ? 'panel-2' : null

      // Check if hovering over a droppable panel or a tab in another panel
      let targetPanelId: string | null = null
      let targetIndex: number | null = null
      
      if (overKey === 'panel-1-droppable') {
        targetPanelId = 'panel-1'
        targetIndex = null // End of list
      } else if (overKey === 'panel-2-droppable') {
        targetPanelId = 'panel-2'
        targetIndex = null // End of list
      } else if (panel1Keys.includes(overKey)) {
        targetPanelId = 'panel-1'
        targetIndex = panel1Keys.indexOf(overKey)
      } else if (panel2Keys.includes(overKey)) {
        targetPanelId = 'panel-2'
        targetIndex = panel2Keys.indexOf(overKey)
      }

      // Only show placeholder when dragging to a different panel
      if (activePanel && targetPanelId && activePanel !== targetPanelId) {
        setHoverPanelId(targetPanelId)
        setDropTargetIndex(targetIndex)
      } else {
        setHoverPanelId(null)
        setDropTargetIndex(null)
      }
    },
    [panel1Resources.resourceKeys, panel2Resources.resourceKeys]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      setHoverPanelId(null)
      setDropTargetIndex(null)

      if (!over) return

      const activeKey = String(active.id)
      const overKey = String(over.id)

      // Find which panels contain the active and over items
      const panel1Keys = panel1Resources.resourceKeys
      const panel2Keys = panel2Resources.resourceKeys

      const activePanel = panel1Keys.includes(activeKey) ? 'panel-1' : panel2Keys.includes(activeKey) ? 'panel-2' : null
      
      // Check if dropped on a panel droppable (not a tab)
      const isDroppedOnPanel = overKey === 'panel-1-droppable' || overKey === 'panel-2-droppable'
      
      if (isDroppedOnPanel) {
        // Dropped on a panel container - move to that panel
        const targetPanelId = overKey === 'panel-1-droppable' ? 'panel-1' : 'panel-2'
        
        if (activePanel && activePanel !== targetPanelId) {
          // Move to end of target panel
          const moveResourceBetweenPanels = useWorkspaceStore.getState().moveResourceBetweenPanels
          moveResourceBetweenPanels(activeKey, activePanel, targetPanelId)
        }
        return
      }
      
      // Dropped on a tab - check which panel owns it
      const overPanel = panel1Keys.includes(overKey) ? 'panel-1' : panel2Keys.includes(overKey) ? 'panel-2' : null

      if (!activePanel || !overPanel) return

      if (activePanel === overPanel) {
        // Reorder within the same panel
        const keys = activePanel === 'panel-1' ? panel1Keys : panel2Keys
        const oldIndex = keys.indexOf(activeKey)
        const newIndex = keys.indexOf(overKey)

        if (oldIndex !== newIndex) {
          const resources = activePanel === 'panel-1' ? panel1Resources : panel2Resources
          resources.reorderResource(activeKey, newIndex)
        }
      } else {
        // Move between panels to a specific position
        const targetKeys = overPanel === 'panel-1' ? panel1Keys : panel2Keys
        const insertIndex = targetKeys.indexOf(overKey)
        
        const moveResourceBetweenPanels = useWorkspaceStore.getState().moveResourceBetweenPanels
        moveResourceBetweenPanels(activeKey, activePanel, overPanel, insertIndex)
      }
    },
    [panel1Resources, panel2Resources]
  )

  useEffect(() => {
    if (!isResizingPanels) return
    
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('.panels-resize-container')
      if (!container) return
      
      const rect = container.getBoundingClientRect()
      
      if (resizeStartLayout === 'horizontal') {
        const newPercent = ((e.clientX - rect.left) / rect.width) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      } else {
        const newPercent = ((e.clientY - rect.top) / rect.height) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      }
    }
    
    const handleTouchMove = (e: TouchEvent) => {
      const container = document.querySelector('.panels-resize-container')
      if (!container) return
      
      const rect = container.getBoundingClientRect()
      const touch = e.touches[0]
      
      if (resizeStartLayout === 'horizontal') {
        const newPercent = ((touch.clientX - rect.left) / rect.width) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      } else {
        const newPercent = ((touch.clientY - rect.top) / rect.height) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      }
    }
    
    const handleMouseUp = () => {
      setIsResizingPanels(false)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchend', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchend', handleMouseUp)
    }
  }, [isResizingPanels, resizeStartLayout])
  
  // Background download control
  const { startDownload, stopDownload, stats: downloadStats, isDownloading: isBackgroundDownloading } = useBackgroundDownload({
    autoStart: false,
    skipExisting: true,
    debug: true
  })
  /** Keeps cancel-on-language-change logic without listing isDownloading in handleLanguageSelected deps (avoids reload loops). */
  const isBackgroundDownloadingRef = useRef(isBackgroundDownloading)
  useEffect(() => {
    isBackgroundDownloadingRef.current = isBackgroundDownloading
  }, [isBackgroundDownloading])
  
  // 🔄 AUTOMATIC BACKGROUND DOWNLOADS
  // Reactively checks catalog when resources load and downloads incomplete ones
  // Triggers automatically when loadedResources changes (reactive!)
  // IMPORTANT: Only enabled AFTER resources finish loading to avoid blocking UI rendering
  // DETERMINISTIC: Passes expectedResources from catalog search for precise waiting
  useCatalogBackgroundDownload({
    catalogManager,
    completenessChecker,
    onStartDownload: startDownload,
    catalogTrigger: `${Object.keys(loadedResources).length}-${metadataUpdateCounter}`, // Reacts to resource count AND metadata changes
    expectedResources, // ✅ List of resources expected from catalog search
    enabled: !DISABLE_BACKGROUND_DOWNLOAD && !isLoadingResources && Object.keys(loadedResources).length > 0, // Wait for UI to be ready
    debug: true,
  })
  
  // Handle language selection - automatically load all tc-ready resources
  const handleLanguageSelected = useCallback(async (languageCode: string) => {
    console.log('📚 Auto-loading all tc-ready resources for language:', languageCode)
    // Track current language for collection management
    setCurrentLanguageCode(languageCode)
    // 🛑 IMPORTANT: Cancel any ongoing downloads from previous language
    if (isBackgroundDownloadingRef.current) {
      console.log('🛑 Canceling ongoing downloads (language changed)')
      stopDownload()
    }
    
    // Update URL: preserve read-route tail when navigation already resolves to a template
    const nav = useNavigationStore.getState()
    const tail = buildReadRouteTailFromNavigation({
      scope: nav.navigationScope,
      mode: nav.navigationMode,
      ref: nav.currentReference,
      passageSet: nav.currentPassageSet,
      section1Based:
        nav.navigationMode === 'section' && nav.currentSectionIndex >= 0 ? nav.currentSectionIndex + 1 : null,
    })
    if (tail) {
      navigate(buildReadPath(languageCode, tail), { replace: true })
    } else {
      navigate(`/read/${languageCode}`, { replace: true })
    }
    
    setIsLoadingResources(true)
    
    try {
      // Clear existing panel assignments for this Read view when switching language
      for (const panelId of ['panel-1', 'panel-2'] as const) {
        const panel = getPanel(panelId)
        if (panel) {
          for (const key of [...panel.resourceKeys]) {
            removeResourceFromPanel(key, panelId)
          }
        }
      }

      const door43Client = getDoor43ApiClient()
      
      // Search for all tc-ready resources for this language (any owner).
      // Use a high limit so we get all matching resources; API may cap otherwise.
      const searchParams = {
        language: languageCode,
        topic: 'tc-ready',
        stage: 'prod' as const,
        limit: 500,
      }
      const query = new URLSearchParams({
        lang: languageCode,
        topic: 'tc-ready',
        stage: 'prod',
        limit: '500',
      }).toString()
      console.log('🔍 Catalog search request:', searchParams)
      console.log('🔍 Catalog search URL (check Network tab):', `https://git.door43.org/api/v1/catalog/search?${query}`)
      const catalogResults = await door43Client.searchCatalog(searchParams)
      
      console.log(`📦 Catalog search returned ${catalogResults.length} raw results for ${languageCode}`)
      if (catalogResults.length === 0) {
        console.warn(
          '⚠️ No catalog results. The API may not support topic=tc-ready, or use a different topic value. Check the Network tab for the actual request (e.g. /api/v1/catalog/search?lang=...&topic=tc-ready&stage=prod&limit=500).'
        )
      }
      if (catalogResults.length > 0) {
        const first = catalogResults[0]
        console.log('📦 First result keys:', Object.keys(first))
        console.log('📦 First result sample:', {
          name: first.name,
          repo_name: first.repo_name,
          identifier: first.identifier,
          owner: typeof first.owner === 'string' ? first.owner : first.owner?.login ?? first.owner?.username,
          language: first.language ?? first.language_code,
          subject: first.subject,
          hasRepo: !!first.repo,
        })
      }

      const supportedSubjects = resourceTypeRegistry.getSupportedSubjects()
      console.log('📋 Resource type registry supported subjects:', supportedSubjects)
      
      // ✅ Collect expected resource keys from catalog results BEFORE processing
      // This allows deterministic waiting for all resources to load
      const expectedResourceKeys: string[] = []
      for (const entry of catalogResults) {
        const item = entry.repo ? { ...entry, ...entry.repo } : entry
        const repoName = item.name ?? item.repo_name
        if (!repoName || typeof repoName !== 'string') continue
        
        const owner = typeof item.owner === 'string' ? item.owner : (item.owner?.login ?? item.owner?.username ?? entry.owner)
        const ownerStr = typeof owner === 'string' ? owner : (owner?.login ?? owner?.username) ?? 'unknown'
        const language = item.language ?? item.language_code ?? languageCode
        const langStr = typeof language === 'string' ? language : languageCode
        const resourceId = item.identifier ?? (repoName.includes('_') ? repoName.split('_').slice(1).join('_') : repoName)
        const resourceKey = `${ownerStr}/${langStr}/${resourceId}`
        
        const subjectRaw = item.subject ?? ''
        const subject = String((Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw) ?? '').trim()
        const type = resourceTypeRegistry.getTypeForSubject(subject)
        
        if (type) {
          expectedResourceKeys.push(resourceKey)
        }
      }
      
      // Add original language resources (UGNT, UHB) to expected list
      const originalLanguageKeys = [
        'unfoldingWord/el-x-koine/ugnt',
        'unfoldingWord/hbo/uhb',
      ]
      expectedResourceKeys.push(...originalLanguageKeys)
      
      console.log(`📋 Expected ${expectedResourceKeys.length} resources (${expectedResourceKeys.length - 2} from catalog + 2 original language):`, expectedResourceKeys)
      setExpectedResources(expectedResourceKeys)
      
      // ✅ PHASE 1: Add resources immediately with basic info (for instant UI)
      console.log(`⚡ Phase 1: Adding ${catalogResults.length} resources immediately to UI...`)
      const loadedResourceKeys: string[] = []
      
      for (const entry of catalogResults) {
        const item = entry.repo ? { ...entry, ...entry.repo } : entry
        const repoName = item.name ?? item.repo_name
        if (!repoName || typeof repoName !== 'string') continue
        
        const owner = typeof item.owner === 'string' ? item.owner : (item.owner?.login ?? item.owner?.username ?? entry.owner)
        const ownerStr = typeof owner === 'string' ? owner : (owner?.login ?? owner?.username) ?? 'unknown'
        const language = item.language ?? item.language_code ?? languageCode
        const langStr = typeof language === 'string' ? language : languageCode
        const resourceId = item.identifier ?? (repoName.includes('_') ? repoName.split('_').slice(1).join('_') : repoName)
        const resourceKey = `${ownerStr}/${langStr}/${resourceId}`
        
        const subjectRaw = item.subject ?? ''
        const subject = String((Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw) ?? '').trim()
        const typeId = resourceTypeRegistry.getTypeForSubject(subject)
        
        if (!typeId) {
          console.log('⏭️ Skip: subject not in resource registry', { resourceKey, subject })
          continue
        }
        
        // Use registry typeId directly as the authoritative subject → type mapping.
        // The ResourceType enum only covers base types; app-level types like
        // 'obs-words-links' live only in the registry. Falling back to
        // mapSubjectToResourceType would silently downgrade 'obs-words-links' → 'words-links',
        // breaking the dependency check in WordsLinksViewer.
        const type = typeId as ResourceType
        const format = mapContentFormat(item.content_format ?? item.format ?? 'usfm')
        const scopeForType = resourceTypeRegistry.getScopeForType(typeId)
        const appliesToScope =
          scopeForType === 'scripture' || scopeForType === 'obs' ? scopeForType : ('shared' as const)

        // Create basic ResourceInfo immediately (no metadata fetch yet)
        const basicResourceInfo: ResourceInfo = {
          id: resourceKey,
          key: resourceKey,
          resourceKey: resourceKey,
          title: item.title ?? entry.title ?? resourceKey,
          type,
          category: subject || 'Unknown',
          subject: subject || 'Unknown',
          owner: ownerStr,
          language: langStr,
          languageCode: langStr,
          languageName: item.language_title ?? langStr,
          resourceId: resourceId,
          server: 'git.door43.org',
          format,
          contentType: format === ResourceFormat.USFM ? 'text/usfm' : 'text/markdown',
          contentStructure: (subject.toLowerCase().includes('bible') ? 'book' : 'entry') as 'book' | 'entry',
          version: item.release?.tag_name ?? '1.0',
          description: item.description ?? item.repo?.description,
          release: item.release ?? item.catalog?.prod,
          availability: { online: true, offline: false, bundled: false, partial: false },
          locations: [],
          catalogedAt: new Date().toISOString(),
          appliesToScope,
        }
        
        // Add to workspace immediately
        addResource(basicResourceInfo)
        loadedResourceKeys.push(resourceKey)
        
        // Only assign to panels if resource has a viewer (modal-only resources won't appear as tabs).
        // Use the string type ID from the registry (e.g. 'obs', 'notes') for viewer lookup —
        // not the ResourceType enum value which returns 'unknown' for OBS.
        const hasViewer = viewerRegistry.hasViewer(typeId)
        if (hasViewer) {
          // Use contentRole to determine which panel: primaries (scripture, obs) → panel-1,
          // companions (notes, words-links, questions, obs-notes, ...) → panel-2.
          const typeDef = resourceTypeRegistry.get(typeId)
          const isPrimary = typeDef?.contentRole === 'primary'
          const panelId = isPrimary ? 'panel-1' : 'panel-2'
          const currentPanel = getPanel(panelId)
          const currentIndex = currentPanel?.resourceKeys.length || 0
          assignResourceToPanel(resourceKey, panelId, currentIndex)
          if (currentIndex === 0) {
            setActiveResourceInPanel(panelId, 0)
          }
          console.log(`✅ Immediately added to panel: ${resourceKey} → panel ${panelId} (metadata will load in background)`)
        } else {
          console.log(`✅ Loaded resource (modal-only): ${resourceKey} (no panel viewer)`)
        }
      }

      // --- Synthetic combined-helps resources (one per scope) ---
      // Scripture Helps: TN + TWL for Bible passages
      const { tnKey: scriptureHelpsTn, twlKey: scriptureHelpsTwl } = findHelpsKeysForScope(languageCode, 'scripture')
      const scriptureHelpsResource = {
        id: COMBINED_HELPS_RESOURCE_ID,
        key: COMBINED_HELPS_RESOURCE_ID,
        resourceKey: COMBINED_HELPS_RESOURCE_ID,
        title: 'Helps',
        type: 'combined-helps',
        category: 'Combined helps',
        subject: 'Combined TN+TWL',
        owner: 'local',
        language: languageCode,
        languageCode,
        languageName: languageCode,
        resourceId: 'combined-helps',
        server: 'git.door43.org',
        format: ResourceFormat.TSV,
        contentType: 'text/tab-separated-values',
        contentStructure: 'book' as const,
        version: '1.0',
        description: 'Combined Translation Notes and Translation Words Links for Scripture',
        availability: { online: true, offline: false, bundled: false, partial: false },
        locations: [],
        catalogedAt: new Date().toISOString(),
        helpsTnResourceKey: scriptureHelpsTn,
        helpsTwlResourceKey: scriptureHelpsTwl,
        appliesToScope: 'scripture',
      } as unknown as ResourceInfo
      addResource(scriptureHelpsResource)
      loadedResourceKeys.push(COMBINED_HELPS_RESOURCE_ID)
      assignResourceToPanel(COMBINED_HELPS_RESOURCE_ID, 'panel-2', 0)
      setActiveResourceInPanel('panel-2', 0)

      // OBS Helps: OBS-TN + OBS-TWL for OBS story frames
      const { tnKey: obsHelpsTn, twlKey: obsHelpsTwl } = findHelpsKeysForScope(languageCode, 'obs')
      const obsHelpsResource = {
        id: OBS_COMBINED_HELPS_RESOURCE_ID,
        key: OBS_COMBINED_HELPS_RESOURCE_ID,
        resourceKey: OBS_COMBINED_HELPS_RESOURCE_ID,
        title: 'OBS Helps',
        type: 'combined-helps',
        category: 'Combined helps',
        subject: 'Combined OBS TN+TWL',
        owner: 'local',
        language: languageCode,
        languageCode,
        languageName: languageCode,
        resourceId: 'combined-helps-obs',
        server: 'git.door43.org',
        format: ResourceFormat.TSV,
        contentType: 'text/tab-separated-values',
        contentStructure: 'book' as const,
        version: '1.0',
        description: 'Combined OBS Translation Notes and Translation Words Links',
        availability: { online: true, offline: false, bundled: false, partial: false },
        locations: [],
        catalogedAt: new Date().toISOString(),
        helpsTnResourceKey: obsHelpsTn,
        helpsTwlResourceKey: obsHelpsTwl,
        appliesToScope: 'obs',
      } as unknown as ResourceInfo
      addResource(obsHelpsResource)
      loadedResourceKeys.push(OBS_COMBINED_HELPS_RESOURCE_ID)
      // OBS helps go into panel-2 (same as scripture helps, scope filter will show/hide)
      const panel2AfterScripture = getPanel('panel-2')
      assignResourceToPanel(OBS_COMBINED_HELPS_RESOURCE_ID, 'panel-2', panel2AfterScripture?.resourceKeys.length || 1)
      
      console.log(`⚡ Phase 1 complete: ${loadedResourceKeys.length} resources in UI`)
      
      // ✅ PHASE 2: Fetch metadata in background. When cached, catalog reads are fast;
      // we batch store updates so one addResources() = one re-render instead of N.
      console.log(`🔄 Phase 2: Fetching metadata for ${catalogResults.length} resources in background...`)
      const metadataPromises = catalogResults.map(async (entry): Promise<ResourceInfo | null> => {
        const item = entry.repo ? { ...entry, ...entry.repo } : entry
        const repoName = item.name ?? item.repo_name
        if (!repoName || typeof repoName !== 'string') {
          return null
        }
        
        const owner = typeof item.owner === 'string' ? item.owner : (item.owner?.login ?? item.owner?.username ?? entry.owner)
        const ownerStr = typeof owner === 'string' ? owner : (owner?.login ?? owner?.username) ?? 'unknown'
        const language = item.language ?? item.language_code ?? languageCode
        const langStr = typeof language === 'string' ? language : languageCode
        const resourceId = item.identifier ?? (repoName.includes('_') ? repoName.split('_').slice(1).join('_') : repoName)
        const resourceKey = `${ownerStr}/${langStr}/${resourceId}`
        
        const subjectRaw = item.subject ?? ''
        const subject = String((Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw) ?? '').trim()
        const type = resourceTypeRegistry.getTypeForSubject(subject)
        
        if (!type) return null
        
        const release = item.release ?? item.catalog?.prod
        if (!release?.tag_name) return null
        
        try {
          const door43Resource = {
            id: resourceId,
            name: repoName,
            title: item.title ?? entry.title ?? resourceKey,
            owner: ownerStr,
            language: langStr,
            language_title: item.language_title,
            subject,
            version: release.tag_name,
            format: item.content_format ?? item.format,
            content_format: item.content_format ?? item.format,
            metadata_url: item.metadata_url ?? entry.metadata_url,
            description: item.description ?? item.repo?.description,
            ingredients: item.ingredients ?? item.repo?.ingredients,
            release,
            server: 'git.door43.org',
            html_url: item.html_url ?? entry.html_url ?? release?.html_url,
          }
          
          const metadata = await createResourceMetadata(door43Resource as any, {
            resourceTypeRegistry,
            getResourceType: () => type,
            catalogAdapter: catalogManager.catalogAdapter,
            debug: false, // Quiet mode for background loading
          })
          
          await catalogManager.addResourceToCatalog(metadata)
          console.log(`📊 Metadata loaded and saved: ${resourceKey}`)
          
          const existingResource = useAppStore.getState().loadedResources[resourceKey]
          if (existingResource) {
            return {
              ...existingResource,
              ...metadata,
              id: existingResource.id,
              key: existingResource.key,
              toc: existingResource.toc,
            }
          }
          return null
        } catch (error) {
          console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
          return null
        }
      })
      
      // ✅ Add original language resources immediately
      console.log('⚡ Adding original language resources immediately to UI...')
      const originalResources = [
        { lang: 'el-x-koine', id: 'ugnt', label: 'UGNT', subject: 'Greek New Testament' },
        { lang: 'hbo', id: 'uhb', label: 'UHB', subject: 'Hebrew Old Testament' },
      ]
      
      for (const orig of originalResources) {
        const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
        
        // Create basic ResourceInfo immediately
        const basicResourceInfo: ResourceInfo = {
          id: resourceKey,
          key: resourceKey,
          resourceKey: resourceKey,
          title: orig.label,
          type: ResourceType.SCRIPTURE,
          category: 'Bible',
          subject: orig.subject,
          owner: 'unfoldingWord',
          language: orig.lang,
          languageCode: orig.lang,
          languageName: orig.label,
          resourceId: orig.id,
          server: 'git.door43.org',
          format: ResourceFormat.USFM,
          contentType: 'text/usfm',
          contentStructure: 'book',
          version: '1.0',
          availability: { online: true, offline: false, bundled: false, partial: false },
          locations: [],
          catalogedAt: new Date().toISOString(),
        }
        
        // Add to workspace immediately
        addResource(basicResourceInfo)
        loadedResourceKeys.push(resourceKey)
        
        // Add to scripture panel
        const currentPanel = getPanel('panel-1')
        const currentIndex = currentPanel?.resourceKeys.length || 0
        assignResourceToPanel(resourceKey, 'panel-1', currentIndex)
        
        console.log(`✅ Immediately added original: ${resourceKey} (metadata will load in background)`)
      }
      
      // Fetch metadata for original resources in background
      console.log('🔄 Fetching metadata for original language resources in background...')
      const originalMetadataPromises = originalResources.map(async (orig): Promise<ResourceInfo | null> => {
        const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
        try {
          let catalogEntry = await catalogManager.catalogAdapter.get(resourceKey)
          
          if (!catalogEntry) {
            const results = await catalogManager.door43Client.searchCatalog({
              owner: 'unfoldingWord',
              lang: orig.lang,
              subject: orig.subject,
              stage: 'prod',
              limit: 1
            })
            
            if (results && results.length > 0) {
              const door43Resource = results[0]
              const repoName = door43Resource.name ?? door43Resource.repo_name
              const extractedResourceId = repoName?.replace(`${orig.lang}_`, '') || orig.id
              
              const normalizedResource = {
                ...door43Resource,
                id: extractedResourceId,
                language: door43Resource.language || door43Resource.lang
              }
              
              const metadata = await createResourceMetadata(normalizedResource as any, {
                resourceTypeRegistry,
                getResourceType: () => 'scripture',
                catalogAdapter: catalogManager.catalogAdapter,
                debug: true,
              })
              
              await catalogManager.addResourceToCatalog(metadata)
              console.log(`📊 Metadata loaded for original: ${resourceKey}`)
              
              const existingResource = useAppStore.getState().loadedResources[resourceKey]
              if (existingResource) {
                return {
                  ...existingResource,
                  ...metadata,
                  id: existingResource.id,
                  key: existingResource.key,
                  toc: existingResource.toc,
                }
              }
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
        }
        return null
      })
      
      // One batched store update when all metadata is ready (cached = fast, one re-render)
      Promise.allSettled([...metadataPromises, ...originalMetadataPromises]).then(async (results) => {
        const toAdd: ResourceInfo[] = []
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            toAdd.push(result.value)
          }
        }
        if (toAdd.length > 0) {
          useAppStore.getState().addResources(toAdd)
          setMetadataUpdateCounter((prev) => prev + toAdd.length)
        }
        console.log(`✅ All metadata loading complete for ${languageCode}`)
        
        // Create a collection with all loaded resources for this language
        try {
          const collectionName = `${languageCode}_tc-helps`
          console.log(`📦 Creating collection: ${collectionName}`)
          
          const workspaceStore = useWorkspaceStore.getState()
          
          await workspaceStore.saveAsCollection(
            collectionName,
            `Translation helps for ${languageCode}`
          )
          
          console.log(`✅ Collection created: ${collectionName}`)
        } catch (error) {
          console.error(`❌ Failed to create collection for ${languageCode}:`, error)
        }
      })
      
    } catch (error) {
      console.error('Error loading resources:', error)
    } finally {
      setIsLoadingResources(false)
    }
  }, [catalogManager, resourceTypeRegistry, assignResourceToPanel, setActiveResourceInPanel, addResource, getPanel, removeResourceFromPanel, navigate, stopDownload, viewerRegistry])
  
  // Auto-load resources when the URL includes a language segment (once per URL language).
  // handleLanguageSelected must NOT depend on volatile flags like isBackgroundDownloading — otherwise its
  // identity churn retriggers this effect and repeatedly reloads panels (infinite loop on Read).
  const autoLoadedLanguageForUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initialLanguage) return
    if (autoLoadedLanguageForUrlRef.current === initialLanguage) return
    autoLoadedLanguageForUrlRef.current = initialLanguage
    void handleLanguageSelected(initialLanguage)
  }, [initialLanguage, handleLanguageSelected])
  
  // Check if current collection is fully cached
  useEffect(() => {
    const checkCollectionCompleteness = async () => {
      if (!currentLanguageCode) {
        setIsCollectionFullyCached(false)
        return
      }
      
      const collectionName = `${currentLanguageCode}_tc-helps`
      
      // Check if collection exists
      const collection = packageStore.packages.find(pkg => pkg.name === collectionName)
      if (!collection || !collection.resources || collection.resources.length === 0) {
        setIsCollectionFullyCached(false)
        return
      }
      
      // Check if all resources in the collection are fully cached
      let allCached = true
      for (const resource of collection.resources) {
        const resourceKey = `${resource.owner}/${resource.language}/${resource.resourceId}`
        const status = await completenessChecker.checkResource(resourceKey)
        
        if (!status.isComplete) {
          allCached = false
          break
        }
      }
      
      setIsCollectionFullyCached(allCached)
    }
    
    // Check immediately
    checkCollectionCompleteness()
    
    // Poll every 5 seconds to detect when downloads complete
    const interval = setInterval(checkCollectionCompleteness, 5000)
    
    return () => clearInterval(interval)
  }, [currentLanguageCode, packageStore.packages, completenessChecker])
  
  // Direct download handler - downloads collection without prompting
  const handleDirectDownloadCollection = useCallback(async () => {
    if (!currentLanguageCode) return
    
    const collectionName = `${currentLanguageCode}_tc-helps`
    const collection = packageStore.packages.find(pkg => pkg.name === collectionName)
    
    if (!collection) {
      console.error(`Collection ${collectionName} not found`)
      return
    }
    
    try {
      console.log(`📦 Starting collection export: ${collectionName}`)
      
      // Set initial progress state
      setExportProgress({
        isExporting: true,
        current: 0,
        total: 100,
        message: 'Initializing export...'
      })
      
      // Create Web Worker for export
      const worker = new Worker(
        new URL('../../workers/collectionExport.worker.ts', import.meta.url),
        { type: 'module' }
      )
      
      // Listen for worker messages
      worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
        const { type, data } = event.data
        
        if (type === 'progress') {
          console.log(`📦 [Export] ${data?.message}`)
          setExportProgress({
            isExporting: true,
            current: data?.progress || 0,
            total: data?.total || 100,
            message: data?.message || 'Exporting...'
          })
        } else if (type === 'complete') {
          console.log(`✅ Collection ${collectionName} exported successfully`)
          
          // Download the blob
          if (data?.blob && data?.filename) {
            const url = URL.createObjectURL(data.blob)
            const a = document.createElement('a')
            a.href = url
            a.download = data.filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }
          
          // Show success message briefly
          setExportProgress({
            isExporting: false,
            current: 0,
            total: 0,
            message: 'Export complete!'
          })
          
          // Hide after 2 seconds
          setTimeout(() => {
            setExportProgress({
              isExporting: false,
              current: 0,
              total: 0,
              message: ''
            })
          }, 2000)
          
          worker.terminate()
        } else if (type === 'error') {
          const errorMessage = data?.error || 'Export failed'
          console.error(`❌ Export error: ${errorMessage}`)
          
          // Check if this is an IndexedDB access error (for fallback)
          const isIndexedDBError = errorMessage.includes('IndexedDB') || 
                                   errorMessage.includes('database') ||
                                   errorMessage.includes('Cache store')
          
          let displayMessage = errorMessage
          if (isIndexedDBError) {
            displayMessage = 'Export failed: Unable to access cache in background. ' +
                           'This may be due to browser restrictions or private browsing mode.'
            console.warn('💡 Consider implementing fallback export method')
          }
          
          // Update progress to show error (keep visible longer for errors)
          setExportProgress({
            isExporting: false,
            current: -1, // Use -1 to indicate error state
            total: 0,
            message: displayMessage
          })
          
          // Auto-hide error after 8 seconds for longer messages
          setTimeout(() => {
            setExportProgress({
              isExporting: false,
              current: 0,
              total: 0,
              message: ''
            })
          }, 8000)
          
          worker.terminate()
        }
      }
      
      worker.onerror = (error) => {
        console.error(`❌ Worker error:`, error)
        
        setExportProgress({
          isExporting: false,
          current: 0,
          total: 0,
          message: 'Export failed'
        })
        
        worker.terminate()
      }
      
      // Send configuration to worker (no data!)
      // Worker will read directly from IndexedDB
      const message: ExportWorkerMessage = {
        type: 'export',
        data: {
          collection: {
            id: collection.id,
            name: collection.name,
            version: collection.version,
            description: collection.description,
            resources: collection.resources || [],
            panelLayout: collection.panelLayout || { panels: [] }
          },
          dbConfig: {
            dbName: 'tc-study-cache',
            storeName: 'cache-entries',
            version: 1
          }
        }
      }
      
      console.log(`📦 Sending export configuration to worker`)
      worker.postMessage(message)
      
    } catch (error) {
      console.error(`❌ Failed to start collection export:`, error)
      
      setExportProgress({
        isExporting: false,
        current: 0,
        total: 0,
        message: 'Export failed'
      })
    }
  }, [currentLanguageCode, packageStore.packages])
  
  // Configure linked panels plugins
  const plugins = useMemo(() => {
    const pluginRegistry = createDefaultPluginRegistry()
    
    // Register signal plugins for resource-panels communication
    pluginRegistry.register(tokenClickPlugin)
    pluginRegistry.register(verseFilterPlugin)
    pluginRegistry.register(linkClickPlugin)
    pluginRegistry.register(entryLinkClickPlugin)
    pluginRegistry.register(scriptureTokensBroadcastPlugin)
    pluginRegistry.register(notesTokenGroupsPlugin)
    pluginRegistry.register(obsFrameHighlightPlugin)
    pluginRegistry.register(obsFrameQuotesPlugin)
    pluginRegistry.register(scriptureContentRequestPlugin)
    pluginRegistry.register(scriptureContentResponsePlugin)
    
    return pluginRegistry
  }, [])
  
  // Resource keys for each panel (ensure arrays)
  const panel1ResourceKeys = panel1Resources.resourceKeys ?? []
  const panel2ResourceKeys = panel2Resources.resourceKeys ?? []

  // Filter panel keys by (1) active navigation scope and (2) current book availability.
  // Resources whose ingredients are not yet loaded are kept visible (fail-open) so they
  // don't flicker away while async catalog fetches are in progress.
  //
  // Stable-reference guard: return the same array reference when the key list content is
  // unchanged, even if `loadedResources` was replaced by a new Immer-produced reference.
  // This prevents `allResourceIds` and `panelConfig` from recomputing (and
  // linked-panels from "Setting store config") on every loadedResources write.
  const currentBook = currentNavRef.book
  const prev1KeysRef = useRef<string[]>([])
  const filteredPanel1Keys = useMemo(() => {
    const next = panel1ResourceKeys.filter((key) => {
      const scope = getResourceAppliesToScope(key, loadedResources, resourceTypeRegistry)
      if (scope !== navigationScope && scope !== null) return false
      return resourceSupportsBook(key, loadedResources, currentBook)
    })
    const prev = prev1KeysRef.current
    if (next.length === prev.length && next.every((k, i) => k === prev[i])) return prev
    prev1KeysRef.current = next
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel1ResourceKeys, navigationScope, loadedResources, resourceTypeRegistry, currentBook])

  const prev2KeysRef = useRef<string[]>([])
  const filteredPanel2Keys = useMemo(() => {
    const next = panel2ResourceKeys.filter((key) => {
      const scope = getResourceAppliesToScope(key, loadedResources, resourceTypeRegistry)
      if (scope !== navigationScope && scope !== null) return false
      return resourceSupportsBook(key, loadedResources, currentBook)
    })
    const prev = prev2KeysRef.current
    if (next.length === prev.length && next.every((k, i) => k === prev[i])) return prev
    prev2KeysRef.current = next
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel2ResourceKeys, navigationScope, loadedResources, resourceTypeRegistry, currentBook])
  
  // Filtered resource objects (for PanelHeader — tabs must match the filtered key list).
  // loadedResources is used only to map keys → ResourceInfo; we keep this memoized so tab
  // re-renders happen only when the filtered key list or loadedResources changes.
  const filteredPanel1Resources = useMemo(
    () => filteredPanel1Keys.map((key) => loadedResources[key]).filter(Boolean) as ResourceInfo[],
    [filteredPanel1Keys, loadedResources]
  )
  const filteredPanel2Resources = useMemo(
    () => filteredPanel2Keys.map((key) => loadedResources[key]).filter(Boolean) as ResourceInfo[],
    [filteredPanel2Keys, loadedResources]
  )

  // Modal management
  const openModal = useStudyStore((s: any) => s.openModal)
  
  // Handle opening entry-organized resources in modal
  const handleOpenEntry = useCallback((resourceId: string, entryId?: string) => {
    const resourceKey = entryId ? `${resourceId}#${entryId}` : resourceId
    openModal(resourceKey)
  }, [openModal])
  
  // Build panel config (matches Studio exactly).
  //
  // Re-render cascade (why notes viewer re-renders a lot and Scripture "waits" for TN):
  // - This view subscribes to loadedResources. Every addResource/setAnchorResource (Phase 2
  //   metadata, TOC load) updates the store → SimplifiedReadView re-renders.
  // - panelConfig used to depend on loadedResources and generateResourceComponent, so every
  //   re-render produced a new config object and new component elements.
  // - LinkedPanelsContainer then updates the linked-panels store → both panels (Scripture
  //   and TN) re-render. So both keep re-rendering until the stream of store updates stops.
  // - TN also re-renders from its own async state (notes, TA titles, dependencies).
  //
  // Stabilization: we use ResourcePanelByKey so config does NOT depend on loadedResources.
  // Each panel resource is rendered by a wrapper that subscribes to only its own
  // loadedResources[id]; when metadata loads, only that wrapper re-renders, not the whole
  // container. So panelConfig deps are only panel keys and active indices.
  const allResourceIds = useMemo(
    () => [...new Set([...filteredPanel1Keys, ...filteredPanel2Keys])],
    [filteredPanel1Keys, filteredPanel2Keys]
  )

  const panelConfig: LinkedPanelsConfig = useMemo(() => {
    const resources = allResourceIds.map((id) => ({
      id,
      title: '', // Titles come from store inside ResourcePanelByKey / panel header
      description: 'resource',
      category: 'resource',
      component: (
        <ResourcePanelByKey
          resourceId={id}
          viewerRegistry={viewerRegistry}
          onEntryLinkClick={handleOpenEntry}
        />
      ),
    }))

    // When scope changes the filtered list may not contain the previously-active resource.
    // Try to keep the same resource selected if it exists in the filtered list; otherwise show index 0.
    const p1ActiveKey = panel1Resources.resourceKeys[panel1Resources.activeIndex]
    const p1FilteredIdx = p1ActiveKey ? filteredPanel1Keys.indexOf(p1ActiveKey) : -1
    const p1InitialIndex = p1FilteredIdx >= 0 ? p1FilteredIdx : 0

    const p2ActiveKey = panel2Resources.resourceKeys[panel2Resources.activeIndex]
    const p2FilteredIdx = p2ActiveKey ? filteredPanel2Keys.indexOf(p2ActiveKey) : -1
    const p2InitialIndex = p2FilteredIdx >= 0 ? p2FilteredIdx : 0

    return {
      resources,
      panels: {
        'panel-1': {
          resourceIds: filteredPanel1Keys,
          initialIndex: p1InitialIndex,
        },
        'panel-2': {
          resourceIds: filteredPanel2Keys,
          initialIndex: p2InitialIndex,
        },
      },
    }
  }, [allResourceIds, filteredPanel1Keys, filteredPanel2Keys, panel1Resources.activeIndex, panel2Resources.activeIndex, viewerRegistry, handleOpenEntry])
  
  // Helper to get resource label for DragOverlay
  const getResourceLabel = useCallback((resourceKey: string) => {
    const resource = loadedResources[resourceKey]
    if (!resource) return resourceKey.split('/').pop()?.toUpperCase() || 'N/A'
    
    if (resourceKey === OBS_COMBINED_HELPS_RESOURCE_ID) return 'OBS Helps'
    if (resourceKey === COMBINED_HELPS_RESOURCE_ID) return 'Helps'
    const parts = resourceKey.split('/')
    const lastPart = parts[parts.length - 1] || ''
    if (lastPart) return lastPart.toUpperCase()
    
    const title = resource.title || ''
    if (title.includes('Greek New Testament')) return 'UGNT'
    if (title.includes('Hebrew Old Testament')) return 'UHB'
    if (title.includes('Literal Text')) return 'ULT'
    if (title.includes('Simplified Text')) return 'UST'
    if (title.includes('Translation Notes')) return 'UTN'
    if (title.includes('Translation Words')) return 'UTW'
    if (title.includes('Translation Questions')) return 'UTQ'
    if (title.includes('Translation Academy')) return 'UTA'
    
    return lastPart.substring(0, 4).toUpperCase()
  }, [loadedResources])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col overflow-hidden">
      {/* Navigation Bar - top on md+, bottom on mobile */}
      {navState === 'compact' && (
        <div className="flex-shrink-0 flex flex-col order-2 md:order-1">
          <div className="flex items-center bg-white border-gray-100/50 border-t md:border-t-0 md:border-b px-2 py-1.5">
            <NavigationBar 
              isCompact={true}
              onToggleCompact={undefined}
              showLanguagePicker={true}
              onLanguageSelected={handleLanguageSelected}
              autoOpenLanguagePicker={shouldAutoOpenLanguagePicker}
              languagePickerRequired={requireLanguageInUrl}
              downloadIndicator={
                <DownloadIndicator 
                  isDownloading={isBackgroundDownloading}
                  progress={downloadStats.progress ?? undefined}
                />
              }
              onDownloadCollection={isCollectionFullyCached ? handleDirectDownloadCollection : undefined}
              onLoadCollection={() => setShowLoadDialog(true)}
            />
          </div>
        </div>
      )}
      {/* Main Content Area - Two Panels (matches Studio exactly) */}
      <div className="flex-1 overflow-hidden order-1 md:order-2 min-h-0">
        <LinkedPanelsContainer config={panelConfig} plugins={plugins}>
          {/* Bridge global events to panel system */}
          <GlobalSignalBridge />
          
          <div
            ref={resizeContainerRef}
            className="h-full flex flex-col md:flex-row overflow-hidden panels-resize-container relative"
          >
            {/* Panel 1 */}
            <DroppablePanel
              id="panel-1-droppable"
              className="min-h-0 overflow-hidden"
              style={{ flexBasis: `${panel1Width}%` }}
              colorScheme="blue"
            >
              <LinkedPanel id="panel-1">
                {({ current, navigate }) => {
                  // Swipe gesture handlers for this panel
                  const swipeHandlers = useSwipeGesture({
                    onSwipeLeft: () => {
                      if (panel1Resources.hasNext) {
                        panel1Resources.goToNext()
                        navigate.next()
                      }
                    },
                    onSwipeRight: () => {
                      if (panel1Resources.hasPrevious) {
                        panel1Resources.goToPrevious()
                        navigate.previous()
                      }
                    },
                    minSwipeDistance: 50,
                  })
                  
                  return (
                    <div className="h-full flex flex-col">
                      <PanelHeader
                        panelNumber={1}
                        panelId="panel-1"
                        resources={filteredPanel1Resources}
                        currentIndex={current.index}
                        currentResource={filteredPanel1Resources[current.index] ?? null}
                        onIndexChange={(newIndex) => {
                          navigate.toIndex(newIndex)
                          // Map filtered index back to the unfiltered workspace index
                          const filteredKey = filteredPanel1Keys[newIndex]
                          const unfilteredIdx = filteredKey
                            ? panel1Resources.resourceKeys.indexOf(filteredKey)
                            : -1
                          if (unfilteredIdx >= 0) panel1Resources.goToIndex(unfilteredIdx)
                        }}
                        onRemove={() => panel1Resources.removeResource()}
                        onMoveToOtherPanel={
                          filteredPanel1Resources[current.index] && filteredPanel1Keys.length > 0
                            ? () => {
                                const key = filteredPanel1Keys[current.index]
                                if (key) panel1Resources.moveResource(key, 'panel-2')
                              }
                            : undefined
                        }
                        colorScheme="blue"
                        showDropPlaceholder={hoverPanelId === 'panel-1'}
                        placeholderLabel={activeId ? getResourceLabel(activeId) : ''}
                        placeholderIndex={hoverPanelId === 'panel-1' ? dropTargetIndex : undefined}
                      />

                      {/* Panel Content */}
                      <div 
                        ref={swipeHandlers.ref}
                        className="flex-1 min-h-0 overflow-auto"
                        onTouchStart={swipeHandlers.onTouchStart}
                        onTouchMove={swipeHandlers.onTouchMove}
                        onTouchEnd={swipeHandlers.onTouchEnd}
                        onMouseDown={swipeHandlers.onMouseDown}
                        onMouseMove={swipeHandlers.onMouseMove}
                        onMouseUp={swipeHandlers.onMouseUp}
                        onMouseLeave={swipeHandlers.onMouseLeave}
                      >
                        {current.resource?.component || (
                          isLoadingResources ? (
                            <div className="h-full flex items-center justify-center" role="status" aria-label="Loading resources">
                              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                            </div>
                          ) : (
                            <EmptyPanelState
                              panelId="panel-1"
                              message="Select a language to load resources"
                            />
                          )
                        )}
                      </div>
                    </div>
                  )
                }}
              </LinkedPanel>
            </DroppablePanel>

            {/* Resize Divider */}
            <div
              onMouseDown={handlePanelDividerMouseDown}
              onTouchStart={handlePanelDividerTouchStart}
              className={`flex-shrink-0 transition-colors relative flex items-center justify-center ${
                isResizingPanels ? 'bg-blue-500' : 'bg-gray-200 hover:bg-blue-400'
              } md:w-1.5 md:h-full md:cursor-ew-resize w-full h-1.5 cursor-ns-resize`}
              title="Drag to resize panels"
              aria-label="Resize panels"
            >
              {/* Touch-friendly hitbox */}
              <div className="absolute md:left-1/2 md:-translate-x-1/2 md:top-0 md:w-4 md:h-full top-1/2 -translate-y-1/2 left-0 w-full h-4" />
              
              {/* Visual grip indicator */}
              <div className="absolute flex gap-1 pointer-events-none md:flex-col md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 flex-row top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2">
                <div className={`w-1 h-1 rounded-full transition-colors ${
                  isResizingPanels ? 'bg-white' : 'bg-gray-400'
                }`} />
                <div className={`w-1 h-1 rounded-full transition-colors ${
                  isResizingPanels ? 'bg-white' : 'bg-gray-400'
                }`} />
                <div className={`w-1 h-1 rounded-full transition-colors ${
                  isResizingPanels ? 'bg-white' : 'bg-gray-400'
                }`} />
              </div>
            </div>

            {/* Panel 2 */}
            <DroppablePanel
              id="panel-2-droppable"
              className="min-h-0 overflow-hidden"
              style={{ flexBasis: `${100 - panel1Width}%` }}
              colorScheme="purple"
            >
              <LinkedPanel id="panel-2">
                {({ current, navigate }) => {
                  // Swipe gesture handlers for this panel
                  const swipeHandlers = useSwipeGesture({
                    onSwipeLeft: () => {
                      if (panel2Resources.hasNext) {
                        panel2Resources.goToNext()
                        navigate.next()
                      }
                    },
                    onSwipeRight: () => {
                      if (panel2Resources.hasPrevious) {
                        panel2Resources.goToPrevious()
                        navigate.previous()
                      }
                    },
                    minSwipeDistance: 50,
                  })
                  
                  return (
                    <div className="h-full flex flex-col">
                      <PanelHeader
                        panelNumber={2}
                        panelId="panel-2"
                        resources={filteredPanel2Resources}
                        currentIndex={current.index}
                        currentResource={filteredPanel2Resources[current.index] ?? null}
                        onIndexChange={(newIndex) => {
                          navigate.toIndex(newIndex)
                          const filteredKey = filteredPanel2Keys[newIndex]
                          const unfilteredIdx = filteredKey
                            ? panel2Resources.resourceKeys.indexOf(filteredKey)
                            : -1
                          if (unfilteredIdx >= 0) panel2Resources.goToIndex(unfilteredIdx)
                        }}
                        onRemove={() => panel2Resources.removeResource()}
                        onMoveToOtherPanel={
                          filteredPanel2Resources[current.index] && filteredPanel2Keys.length > 0
                            ? () => {
                                const key = filteredPanel2Keys[current.index]
                                if (key) panel2Resources.moveResource(key, 'panel-1')
                              }
                            : undefined
                        }
                        colorScheme="purple"
                        showDropPlaceholder={hoverPanelId === 'panel-2'}
                        placeholderLabel={activeId ? getResourceLabel(activeId) : ''}
                        placeholderIndex={hoverPanelId === 'panel-2' ? dropTargetIndex : undefined}
                      />

                      {/* Panel Content */}
                      <div 
                        ref={swipeHandlers.ref}
                        className="flex-1 min-h-0 overflow-auto"
                        onTouchStart={swipeHandlers.onTouchStart}
                        onTouchMove={swipeHandlers.onTouchMove}
                        onTouchEnd={swipeHandlers.onTouchEnd}
                        onMouseDown={swipeHandlers.onMouseDown}
                        onMouseMove={swipeHandlers.onMouseMove}
                        onMouseUp={swipeHandlers.onMouseUp}
                        onMouseLeave={swipeHandlers.onMouseLeave}
                      >
                        {current.resource?.component || (
                          isLoadingResources ? (
                            <div className="h-full flex items-center justify-center" role="status" aria-label="Loading resources">
                              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                            </div>
                          ) : (
                            <EmptyPanelState
                              panelId="panel-2"
                              message="Select a language to load resources"
                            />
                          )
                        )}
                      </div>
                    </div>
                  )
                }}
              </LinkedPanel>
            </DroppablePanel>
            
            {/* Entry Resource Modal with History - positioned relative to panels container */}
            <EntryResourceModal onEntryLinkClick={handleOpenEntry} />
          </div>
        </LinkedPanelsContainer>
      </div>
      
      {/* DragOverlay for ghost preview */}
      <DragOverlay>
        {activeId ? (
          <div className="px-2 py-1.5 text-xs font-medium bg-blue-100 text-blue-800 border-2 border-blue-300 rounded shadow-lg opacity-90">
            {getResourceLabel(activeId)}
          </div>
        ) : null}
      </DragOverlay>
      
      {/* Collection Import Dialog */}
      <CollectionImportDialog
        isOpen={showLoadDialog}
        onClose={() => setShowLoadDialog(false)}
      />
      
      {/* Export Progress Toast */}
      {(exportProgress.isExporting || exportProgress.message) && (
        <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[280px] animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3">
            {/* Icon */}
            <div className="flex-shrink-0">
              {exportProgress.isExporting ? (
                <Package className="w-6 h-6 text-blue-500 animate-pulse" />
              ) : exportProgress.current === -1 || exportProgress.message.includes('Error') || exportProgress.message.includes('failed') ? (
                <XCircle className="w-6 h-6 text-red-500" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              )}
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Active export: show progress */}
              {exportProgress.isExporting && exportProgress.total > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {exportProgress.current} / {exportProgress.total}
                    </span>
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {Math.round((exportProgress.current / exportProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full transition-all duration-300 ease-out"
                      style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                /* Completed or error: show message */
                <p className={`text-sm font-medium truncate ${
                  exportProgress.current === -1 || exportProgress.message.includes('Error') || exportProgress.message.includes('failed')
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
                }`}>
                  {exportProgress.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </DndContext>
  )
}
