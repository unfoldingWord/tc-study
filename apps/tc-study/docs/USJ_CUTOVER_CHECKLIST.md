# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch tip / QA final gate:** `6817f79` (docs) atop mobile `54950e9`, resource-parsers `b3e0e99`, Pipeline `e29d85a`

## DELETE WAVE COMPLETE

| Scope | Verdict |
|-------|---------|
| **tc-study scripture path** | **DELETE COMPLETE** |
| **Workspace-wide `usfm-js` npm / runtime imports** | **DELETE COMPLETE** |
| Non-runtime leftovers | Docs scrubbed. Facade names `USFMProcessor` / `usfm-processor.ts` deprecated → `processUsfmToOptimizedScripture` / `UsjScriptureProcessor` (thin aliases for one release). `catalog-cli` `contentType: 'usfm-json'` is a filesystem cache label, not an npm package. |

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
| resource-parsers (`b3e0e99` + DTO deprecate) | **Done** — `USFMProcessor` `@deprecated`; prefer `processUsfmToOptimizedScripture` |
| mobile (`54950e9` + rename) | **Done** — `UsjScriptureProcessor`; `usfm-processor` thin alias |
| Cache (`c0f101f`) | **Done** — `scripture-usj:` only; legacy ignored |
| Platform (`@usfm-tools` link / CI) | **Done** |

## Go / no-go

| Decision | Recommendation |
|----------|----------------|
| **(a) Merge PR #19** | Human merge when CI green — **do not auto-merge** |
| **(b) Delete wave (usfm-js unused; USJ parity gates green)** | **COMPLETE** |

## Cache clear (once)

**Do this once** after pulling the USJ cutover (users and local devs):

1. Open DevTools → **Application** → **IndexedDB** → `tc-study-cache` → `cache-entries`
2. Delete every key starting with `scripture:` **and** `scripture-usj:` (or delete the whole DB)
3. Reload the app and re-download / open books so they rewrite **only** under `scripture-usj:`

Why: legacy `scripture:` usfm-js / ProcessedScripture blobs are **hard-deprecated** — the loader never migrate-reads them. Offline skip and workers check `scripture-usj:` only. Stale/incompatible USJ entries are deleted and reprocessed from USFM source; if load fails offline with leftovers present, errors include a clear clear-cache hint.

## Rollback

No pipeline flag. Same as **Cache clear (once)** above, then reload and re-download.
