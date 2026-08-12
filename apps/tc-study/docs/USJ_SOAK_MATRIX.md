# USJ soak matrix (manual) — Titus linked panels

Clear `scripture:` / `scripture-usj:` IndexedDB keys (or wipe origin data) before each pass. Default build = USJ on (`678c928+`).

## Resources

- UGNT (el-x-koine) Titus  
- Gateway / ULT (or local GLT) Titus  
- TN / CombinedHelps  

## Matrix

| # | Action | Expected | Pass? | Notes |
|---|--------|----------|-------|-------|
| 1 | Studio: scripture + CombinedHelps on Titus 1:1 | Verses render; no registration failure | **Y** | Browser soak `678c928`: cleared 2500 scripture keys; app OK; tokens use `tit 1:1:…` semanticIds |
| 2 | Click OL ↔ gateway (Παῦλος / Paul / Pablo) | Cross-panel highlight both ways | **Y** | Journey 8 (Paul↔Παῦλος) 2/2; browser: Pablo click → `data-highlighted` + helps token filter |
| 3 | Click Θεοῦ / God (or Dios) aligned pair | Cross-panel / local highlight | **Y** | Covered by Journey 4 quote→God + integration Θεοῦ→God |
| 4 | TN note quote | Quote clickable; coverage underline (`data-underlined`) | **Y** | Journey 4 underline + quote click |
| 5 | Click TN quote | Scripture highlight on aligned token | **Y** | Journey 4 |
| 6 | Click token → helps filter | Helps narrows / clear-filter appears | **Y** | Browser: Pablo click shows “Clear token filter” |
| 7 | Navigate Titus 1→2→3 | Highlights still resolve | — | Not re-run this pass |
| 8 | Hard refresh after USJ cache write | Second load from `scripture-usj:` | — | Not re-run this pass |
| 9 | Rollback `VITE_USE_USJ_PIPELINE=0` | Legacy path sample | — | Not re-run (rollback still present in code) |
| 10 | Re-enable USJ default | USJ restored | — | N/A this pass |

## Automated (authoritative for highlight/underline)

| Check | Where | Result |
|-------|--------|--------|
| ViewModel + Paul↔Παῦλος | `bun test packages/usj-processor` | green |
| Pipeline + TN STEP1 | `bun test packages/scripture-loader` | green |
| QuoteMatcher | `quote-matcher.test.ts` | green |
| Helps underline integration | `usjHelpsUnderline.integration.test.ts` | green |
| Journey 4 + 8 | Playwright | **4/4 green** on `678c928` |

## Soak findings log

| Date | Tester | Commit | Result | Blockers |
|------|--------|--------|--------|----------|
| 2026-08-12 | QA | `678c928` | Unit **36/36**; E2E Journey 4/8 **4/4**; browser: registration OK after scripture IDB clear; Titus token highlight + helps filter OK. Merge-ready for USJ-default. | usfm-js delete still NO-GO (rollback, Helps loadContent, packaging bridge) |
