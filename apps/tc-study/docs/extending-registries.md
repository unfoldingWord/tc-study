# Extending the three registries

How to register Door43 resource types, pane-member entries, composition entries, and panel modes in tc-study.

Chrome (tabs today) is not a registry. Viewer on a resource type is not a paint signal.

## Three registries

| Registry | Job | Package | App defs |
|----------|-----|---------|----------|
| **Resources** | Load catalog types (subjects, loader, `contentRole`) | `ResourceTypeRegistry` | `src/resourceTypes/*.ts` via `RESOURCE_TYPE_PLUGIN_EXPORTS` |
| **Panel entries** | What may appear in a pane (1:1 or composition) | `PanelEntryRegistry` | `panelEntries.ts`, `combinedHelps.ts` via `PANEL_ENTRY_PLUGIN_EXPORTS` |
| **Panel modes** | What a pane may show (`allows` entry types) | `PanelModeRegistry` | `panelModes.ts` via `PANEL_MODE_PLUGIN_EXPORTS` |

Panel **groups** (`PanelGroupRegistry`, `panelGroups.ts`) exist for later scripture-vs-OBS / workspaces. Read chrome does not use them this slice. `groupId` on entries/modes is reserved, not a third mode.

Types live in `packages/resource-types/src/`: `panelEntry.ts`, `PanelEntryRegistry.ts`, `panelMode.ts`, `PanelModeRegistry.ts`, `panelGroup.ts`.

## Dual-register to paint

A catalog resource paints in the switcher only if:

1. it is a registered **resource type**, and
2. a **pane-member or composition entry** consumes that type, and
3. an **entry instance** is in `panel.entries`.

Registration ≠ membership. `ensureCompositions` binds instances after types + entries exist.

| Kind | Resource type? | Panel entry? | Paints as tab? |
|------|----------------|--------------|----------------|
| Scripture / OBS | yes | pane-member (`primary-text`) | yes |
| TQ / OBS-TQ | yes | pane-member (`helps`) | yes |
| TN / TWL (and OBS twins) | yes | **no** 1:1 — CombinedHelps consumes them | no |
| TW / TA | yes | **no** — modal `EntryViewerRegistry` only | no |
| CombinedHelps | **no** (not a Door43 type) | composition (`helps`) | yes |

Same resource type id may be bound by two entries (shared consume). Do not use exclusive as a consume lock.

## Register a Door43 resource type

Resource types load. They do not grant a tab.

1. Add a canonical id in `@bt-synergy/resource-catalog` (`RESOURCE_TYPE_IDS`) if it is new.
2. Add a `LOADER_CONFIGS` row in `src/config/loaderConfig.ts` (`surfaces.mainPlugin`, and `workerDownload` if the worker should fetch it). Use `getDownloadPriority(id)` in the plugin — do not hardcode priority.
3. Define the plugin with `defineResourceType` (required: `id`, `displayName`, `subjects`, `loader`).
4. Export it from `src/resourceTypes/index.ts`.
5. Append the export name to `RESOURCE_TYPE_PLUGIN_EXPORTS` in `src/resourceTypes/pluginRegistry.ts`.

`contentRole`: `'primary'` (scripture/OBS) · `'companion'` (TN, TQ, … + `companionFor`) · `'shared'` (TW, TA).

```ts
import { defineResourceType } from '@bt-synergy/resource-types'
import { getDownloadPriority } from '../config/loaderConfig'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const translationQuestionsResourceType = defineResourceType({
  id: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
  displayName: 'Translation Questions',
  contentRole: 'companion',
  companionFor: ['scripture'],
  subjects: ['TSV Translation Questions'],
  aliases: ['tq', 'questions'],
  loader: TranslationQuestionsLoader,
  downloadPriority: getDownloadPriority(RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS),
  viewer: asResourceViewer(TranslationQuestionsViewer), // optional; ≠ paint
})
```

TW/TA omit `viewer` on the resource type and register a modal viewer in `EntryViewerRegistry` (`docs/ENTRY_VIEWER_REGISTRY.md`).

Copy: `src/resourceTypes/translationQuestions.ts`, `translationWords.ts`, `scripture.ts`.

## Register a 1:1 panel entry

Pane-member = one consumed type paints as one tab. Put `icon` on the **entry**, not the resource.

```ts
import { definePanelEntry, type PanelEntryDefinition } from '@bt-synergy/resource-types'

export const questionsPanelEntry: PanelEntryDefinition = definePanelEntry({
  id: 'questions',
  displayName: 'Questions',
  icon: 'MessageCircleQuestion',
  kind: 'pane-member',
  entryType: 'helps',
  consumes: [RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS],
  groupId: 'scripture',
})
```

`definePanelEntry` required fields: `id`, `displayName`, `kind`, `entryType`, `consumes` (at least one). No `subjects`, no `loader`.

1. Add the export in `src/resourceTypes/panelEntries.ts`.
2. Re-export from `src/resourceTypes/index.ts`.
3. Append to `PANEL_ENTRY_PLUGIN_EXPORTS`.

New Lucide icon names go on the allowlist in `src/features/tabs/lucideIconRegistry.ts`. Do not rely on consume-inherit for icons.

Copy: `questionsPanelEntry` / `obsQuestionsPanelEntry` in `panelEntries.ts`.

## Register a composition entry

Multi-consume viewer. CombinedHelps is the pattern: TN + TWL (and OBS twins). Not a Door43 resource. Not a `LOADER_CONFIGS` row.

```ts
export const combinedHelpsPanelEntry = definePanelEntry({
  id: RESOURCE_TYPE_IDS.COMBINED_HELPS,
  displayName: 'Helps',
  icon: 'NotebookText',
  kind: 'composition',
  entryType: 'helps',
  consumes: [
    RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
    RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
  ],
  viewer: asResourceViewer(CombinedHelpsViewer),
  groupId: 'scripture',
  injectWhen: 'any', // or 'all'
  persistId: '__combined-helps__',
})
```

Composition-only extras (`definePanelEntry` enforces them): `viewer`, `persistId`, `injectWhen: 'any' | 'all'`.

- `any` — inject when at least one consumed type is in the package.
- `all` — inject only when every consumed type is present.

Same resource may be bound by two entries. Do **not** also register 1:1 pane-members for TN/TWL if CombinedHelps consumes them — they must not paint as tabs.

`persistId` is the instance-id base. Unscoped on the default helps pane; `:panel-N` elsewhere. OBS-safe match: `__combined-helps-obs__` ≠ `__combined-helps__:`.

Copy: `src/resourceTypes/combinedHelps.ts`. Append to `PANEL_ENTRY_PLUGIN_EXPORTS` (not `RESOURCE_TYPE_PLUGIN_EXPORTS`).

## Register a panel mode

A mode allowlists **entry types**, not resource type ids.

```ts
import { definePanelMode, type PanelModeDefinition } from '@bt-synergy/resource-types'

export const scripturePanelMode: PanelModeDefinition = definePanelMode({
  id: 'scripture',
  displayName: 'Scripture',
  allows: ['primary-text'],
})

export const helpsPanelMode: PanelModeDefinition = definePanelMode({
  id: 'helps',
  displayName: 'Helps',
  allows: ['helps'],
})
```

Current Read: `scripture` → `primary-text`; `helps` → `helps`. CombinedHelps and TQ are both `entryType: 'helps'`. OBS is nav/scope (`{bible|obs}`), not a third mode. Do not register OBS as a panel mode.

Append to `PANEL_MODE_PLUGIN_EXPORTS`. Copy: `src/resourceTypes/panelModes.ts`.

## Initializer order

`src/components/ResourceTypeInitializer.tsx` (fail-closed):

1. Resource types (`RESOURCE_TYPE_PLUGIN_EXPORTS`) — so `consumes` ids exist
2. Groups (`PANEL_GROUP_PLUGIN_EXPORTS`)
3. Modes (`PANEL_MODE_PLUGIN_EXPORTS`)
4. Entries (`PANEL_ENTRY_PLUGIN_EXPORTS`)
5. `setActiveRegistries(...)` (bind)
6. `reensureCurrentWorkspaceCompositions()` (membership)

Missing listed export or incomplete registry → `markResourceTypesFailed`. Never mark ready on partial success.

## Persist

`persistVersion` **2** (`WORKSPACE_PERSIST_VERSION` in `src/features/workspace/workspaceTypes.ts`).

```ts
interface PanelEntryInstance {
  instanceId: string
  entryId: string
  bindings: Partial<Record<string, string>> // resource type id → catalog key
}
```

- `panel.entries` is membership SoT.
- `panel.resourceKeys` is a painted projection of instance ids (dual-read on load).
- Package `resources` map is catalog `ResourceInfo` only.
- No fake CombinedHelps catalog row as SoT. Composition instance ids stay persist ids (`__combined-helps__`, `__combined-helps-obs__`).

## What not to do

- `registerComposition` on `ResourceTypeRegistry` — deleted. Use `definePanelEntry` + `PanelEntryRegistry`.
- `includeInLanguageLists` hacks to hide CombinedHelps from pickers — CombinedHelps is not a resource type.
- Remount on `navigate` to “refresh” membership. Re-ensure entries; do not tear down the pane.
- Persist ids in the URL. URL is nav (`{bible|obs}`, book, chapter), not membership.
- Treat `PanelEntryRegistry.resolve(resourceTypeId)` / `resolvePanelEntryForKey(typeId)` as “may paint.” Resolve is id / persist-id lookup. Paint = entry instance in `panel.entries` whose `entryType` is allowed by the current mode.
- Register CombinedHelps (or any composition) in `RESOURCE_TYPE_PLUGIN_EXPORTS` / `LOADER_CONFIGS`.
- Register 1:1 entries for types a composition already consumes if those types must stay off the tab strip.
