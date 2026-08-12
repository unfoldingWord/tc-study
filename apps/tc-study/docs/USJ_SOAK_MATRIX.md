# USJ soak matrix (manual) — Titus linked panels

Clear `scripture:` / `scripture-usj:` IndexedDB keys (or wipe origin data) before each pass. Default build = USJ on (`092f238+` Viewer viewModel; Pipeline `loadViewModel`).

## Resources

- UGNT (el-x-koine) Titus  
- ULT (en) Titus  
- TN (en) Titus  
- Optional: TWL  

## Matrix

| # | Action | Expected | Pass? | Notes |
|---|--------|----------|-------|-------|
| 1 | Studio: UGNT + ULT + CombinedHelps on Titus 1:1 | Verses render; no pageerrors | | |
| 2 | Click **Παῦλος** (UGNT) | **Paul** (ULT) highlights; reverse also works | | |
| 3 | Click **Θεοῦ** / **God** | Cross-panel highlight both ways | | |
| 4 | TN note quote Θεοῦ | Quote clickable; **God** has `data-underlined="true"` | | |
| 5 | Click TN quote | Scripture highlight on God / aligned OL | | |
| 6 | Click non-covered English token | Local highlight + helps verse filter; no crash | | |
| 7 | Navigate Titus 1→2→3; spot-check alignments | Highlights still resolve | | |
| 8 | Hard refresh after USJ cache write | Second load from `scripture-usj:`; same highlights | | |
| 9 | Rollback `VITE_USE_USJ_PIPELINE=0`, clear caches | Legacy path; sample rows 1–5 | | |
| 10 | Re-enable USJ default, clear caches | USJ behavior restored | | |

## Automated (skip manual if green)

| Check | Where |
|-------|--------|
| ViewModel identity + Paul↔Παῦλος | `bun test packages/usj-processor` |
| Pipeline flag parity + TN STEP1 | `bun test packages/scripture-loader` |
| QuoteMatcher occurrence + `&` multipart | `bun test packages/resource-parsers/src/utils/quote-matcher.test.ts` |
| Helps quote → broadcast → Paul/God underline | `bun test apps/tc-study/src/features/helps/usjHelpsUnderline.integration.test.ts` |
| TN quote + underline + token click | Playwright Journey 4 |
| Paul ↔ Παῦλος linked panels | Playwright Journey 8 |

## Soak findings log

| Date | Tester | Commit | Result | Blockers |
|------|--------|--------|--------|----------|
| 2026-08-12 | QA | `89b99aa` | Unit 34/34; e2e blocked on vite worker iife (later fixed). | — |
| 2026-08-12 | QA | `092f238` | Unit/integration **36/36 green**. Vite worker `es` OK. Journey 4/8 **fail**: `Resource type registration failed: exports is not defined`. Manual soak blocked. | Platform/E2E CJS interop; usfm-js delete still NO-GO |
