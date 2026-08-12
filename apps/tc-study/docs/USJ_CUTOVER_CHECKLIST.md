# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch tip:** Pipeline `e29d85a` (USJ-only delete) atop Helps `7e8159d` / `db38685`

## Authoritative contract (do not regress)

| Layer | SoT |
|-------|-----|
| Parse / IndexedDB | `UsjDocument` + `AlignmentMap` under `scripture-usj:` |
| Runtime identity | `UsjScriptureViewModel` / `UsjWordToken` |
| Match key | `semanticId = ${verseRef}:${content}:${occurrence}` |
| Cross-resource | `alignedOriginalWordIds` |
| Viewer | `loadScriptureResult` / `loadViewModel` (**done**) |
| Helps | `loadViewModel` + `viewModelToOptimizedChapters` / `extractUsjBroadcastTokens` (**done**) |
| Rollback | **Removed** — no `USE_USJ_PIPELINE` / lazy usfm-js |

## Automated gates (QA)

| Gate | Status |
|------|--------|
| `bun test` usj-processor + scripture-loader (+ quote-matcher / helps / viewer) | **40/40 green** (QA); Pipeline packages **29/29** @ delete commit |
| Playwright Journey 4 | **2/2 green** |
| Playwright Journey 8 | **2/2 green** |
| Helps unit/integration | **50 green** @ `7e8159d` |
| Manual soak matrix | See `USJ_SOAK_MATRIX.md` |

## Team wave status

| Team | Item | Status |
|------|------|--------|
| **Helps** | CombinedHelps/QuoteMatcher on viewModel; zero usfm-processor in helps path | **Done** (`db38685`, `7e8159d`) |
| **Viewer** | `loadScriptureResult` → viewModel; SCRIPTURE_TOKENS via `extractUsjBroadcastTokens` | **Done** |
| **Pipeline** | Remove `USE_USJ_PIPELINE`; delete `@bt-synergy/usfm-processor`; USJ-only loader/workers | **Done** (`e29d85a`) |
| **Platform** | `@usfm-tools/*` link + Vite aliases; CI nests `usfm-ast/` | **Done** (see usj-processor README) |

## Go / no-go

| Decision | Recommendation |
|----------|----------------|
| **(a) Merge PR #19** | Human merge when CI green |
| **(b) Delete usfm-js / `@bt-synergy/usfm-processor` from tc-study scripture** | **COMPLETE** on remote (`e29d85a`) |

## Delete-wave exit criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No runtime `usfm-js` dep for tc-study scripture packages | **Met** |
| 2 | `@bt-synergy/usfm-processor` removed | **Met** |
| 3 | Unit/integration green | **Met** |
| 4 | Journey 4/8 e2e green | **Met** |
| 5 | Soak: Titus underlines + OL↔ULT highlights | **Met** |
| 6 | Checklist: delete wave **COMPLETE** for tc-study scripture | **Met** |

## Remaining workspace refs (out of tc-study scripture path)

| Area | Ref |
|------|-----|
| `packages/resource-parsers` | Own `usfm-js` + `parsers/usfm/usfm-processor.ts` |
| `apps/mobile` | Local `usfm-js` + `lib/services/usfm-processor.ts` |
| Docs / `bundle-stats.json` | Stale historical mentions |
| `catalog-cli` | `usfm-json` contentType string only |

## Rollback

No pipeline flag. Clear IndexedDB keys matching `scripture:` and `scripture-usj:`, reload, re-download.
