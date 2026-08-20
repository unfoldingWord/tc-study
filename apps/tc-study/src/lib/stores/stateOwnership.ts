/**

 * State ownership (tc-study) — sealed dual-store CQRS (Unlock 3).

 *

 * Two stores remain by design (not collapsed this wave):

 * - `workspaceStore` — **only** layout membership SoT (`panels[].resourceKeys` + package map)

 * - `useAppStore.loadedResources` — **read model** for viewers, updated solely by the

 *   projector via `appStoreMembership` (upsert/prune). Public AppStore has **no**

 *   `addResource` / `removeResource`. Enrichment uses `patchLoadedResources`

 *   (patch-by-key; never invents membership).

 *

 * Collapse to one store write API is a documented follow-up — not required for

 * Unlock 3 seal acceptance. Do not re-open public membership mutators on AppStore.

 *

 * **Projector is live:** panel membership → AppStore is one-way via

 * `features/workspace/projectPanelResourcesToAppStore.ts`, invoked from

 * `workspaceStore` after layout/restore and from `applyCombinedHelpsEnsure`.

 * Public UI mutations: `features/workspace/resourceMutations.ts` (also

 * `hooks/useResourceManagement.ts`). Prefer `addResource(resource, { panelId })`

 * (atomic) over add-then-`assignResourceToPanel`. Modal-only

 * `addResource(info)` without `panelId` is package-only (no AppStore membership /

 * no phantom panel keys) until assign.

 *

 * | Concern | Owner (SoT) | Notes |

 * |---------|-------------|--------|

 * | Panel assignment / package layout | `workspaceStore` (`features/workspace/workspaceStore.ts`; re-export `lib/stores/workspaceStore.ts`) | Live `WorkspacePackage` SoT for panels + resource keys |

 * | Resource-selection wizard UI (ephemeral) | `wizardStore` (`features/wizard/wizardStore.ts`; re-export `lib/stores/wizardStore.ts`) | Not persisted with workspace package; includes language catalog cache used by viewers |

 * | Loaded resources for rendering (read model) | `useAppStore` (`contexts/AppContext.tsx`) | Projection of workspace panel keys; membership sealed |

 * | BCV / scope / mode / history / passage-set / OBS nav | `navigationStore` (`features/nav/navigationStore.ts`) | `NavigationContext` is a thin facade/re-export only |

 * | Entry modals (TW/TA open/minimize/history) | `entryModalStore` (`features/entries/entryModalStore.ts`; deprecated re-export `store/studyStore.ts`) | |

 * | Catalog services (CatalogManager, registries, loaders, downloads) | `CatalogContext` + catalog/services modules | Inject via React context / hooks — never window globals |

 * | Saved named collections (library) | `packageStore` (`lib/stores/packageStore.ts`) | Persisted `ResourcePackage` / named collections, not live panel layout |

 *

 * Package vs collection vocabulary (documented dual — adapters only; do not invent a third term):

 * | Term | Layer | Owner / type |

 * |------|-------|----------------|

 * | **WorkspacePackage** | Live in-memory panel layout + resource map | `workspaceStore` / `WorkspacePackage` |

 * | **Collection** (UI + library) | Persisted named set of resource pointers + panelLayout | `packageStore` + `@bt-synergy/package-storage` (`ResourcePackage`) |

 * | **Adapters** | Convert live ↔ persisted | `features/workspace/workspaceCollectionHelpers.ts` (`workspaceToNamedCollection` / `namedCollectionToWorkspace`) |

 * UI routes/copy say "collection"; live SoT type is `WorkspacePackage`. Persistence APIs may say package.

 *

 * ## Messaging — single public surface (Unlock 2)

 *

 * One ownership model for shell containers **and** viewer STATE:

 *

 * | Layer | Import surface | Notes |

 * |-------|----------------|--------|

 * | Shells + production viewers + plugins | `@bt-synergy/resource-panels` | Sole public API for `LinkedPanelsContainer` / `LinkedPanel` / plugin registry **and** STATE/signal hooks |

 * | App ownership helpers | `features/messaging` (`scriptureTokensOwnership`) | Policy helpers only — **not** a second container/STATE façade |

 * | Underlying store | npm `linked-panels` (inside resource-panels + Vite alias/dedupe) | Implementation detail; one physical copy |

 * | DEV harness | `linked-panels` allowlisted | `components/test/**` only |

 *

 * **SoT:** one façade (`@bt-synergy/resource-panels`), one store (linked-panels under it).

 * The retired shell-only adapter (`shellLinkedPanels`) is gone — do not reintroduce a

 * competing import dialect for containers vs STATE.

 *

 * Enforced by `utils/messagingGuards.test.ts`. Silent `linked-panels` imports /

 * add-then-assign dual-writes are not allowed.

 *

 * Catalog readiness (hard gate):

 * - `servicesReady` — CatalogContext finished constructing core services (no network wait)

 * - `resourceTypesReady` — ResourceTypeInitializer registered plugins successfully

 * - `ready` / `useCatalogReady()` — both of the above; App gates Routes + workspace restore on it

 * - Registration errors fail closed (`resourceTypesError`); never treat Door43 download as ready

 *

 * Invariants (enforced by projector + guards):

 * - Panel `resourceKeys` ⊆ `useAppStore.loadedResources` keys (after projection)

 * - Layout mutations go through `resourceMutations` / workspace APIs; AppStore membership

 *   writes are sealed (`appStoreMembership` + projector only — see `appStoreWriteGuards`)

 * - Runtime enrichment uses `patchLoadedResources` / `setState` (patch-by-key; never creates keys)

 * - `setAnchorResource` never stub-creates missing resources

 * - Remove from panel / remove panel / remove from package / createNewPackage project+prune AppStore

 * - CombinedHelps lifecycle (single store-facing writer):

 *   - Pure: `ensureCombinedHelpsInWorkspace` (inject when TN+TWL pair present; remove when a side drops;

 *     preserve panel-2 `activeIndex` by key — never unconditional CombinedHelps force)

 *   - Store write: `applyCombinedHelpsEnsure` (Read bootstrap) + `workspaceResourceSlice`

 *     membership mutations (add/assign/remove/move) → full panel project + prune `removed` ids

 *   - UI hide policy: `helpsPanelPolicy` hides raw TN/TWL tabs when CombinedHelps is present

 *

 * resource-panels STATE ownership (no shared-key LWW):

 * - `SCRIPTURE_TOKENS` — single owner (`isScriptureTokensOwner`: lastActive → anchor → deny)

 * - `OBS_FRAME_QUOTES_TN` / `OBS_FRAME_QUOTES_TWL` — per-publisher; ObsViewer merges

 * - `NOTES_TOKEN_GROUPS_TN` / `NOTES_TOKEN_GROUPS_TWL` — when CombinedHelps is the active helps

 *   surface (TN/TWL tabs hidden), CombinedHelps is the sole publisher for both keys; raw TN/TWL

 *   viewers only publish when mounted as the active tab (CombinedHelps absent). ScriptureViewer merges.

 * - Leave/unmount clears via `clearResourceState` (no empty `tokenGroups: []` / sendToAll on leave)

 *

 * Obsolete patterns (do not reintroduce):

 * - Window bootstrap / migration flags for catalog manager or catalog initialized

 * - Empty placeholder stores (`panelStore` / `resourceStore` — removed)

 * - Soft-timeout “ready” fiction that marks the app ready before services + types exist

 * - Public `useAppStore.addResource` / `removeResource` (retired Unlock 3 — use projector path)

 * - Scattered workspace → AppStore membership dual-writes

 * - `loadReadLanguageCatalog` / modal `addResource` without panelId writing AppStore membership

 * - `setAnchorResource` stub-creating missing `loadedResources` entries

 * - Production app code importing `from 'linked-panels'` (allowlist: `components/test/**` only)

 * - Shell-only messaging adapters / dual import dialects (containers via one path, STATE via another)

 * - Studio/catalog add-then-`assignResourceToPanel` when `{ panelId }` atomic path exists

 *

 * Test lanes (do not equate arch-freeze green with product QA):

 * - `bun run test:behavior` — product/unit tests (excludes Freeze / Size / Guards / *.guard / assertAllPluginsRegistered)

 * - `bun run test:arch` — arch-freeze + LOC + import/guard ratchets only

 * - Globs documented in `scripts/test-lanes.cjs`

 *

 * Stale boot docs that still mention legacy window catalog globals are historical; see banners on

 * `WORKSPACE_INITIALIZATION_FLOW.md` and related troubleshooting notes.

 */



export {}


