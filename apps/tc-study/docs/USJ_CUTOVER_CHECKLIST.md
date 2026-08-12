# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch tip:** `678c928` (Vite CJS include for sibling `@usfm-tools/parser`) atop Viewer `092f238`, Pipeline `loadViewModel`, Helps e2e.

## Authoritative contract (do not regress)

| Layer | SoT |
|-------|-----|
| Parse / IndexedDB | `UsjDocument` + `AlignmentMap` under `scripture-usj:` |
| Runtime identity | `UsjScriptureViewModel` / `UsjWordToken` |
| Match key | `semanticId = ${verseRef}:${content}:${occurrence}` |
| Cross-resource | `alignedOriginalWordIds` |
| Viewer | `loadScriptureResult` → viewModel (**done**) |
| Helps | Still `loadContent()` → ProcessedScripture (**intentional**) |
| Rollback | Lazy usfm-js via `USE_USJ_PIPELINE=0` / `VITE_USE_USJ_PIPELINE=0` |

## Automated gates

| Gate | Status |
|------|--------|
| `bun test` usj-processor + scripture-loader + quote-matcher + usjHelpsUnderline (+ viewer load) | **36/36 green** (`678c928`) |
| Playwright Journey 4 (underline + quote click + local token click) | **2/2 green** |
| Playwright Journey 8 (Paul ↔ Παῦλος both ways) | **2/2 green** |
| Vite CJS sibling parser (`exports is not defined`) | **Fixed** (`678c928`) |
| Manual soak matrix | Sample rows filled — see `USJ_SOAK_MATRIX.md` |

## Go / no-go

| Decision | Recommendation |
|----------|----------------|
| **(a) Merge USJ-default PR #19** | **GO / merge-ready** — unit+e2e green; registration fixed; soak sample OK. Human merge still required (do not auto-merge). |
| **(b) Delete usfm-js / `@bt-synergy/usfm-processor`** | **NO-GO** |

## Remaining blockers for deleting usfm-js only

| Team | Blocker |
|------|---------|
| **Pipeline** | Lazy usfm-js rollback path still required until sunset policy |
| **Helps / Pipeline** | Helps still on `loadContent()` + `ProcessedScripture` coupling to `usfm-processor` types |
| **Platform** | `@usfm-tools/*` sibling `dist` / packaging bridge (prod without sibling clone) |

## Rollback (until delete)

```bash
USE_USJ_PIPELINE=0
# or
VITE_USE_USJ_PIPELINE=0
```

Clear IndexedDB keys matching `scripture:` and `scripture-usj:`, reload.
