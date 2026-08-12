# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch tip:** `54950e9` (mobile USJ) atop resource-parsers `b3e0e99`, Viewer `45107f9`, Pipeline `e29d85a`  
**QA re-verify tip:** `54950e9`

## Two-tier delete status

| Scope | Verdict |
|-------|---------|
| **tc-study scripture path** (`usj-processor`, `scripture-loader`, `apps/tc-study` code) | **DELETE COMPLETE** |
| **Workspace-wide `usfm-js` npm dep** | **COMPLETE** for packages + mobile — only stale docs / `usfm-json` contentType strings remain |

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

## Automated gates (QA @ `54950e9`)

| Gate | Status |
|------|--------|
| Key suites (usj-processor + scripture-loader + resource-parsers + helps quote/underline) | **85/85 green** |
| Mobile USJ smoke (`usfm-processor.usj.smoke.test.ts`) | **2/2 green** |
| Pipeline packages @ delete | **29/29** @ `e29d85a` |
| Playwright Journey 4 / 8 | Re-run after port fix (see soak / PR comment) |
| Helps unit/integration | **50 green** @ `7e8159d` |
| Manual soak matrix | See `USJ_SOAK_MATRIX.md` |

## Team wave status

| Team | Item | Status |
|------|------|--------|
| **Helps** | CombinedHelps/QuoteMatcher on viewModel | **Done** (`db38685`, `7e8159d`) |
| **Viewer** | viewModel path; zero tc-study code imports of usfm-processor/usfm-js | **Done** (`45107f9`) |
| **Pipeline** | Delete `@bt-synergy/usfm-processor`; USJ-only loader | **Done** (`e29d85a`) |
| **resource-parsers** | Drop `usfm-js`; USFM via `USJProcessor`; Helps projection helpers here | **Done** (`b3e0e99`) |
| **mobile** | Drop `usfm-js`; local processor → `USJProcessor` facade | **Done** (`54950e9`) |
| **Platform** | `@usfm-tools/*` link + Vite aliases; CI nests `usfm-ast/` | **Done** |

## Go / no-go

| Decision | Recommendation |
|----------|----------------|
| **(a) Merge PR #19** | Human merge when CI green — **do not auto-merge** |
| **(b) tc-study scripture / app code usfm-js delete** | **COMPLETE** |
| **(c) Workspace-wide usfm-js purge** | **COMPLETE** for packages + mobile (stale docs / `usfm-json` strings only) |

## Delete-wave exit criteria (tc-study scripture)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No runtime `usfm-js` dep for tc-study scripture packages | **Met** |
| 2 | `@bt-synergy/usfm-processor` removed | **Met** |
| 3 | Unit/integration green | **Met** (85/85 key suites @ `b3e0e99`) |
| 4 | Journey 4/8 e2e green | Pending re-run after preview port clash |
| 5 | Soak: Titus underlines + OL↔ULT highlights | **Met** (prior + units) |
| 6 | Checklist: tc-study scripture delete **COMPLETE** | **Met** |

## Workspace leftovers (ranked)

| Rank | Area | Status / justification |
|------|------|------------------------|
| 1 | Stale docs / local `bundle-stats.json` | Non-runtime (`bundle-stats.json` gitignored). |
| — | `catalog-cli` `usfm-json` | ContentType string only — not the npm package. |
| ~~resource-parsers~~ | | **Cleared** @ `b3e0e99` |
| ~~apps/mobile~~ | | **Cleared** @ `54950e9` |

## Rollback

No pipeline flag. Clear IndexedDB keys matching `scripture:` and `scripture-usj:`, reload, re-download.
