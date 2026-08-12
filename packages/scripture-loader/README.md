# `@bt-synergy/scripture-loader`

Loads Door43 scripture (USFM) via **USJ + AlignmentMap** SoT for catalog-manager / tc-study.

## Process path: USJ only (usfm-js removed)

`USFM → UsjDocument + AlignmentMap → UsjScriptureViewModel` (+ temporary `ProcessedScripture` projection).

| API | Use |
|-----|-----|
| `processUsfmToUsjResult({ usfmText, bookId })` | **Preferred** — `{ viewModel, scripture, cacheContent, usj, alignmentMap }` |
| `viewModelFromUsjCache(content, bookId, proc)` | Rebuild view model from `scripture-usj:` entry |
| `processUsfmToScripture({ usfmText, bookId })` | Transitional — projection only |
| `ScriptureLoader.loadViewModel` / `loadScriptureResult` | Preferred Viewer path |
| `ScriptureLoader.loadContent` | Helps — returns `ProcessedScripture` projection from USJ |

Identity contract: `semanticIdFor` / `UsjWordToken` — see plan **Authoritative runtime contract**.

### Storage

| Namespace | Role |
|-----------|------|
| `scripture-usj:…` | **Primary** — write on process; prefer read |
| `scripture:…` | Legacy migrate-read only (no new writes) |

- Content `processingVersion`: `2.0.0-usj` (+ embedded `@usfm-tools/parser` / `usj-core` versions).
- Mismatched versions are refused (deleted) and reprocessed on next fetch.
- Chapter / `:alignments` chunks via `@bt-synergy/cache-adapter-indexeddb`.

### Clear cache

IndexedDB DB: `tc-study-cache` / store `cache-entries`.

DevTools → Application → IndexedDB → delete keys starting with `scripture:` and/or `scripture-usj:`,  
or wipe the DB, then reload so books re-fetch and reprocess.

### tc-study

```bash
bun run dev -- --port 8080 --host
```

Requires sibling `usfm-ast` built + `node packages/usj-processor/scripts/link-usfm-tools.cjs`  
(Vite aliases `@usfm-tools/*` in `apps/tc-study/vite.config.js`).
