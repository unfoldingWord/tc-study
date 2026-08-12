# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch:** `feat/usj-replace-usfm-js`

## Authoritative contract (do not regress)

| Layer | SoT |
|-------|-----|
| Parse / IndexedDB | `UsjDocument` + `AlignmentMap` under `scripture-usj:` |
| Runtime identity | `UsjScriptureViewModel` / `UsjWordToken` |
| Match key | `semanticId = ${verseRef}:${content}:${occurrence}` |
| Cross-resource | `alignedOriginalWordIds` |
| Viewer | `loadScriptureResult` / `loadViewModel` (**done**) |
| Helps | `loadViewModel` + `viewModelToOptimizedChapters` / `extractUsjBroadcastTokens` (**done** — USJ-only) |
| Rollback | **Removed** — `USE_USJ_PIPELINE` / lazy usfm-js path deleted |

## Pipeline wave status

| Item | Status |
|------|--------|
| USJ-only `processUsfm` / `ScriptureLoader` | **Done** |
| Delete `USE_USJ_PIPELINE` opt-out | **Done** |
| Types owned by `@bt-synergy/usj-processor` | **Done** |
| `@bt-synergy/usfm-processor` package deleted | **Done** |
| tc-study imports → `@bt-synergy/scripture-loader` | **Done** |
| Workers / download path USJ-only | **Done** |
| Cache write: `scripture-usj:` only; legacy `scripture:` migrate-read | **Done** |
| Helps zero usfm-processor/usfm-js on CombinedHelps path | **Done** (`db38685`, `7e8159d`) |
| `bun test` usj-processor + scripture-loader | **29/29 green** |

## Automated gates

| Gate | Status |
|------|--------|
| `bun test packages/usj-processor packages/scripture-loader` | **29/29** |
| Playwright Journey 4 / 8 | Re-verify after push |
| Manual soak matrix | See `USJ_SOAK_MATRIX.md` |

## Go / no-go

| Decision | Recommendation |
|----------|----------------|
| **(a) Merge PR #19** | Human merge when CI green |
| **(b) Delete usfm-js from tc-study scripture path** | **GO** — `@bt-synergy/usfm-processor` deleted; loader/workers USJ-only |

## Remaining workspace refs (out of Pipeline / non-blocking for tc-study scripture)

| Area | Ref |
|------|-----|
| `packages/resource-parsers` | Own `usfm-js` dep + `parsers/usfm/usfm-processor.ts` (QuoteMatcher Optimized DTOs are separate) |
| `apps/mobile` | Local `usfm-js` + `lib/services/usfm-processor.ts` |
| Docs | Stale mentions in `RENDERING_*.md`, `packages/README.md`, soak matrix rollback row |
| `catalog-cli` | `usfm-json` contentType string (filesystem cache ext only) |

## Rollback

No pipeline flag. Clear IndexedDB keys matching `scripture:` and `scripture-usj:`, reload, re-download.
