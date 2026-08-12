# USJ soak matrix (manual) — Titus linked panels

Clear `scripture:` / `scripture-usj:` IndexedDB keys (or wipe origin data) before each pass.  
Default build = USJ-only (Pipeline delete `e29d85a`; tip `1050658`).

## Resources

- UGNT (el-x-koine) Titus  
- Gateway / ULT (or local GLT) Titus  
- TN / CombinedHelps  

## Matrix

| # | Action | Expected | Pass? | Notes |
|---|--------|----------|-------|-------|
| 1 | Studio: scripture + CombinedHelps on Titus 1:1 | Verses render; no registration failure | **Y** | Prior soak + Helps viewModel cutover |
| 2 | Click OL ↔ gateway (Παῦλος / Paul / Pablo) | Cross-panel highlight both ways | **Y** | Journey 8 **2/2** @ tip |
| 3 | Click Θεοῦ / God (or Dios) aligned pair | Cross-panel / local highlight | **Y** | Journey 4 + integration |
| 4 | TN note quote | Quote clickable; coverage underline (`data-underlined`) | **Y** | Journey 4 |
| 5 | Click TN quote | Scripture highlight on aligned token | **Y** | Journey 4 |
| 6 | Click token → helps filter | Helps narrows / clear-filter appears | **Y** | Prior browser soak |
| 7 | Navigate Titus 1→2→3 | Highlights still resolve | — | Not re-run this pass |
| 8 | Hard refresh after USJ cache write | Second load from `scripture-usj:` | — | Not re-run this pass |
| 9 | Rollback `VITE_USE_USJ_PIPELINE=0` | Legacy path sample | **N/A** | Flag removed (`e29d85a`) |
| 10 | Re-enable USJ default | USJ restored | **N/A** | USJ-only |

## Automated (authoritative for highlight/underline)

| Check | Where | Result |
|-------|--------|--------|
| ViewModel + Paul↔Παῦλος | `bun test packages/usj-processor` | green |
| Pipeline / storage | `bun test packages/scripture-loader` | green |
| QuoteMatcher | `quote-matcher.test.ts` | green |
| Helps underline integration | `usjHelpsUnderline.integration.test.ts` | green |
| Viewer load + token highlight | `loadUsjViewModel` / `tokenHighlight` tests | green |
| Journey 4 + 8 | Playwright | **4/4 green** @ `1050658` / `e29d85a` |
| Combined parity suite | above | **40/40 green** |

## Soak findings log

| Date | Tester | Commit | Result | Blockers |
|------|--------|--------|--------|----------|
| 2026-08-12 | QA | `678c928` / docs `ec46829` | Unit **36/36**; E2E Journey 4/8 **4/4**; browser soak OK. | usfm-js delete NO-GO |
| 2026-08-12 | QA | Helps `7e8159d` | Unit **40/40**; Journey 4/8 **4/4**; Helps on viewModel. | Waited on Pipeline |
| 2026-08-12 | Pipeline | `e29d85a` / docs `1050658` | USJ-only; `@bt-synergy/usfm-processor` deleted; packages **29/29**. | Workspace leftovers |
| 2026-08-12 | QA | tip `1050658` | Re-verify: **40/40** units; Journey 4/8 **4/4**. **tc-study scripture DELETE COMPLETE**. | Workspace: `resource-parsers` + `apps/mobile` usfm-js (justified / out of scripture path) |
