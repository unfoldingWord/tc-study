# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch tip / QA final gate:** `6817f79` (docs) atop mobile `54950e9`, resource-parsers `b3e0e99`, Pipeline `e29d85a`

## DELETE WAVE COMPLETE

| Scope | Verdict |
|-------|---------|
| **tc-study scripture path** | **DELETE COMPLETE** |
| **Workspace-wide `usfm-js` npm / runtime imports** | **DELETE COMPLETE** |
| Non-runtime leftovers | Docs scrubbed (`scripture-resource` README; obsolete `package.json.backup` deleted). Facade names `USFMProcessor` / `usfm-processor.ts` kept on purpose (USJ-backed; comments clarified). `catalog-cli` `contentType: 'usfm-json'` is a filesystem cache label, not the npm package. No committed `bundle-stats.json` to scrub. |

## Authoritative contract (do not regress)

| Layer | SoT |
|-------|-----|
| Parse / IndexedDB | `UsjDocument` + `AlignmentMap` under `scripture-usj:` |
| Runtime identity | `UsjScriptureViewModel` / `UsjWordToken` |
| Match key | `semanticId = ${verseRef}:${content}:${occurrence}` |
| Cross-resource | `alignedOriginalWordIds` |
| Viewer | `loadScriptureResult` / `loadViewModel` |
| Helps | `loadViewModel` + `viewModelToOptimizedChapters` / `extractUsjBroadcastTokens` |
| Rollback | **Removed** — no `USE_USJ_PIPELINE` / lazy usfm-js |

## Final gate (strict QA @ tip)

| Check | Result |
|-------|--------|
| `package.json` depends on `usfm-js` | **None** (`git grep` empty) |
| Runtime `from 'usfm-js'` / `require('usfm-js')` | **None** |
| Lockfile `usfm-js` pins | **None** |
| `@bt-synergy/usfm-processor` package | **Deleted** |
| `bun test packages/usj-processor` | **15/15** |
| `bun test packages/scripture-loader` | **14/14** |
| `bun test packages/resource-parsers` | **6/6** |
| Helps underline + quote suites | **14/14** |
| Mobile USJ smoke | **2/2** |
| Viewer load + token highlight | **7/7** |
| Playwright Journey 4 + 8 | **4/4** |
| Soak (Titus underlines + OL↔ULT) | **Met** (prior soak + e2e/units) |

## Team wave status

| Team | Status |
|------|--------|
| Helps (`db38685`, `7e8159d`) | **Done** |
| Viewer (`45107f9`) | **Done** |
| Pipeline (`e29d85a`) | **Done** — deleted `@bt-synergy/usfm-processor` |
| resource-parsers (`b3e0e99`) | **Done** |
| mobile (`54950e9`) | **Done** |
| Platform (`@usfm-tools` link / CI) | **Done** |

## Go / no-go

| Decision | Recommendation |
|----------|----------------|
| **(a) Merge PR #19** | Human merge when CI green — **do not auto-merge** |
| **(b) Delete wave (usfm-js unused; USJ parity gates green)** | **COMPLETE** |

## Rollback

No pipeline flag. Clear IndexedDB keys matching `scripture:` and `scripture-usj:`, reload, re-download.
