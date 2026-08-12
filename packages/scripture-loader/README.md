# `@bt-synergy/scripture-loader`

Loads Door43 scripture (USFM) via **USJ + AlignmentMap** SoT for catalog-manager / tc-study.

## Process path: USJ only

`USFM → UsjDocument + AlignmentMap → UsjScriptureViewModel` (+ temporary `ProcessedScripture` projection).

| API | Use |
|-----|-----|
| `ScriptureLoader.loadScriptureResult` | **Primary** — `{ viewModel, scripture, fromUsjCache }` |
| `ScriptureLoader.loadViewModel` | **Primary** Viewer path — `UsjScriptureViewModel` |
| `ScriptureLoader.loadContent` | ResourceLoader / Helps — `ProcessedScripture` projection only |
| `processUsfmToUsjResult({ usfmText, bookId })` | Process without Door43 — `{ viewModel, scripture, cacheContent, … }` |
| `viewModelFromUsjCache(content, bookId, proc)` | Rebuild view model from `scripture-usj:` entry |
| `processUsfmToScripture({ usfmText, bookId })` | Transitional — projection only |

Identity contract: `semanticIdFor` / `UsjWordToken` — see plan **Authoritative runtime contract**.

### Storage

| Namespace | Role |
|-----------|------|
| `scripture-usj:…` | **Only** scripture cache path — write on process; read on load |
| `scripture:…` | **Hard-deprecated** — ignored (never migrate-read). Clear leftovers once |

- On `scripture-usj:` miss (or version refuse): re-fetch USFM source and re-process — do **not** serve legacy processed blobs.
- Content `processingVersion`: `2.0.0-usj` (+ embedded `@usfm-tools/parser` / `usj-core` versions).
- Mismatched versions are refused (deleted) and reprocessed on next fetch.
- Chapter / `:alignments` chunks via `@bt-synergy/cache-adapter-indexeddb`.

### Clear cache (once, cutover)

IndexedDB DB: `tc-study-cache` / store `cache-entries`.

DevTools → Application → IndexedDB → delete keys starting with `scripture:` **and** `scripture-usj:`,  
or wipe the DB, then reload so books re-fetch and reprocess into `scripture-usj:` only.

See `apps/tc-study/docs/USJ_CUTOVER_CHECKLIST.md` → **Cache clear (once)**.

### tc-study

```bash
bun run dev -- --port 8080 --host
```

Requires `@usfm-tools/*` from npm via `@bt-synergy/usj-processor` (`bun install` at repo root).  
See `packages/usj-processor/README.md` — Setup.
