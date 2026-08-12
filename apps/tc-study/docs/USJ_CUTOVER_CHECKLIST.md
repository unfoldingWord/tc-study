# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch tip:** `89b99aa` (Helps e2e) atop Pipeline `ddc0a56` + Helps `960dd13`.

## Authoritative contract (do not regress)

| Layer | SoT |
|-------|-----|
| Parse / IndexedDB | `UsjDocument` + `AlignmentMap` under `scripture-usj:` |
| Runtime identity | `UsjScriptureViewModel` / `UsjWordToken` |
| Match key | `semanticId = ${verseRef}:${content}:${occurrence}` (`.toLowerCase()`) |
| Cross-resource | `alignedOriginalWordIds` on gateway tokens |
| Transitional UI DTO | `projectToProcessedScripture(viewModel)` → `ProcessedScripture` |
| Loader return today | `ScriptureLoader` still surfaces **ProcessedScripture only** (projection) |

Legacy usfm-js is **opt-out only** (`USE_USJ_PIPELINE=0` / `VITE_USE_USJ_PIPELINE=0`) until delete.

## Automated gates (QA verified locally)

| Gate | Owner | Command / artifact | Status |
|------|-------|--------------------|--------|
| ViewModel identity + Titus parity + Paul↔Παῦλος | Pipeline / QA | `bun test packages/usj-processor` | **Green** |
| Flag on/off + TN STEP1 + storage cutover | Pipeline / QA | `bun test packages/scripture-loader` | **Green** |
| QuoteMatcher occurrence + `&` multipart | Helps / QA | `bun test packages/resource-parsers/src/utils/quote-matcher.test.ts` | **Green** |
| Helps quote → broadcast → Paul/God underline | Helps / QA | `bun test apps/tc-study/src/features/helps/usjHelpsUnderline.integration.test.ts` | **Green** |
| E2E Journey 4 (underline + quote click) | Helps / QA | Playwright `04-helps-interaction` | Specs on `89b99aa`; **local e2e blocked** (see below) — rely on CI |
| E2E Journey 8 (Paul ↔ Παῦλος) | Helps / QA | Playwright `08-usj-alignment-highlight` | Specs on `89b99aa`; **local e2e blocked** — rely on CI |
| Manual soak matrix | QA | `docs/USJ_SOAK_MATRIX.md` | **Pending** (rows empty) |

Combined local unit/integration (2026-08-12): **34 pass / 0 fail**  
(`usj-processor` + `scripture-loader` + `quote-matcher.test.ts` + `usjHelpsUnderline.integration.test.ts`).

**Local e2e blocker (QA):** `bun run test:e2e` fails at `vite build` with  
`Invalid value "iife" for option "worker.format"` from `useBackgroundDownload.ts` worker bundling. Not a USJ parity failure — Platform / app-build to clear before local Playwright soak.

## Go / no-go

| Decision | Recommendation |
|----------|----------------|
| **Ship USJ as default (this PR)** | **Conditional GO** — automated identity/helps/parity green; complete Journey 4/8 in CI + sample soak rows 1–5 before merge |
| **Delete usfm-js / `@bt-synergy/usfm-processor` now** | **NO-GO** |

### Delete blockers (hard)

| Team | Blocker |
|------|---------|
| **Viewer** | viewModel cutover still WIP; when importing `@bt-synergy/usj-processor` must add workspace dep to `apps/tc-study/package.json` |
| **Pipeline** | Loader returns ProcessedScripture only; types still live in `usfm-processor` |
| **Platform** | `@usfm-tools/*` sibling `dist/` / link-script bridge; local e2e `worker.format=iife` vite build failure |
| **QA** | Full soak matrix sign-off (manual rows still empty); Journey 4/8 CI green not yet confirmed here |

## Delete order (only when all hard blockers clear)

1. CI green including Playwright 4 & 8  
2. Viewer consumes viewModel/`semanticId` end-to-end (no uniqueId drift)  
3. Loader optionally exposes viewModel; `ProcessedScripture` types re-homed  
4. Remove lazy `import('@bt-synergy/usfm-processor')` rollback  
5. Drop workspace deps → delete package + usfm-js in a **dedicated** PR  
6. Drop dual-read of legacy `scripture:` after one migrating release  

## Rollback (until delete)

```bash
USE_USJ_PIPELINE=0
# or
VITE_USE_USJ_PIPELINE=0
```

Clear IndexedDB keys matching `scripture:` and `scripture-usj:` (or wipe origin site data), reload.
