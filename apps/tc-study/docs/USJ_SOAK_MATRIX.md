# USJ soak matrix (manual) — Titus linked panels

Clear `scripture:` / `scripture-usj:` IndexedDB keys (or wipe origin data) before each pass.  
Default build = USJ-only (**DELETE WAVE COMPLETE** @ tip `6817f79` / mobile `54950e9`).

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

## Automated (authoritative)

| Check | Result |
|-------|--------|
| usj-processor | **15/15** |
| scripture-loader | **14/14** |
| resource-parsers | **6/6** |
| Helps underline / quote | **14/14** |
| Mobile USJ smoke | **2/2** |
| Viewer load + highlight | **7/7** |
| Journey 4 + 8 | **4/4** |

## Soak findings log

| Date | Tester | Commit | Result | Blockers |
|------|--------|--------|--------|----------|
| 2026-08-12 | QA | `b3e0e99` | **85/85** key suites; Journey 4/8 **4/4**; resource-parsers clean | mobile |
| 2026-08-12 | QA | `54950e9` / `d99f712` | mobile usfm-js gone | docs only |
| 2026-08-12 | QA | tip `6817f79` final gate | Workspace `usfm-js` package.json + imports **empty**; suites green; Journey 4/8 **4/4**. **DELETE WAVE COMPLETE**. | None (runtime). Non-runtime: docs comments; `usfm-json` contentType string |
