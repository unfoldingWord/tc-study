# USJ soak matrix (manual) — Titus linked panels

Clear `scripture:` / `scripture-usj:` IndexedDB keys (or wipe origin data) before each pass.  
Default build = USJ-only (tip `54950e9` / docs `d99f712`; workspace `usfm-js` npm deps cleared).

## Resources

- UGNT (el-x-koine) Titus  
- Gateway / ULT (or local GLT) Titus  
- TN / CombinedHelps  

## Matrix

| # | Action | Expected | Pass? | Notes |
|---|--------|----------|-------|-------|
| 1 | Studio: scripture + CombinedHelps on Titus 1:1 | Verses render; no registration failure | **Y** | Prior soak + Helps viewModel |
| 2 | Click OL ↔ gateway (Παῦλος / Paul / Pablo) | Cross-panel highlight both ways | **Y** | Journey 8 |
| 3 | Click Θεοῦ / God (or Dios) aligned pair | Cross-panel / local highlight | **Y** | Journey 4 + integration |
| 4 | TN note quote | Quote clickable; coverage underline (`data-underlined`) | **Y** | Journey 4 |
| 5 | Click TN quote | Scripture highlight on aligned token | **Y** | Journey 4 |
| 6 | Click token → helps filter | Helps narrows / clear-filter appears | **Y** | Prior browser soak |
| 7 | Navigate Titus 1→2→3 | Highlights still resolve | — | Not re-run |
| 8 | Hard refresh after USJ cache write | Second load from `scripture-usj:` | — | Not re-run |
| 9 | Rollback `VITE_USE_USJ_PIPELINE=0` | Legacy path sample | **N/A** | Flag removed |
| 10 | Re-enable USJ default | USJ restored | **N/A** | USJ-only |

## Automated (authoritative for highlight/underline)

| Check | Where | Result |
|-------|--------|--------|
| ViewModel + Paul↔Παῦλος | `bun test packages/usj-processor` | green |
| Pipeline / storage | `bun test packages/scripture-loader` | green |
| QuoteMatcher + USFMProcessor USJ | `packages/resource-parsers` | green @ `b3e0e99` |
| Helps underline / quote suites | `apps/tc-study/src/features/helps` | green |
| Journey 4 + 8 | Playwright | **4/4 green** @ `b3e0e99` |
| Combined key suites @ `b3e0e99` | above | **85/85 green** |

## Soak findings log

| Date | Tester | Commit | Result | Blockers |
|------|--------|--------|--------|----------|
| 2026-08-12 | QA | tip `1050658` | **40/40** units; Journey 4/8 **4/4**. tc-study scripture DELETE COMPLETE. | resource-parsers + mobile |
| 2026-08-12 | QA | tip `b3e0e99` | Key suites **85/85**; Journey 4/8 **4/4**; resource-parsers `usfm-js` **gone**. | mobile still open |
| 2026-08-12 | QA | tip `54950e9` / `d99f712` | Journey 4/8 **4/4** (@ `b3e0e99`); workspace `usfm-js` package.json + imports **empty**. | Stale docs / `usfm-json` strings only |
