# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch tip:** `092f238` (Viewer viewModel) atop Pipeline `0d2a468`/`b809ede`, vite worker fix `68ed5ef`, Helps `960dd13`/`89b99aa`, QA `81dc317`.

## Authoritative contract (do not regress)

| Layer | SoT |
|-------|-----|
| Parse / IndexedDB | `UsjDocument` + `AlignmentMap` under `scripture-usj:` |
| Runtime identity | `UsjScriptureViewModel` / `UsjWordToken` |
| Match key | `semanticId = ${verseRef}:${content}:${occurrence}` (`.toLowerCase()`) |
| Cross-resource | `alignedOriginalWordIds` on gateway tokens |
| Viewer load | `loadScriptureResult` / `loadViewModel` → viewModel (**done** `092f238`) |
| Helps load | Still `loadContent()` → ProcessedScripture projection (**intentional**) |
| Rollback | Lazy usfm-js via `USE_USJ_PIPELINE=0` / `VITE_USE_USJ_PIPELINE=0` |

## Automated gates

| Gate | Owner | Command / artifact | Status |
|------|-------|--------------------|--------|
| ViewModel identity + Titus parity + Paul↔Παῦλος | Pipeline / QA | `bun test packages/usj-processor` | **Green** |
| Flag on/off + TN STEP1 + storage + loadViewModel | Pipeline / QA | `bun test packages/scripture-loader` | **Green** |
| QuoteMatcher occurrence + `&` multipart | Helps / QA | `bun test packages/resource-parsers/src/utils/quote-matcher.test.ts` | **Green** |
| Helps quote → Paul/God underline | Helps / QA | `bun test apps/tc-study/src/features/helps/usjHelpsUnderline.integration.test.ts` | **Green** |
| Viewer `loadScriptureResult` adapter unit | Viewer / QA | `loadUsjViewModel.test.ts` (in suite) | **Green** |
| ScriptureViewer uses viewModel / `UsjWordToken` | Viewer | `092f238` | **Done** |
| E2E Journey 4 (underline + quote click) | Helps / QA | Playwright `04-helps-interaction` | **Red** — see blocker |
| E2E Journey 8 (Paul ↔ Παῦλος) | Helps / QA | Playwright `08-usj-alignment-highlight` | **Red** — see blocker |
| Manual soak matrix | QA | `docs/USJ_SOAK_MATRIX.md` | **Pending** (blocked by registration) |

**Local unit/integration (2026-08-12 on `092f238`):** **36 pass / 0 fail**.

**Vite worker:** `worker.format: 'es'` landed (`68ed5ef`) — local preview build succeeds.

**E2E blocker (current):** Journey 4/8 fail at catalog ready with  
`Resource type registration failed: exports is not defined`  
(CJS/ESM interop in prod bundle — likely `@usfm-tools/parser` / usj-processor bridge pulled into app registration path). Separate e2e agent may be fixing; not a semantic-ID parity miss.

## Go / no-go

| Decision | Recommendation |
|----------|----------------|
| **(a) Merge USJ-default PR #19** | **NO-GO / hold** until Journey 4/8 green (or equivalent registration fix) + sample soak rows 1–5 |
| **(b) Delete usfm-js / `@bt-synergy/usfm-processor`** | **NO-GO** |

## Remaining blockers only

| Team | Blocker | Blocks |
|------|---------|--------|
| **Platform / E2E** | Prod bundle `exports is not defined` during resource-type registration | Journey 4/8, browser soak, merge confidence |
| **Pipeline** | usfm-js still present (lazy rollback); types/`ProcessedScripture` still coupled for Helps `loadContent()` | Hard delete of usfm-js |
| **Platform** | `@usfm-tools/*` sibling `dist/` / link-script bridge | Prod cutover without sibling clone |
| **QA** | Manual soak matrix unsigned (blocked by registration) | Merge sign-off |

**Cleared since last QA note:** Viewer viewModel cutover; vite worker `iife` build failure.

## Delete order (only when e2e+soak green and teams clear)

1. CI green including Playwright 4 & 8  
2. Helps migrates off needing usfm-processor package (or types re-homed)  
3. Remove lazy `import('@bt-synergy/usfm-processor')` rollback  
4. Dedicated PR: drop deps → delete package + usfm-js  
5. Drop dual-read of legacy `scripture:` after one migrating release  

## Rollback (until delete)

```bash
USE_USJ_PIPELINE=0
# or
VITE_USE_USJ_PIPELINE=0
```

Clear IndexedDB keys matching `scripture:` and `scripture-usj:` (or wipe origin site data), reload.
