# USJ cutover checklist — full replacement of usfm-js

**PR:** https://github.com/unfoldingWord/tc-study/pull/19  
**Branch tip (remote):** `7e8159d` (Helps `db38685` + `7e8159d` atop `ec46829`)  
**QA verified:** units + Journey 4/8 on Helps tip + local Pipeline delete WIP

## Authoritative contract (do not regress)

| Layer | SoT |
|-------|-----|
| Parse / IndexedDB | `UsjDocument` + `AlignmentMap` under `scripture-usj:` |
| Runtime identity | `UsjScriptureViewModel` / `UsjWordToken` |
| Match key | `semanticId = ${verseRef}:${content}:${occurrence}` |
| Cross-resource | `alignedOriginalWordIds` |
| Viewer | `loadScriptureResult` → viewModel (**done**) |
| Helps | `loadViewModel` / `viewModelToOptimizedChapters` / `extractUsjBroadcastTokens` (**done** @ `7e8159d`) |
| Rollback | **Removed in Pipeline WIP** — not yet on remote tip |

## Automated gates (QA)

| Gate | Status |
|------|--------|
| `bun test` usj-processor + scripture-loader + quote-matcher + usjHelpsUnderline + viewer | **40/40 green** |
| Playwright Journey 4 (quote click + local token click) | **2/2 green** |
| Playwright Journey 8 (Paul ↔ Παῦλος both ways) | **2/2 green** |
| Helps unit/integration (Helps team) | **50 green** @ `7e8159d` |
| Manual soak matrix | Sample rows OK — see `USJ_SOAK_MATRIX.md` |

## Team wave status

| Team | Item | Status |
|------|------|--------|
| **Helps** | CombinedHelps/QuoteMatcher on `UsjScriptureViewModel`; zero `usfm-processor` in helps path | **Done** (`db38685`, `7e8159d`) |
| **Viewer** | `loadScriptureResult` → viewModel; debug/usfm-processor leftovers purged in WIP | **Done** (runtime) |
| **Pipeline** | Remove `USE_USJ_PIPELINE` / usfm-js; delete `@bt-synergy/usfm-processor`; USJ-only loader | **WIP local / not on remote tip** |
| **Platform** | `@usfm-tools/*` CI packaging (sibling dist / link) | **Open** (CI unit job still fails without usfm-ast) |

## Go / no-go

| Decision | Recommendation |
|----------|----------------|
| **(a) Merge USJ-default PR #19** | Hold human merge until delete wave lands or explicitly ship USJ-default-only |
| **(b) Delete usfm-js / `@bt-synergy/usfm-processor`** | **NO-GO on remote tip** — Helps cleared; Pipeline delete not pushed |

## Delete-wave exit criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No runtime `usfm-js` dep for tc-study scripture (`package.json` + imports) | **Pending Pipeline push** (true in local WIP; remote `7e8159d` still lists `@bt-synergy/usfm-processor`) |
| 2 | `@bt-synergy/usfm-processor` unused or removed | **Pending Pipeline push** (deleted in local WIP; still on remote tree) |
| 3 | Unit/integration green | **Met** (40/40) |
| 4 | Journey 4/8 e2e green | **Met** (4/4) |
| 5 | Soak: Titus underlines + OL↔ULT highlights | **Met** (prior soak + Journey 4/8 re-green) |
| 6 | This checklist: delete wave **COMPLETE** | **Not yet** |

## Ranked remaining blockers

1. **Pipeline (P0):** Commit + push USJ-only / delete `@bt-synergy/usfm-processor` + drop `usfm-js` from tc-study scripture graph (staged WIP exists locally).
2. **Platform (P1):** CI `@usfm-tools/*` packaging so `scripture-loader` build does not require ad-hoc sibling `dist` (blocks green CI after delete).
3. **Out of scope:** `resource-parsers` / `apps/mobile` own `usfm-js` copies — not tc-study scripture path.

## Rollback

After Pipeline delete lands: no pipeline flag. Clear IndexedDB keys matching `scripture:` and `scripture-usj:`, reload, re-download.
