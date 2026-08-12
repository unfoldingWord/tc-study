# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch tip:** `1050658` (Pipeline docs) atop delete `e29d85a`, Helps `7e8159d` / `db38685`  
**QA re-verify tip:** `1050658` / `e29d85a`

## Two-tier delete status

| Scope | Verdict |
|-------|---------|
| **tc-study scripture path** (`usj-processor`, `scripture-loader`, `apps/tc-study` scripture) | **DELETE COMPLETE** |
| **Workspace-wide `usfm-js`** | **Not complete** — justified leftovers remain (below) |

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

## Automated gates (QA @ `1050658`)

| Gate | Status |
|------|--------|
| `bun test` usj-processor + scripture-loader + quote-matcher + usjHelpsUnderline + viewer | **40/40 green** |
| Pipeline packages (`usj-processor` + `scripture-loader`) | **29/29** @ `e29d85a` |
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
| **(a) Merge PR #19** | Human merge when CI green — **do not auto-merge** |
| **(b) tc-study scripture usfm-js / `@bt-synergy/usfm-processor` delete** | **COMPLETE** (`e29d85a`) |
| **(c) Workspace-wide usfm-js purge** | **OPEN** — leftovers below |

## Delete-wave exit criteria (tc-study scripture)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No runtime `usfm-js` dep for tc-study scripture packages | **Met** |
| 2 | `@bt-synergy/usfm-processor` removed | **Met** |
| 3 | Unit/integration green | **Met** (40/40) |
| 4 | Journey 4/8 e2e green | **Met** (4/4 @ tip) |
| 5 | Soak: Titus underlines + OL↔ULT highlights | **Met** |
| 6 | Checklist: tc-study scripture delete **COMPLETE** | **Met** |

## Workspace leftovers (ranked)

| Rank | Area | Status / justification |
|------|------|------------------------|
| 1 | `packages/resource-parsers` | Still depends on `usfm-js` + exports `USFMProcessor`. **tc-study does not import `USFMProcessor`** (only `QuoteMatcher` + Optimized* / TN types). Types already split for Helps. Other teams purging. |
| 2 | `apps/mobile` | Separate Expo app with local `usfm-js` — **out of PR #19 / tc-study scripture scope** (justified leftover for this PR). |
| 3 | Stale docs / `bundle-stats.json` | Historical mentions only — non-runtime. |
| — | `catalog-cli` `usfm-json` | ContentType string only — not the npm package. |

## Rollback

No pipeline flag. Clear IndexedDB keys matching `scripture:` and `scripture-usj:`, reload, re-download.
