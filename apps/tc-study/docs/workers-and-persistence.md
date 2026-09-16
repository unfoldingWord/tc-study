# Workers and persistence (tc-study)

How `apps/tc-study` stores data, what each Web Worker does, and how caching / warm-up relate to the download badge.

This is the current code, not a proposal. Key prefixes and job types are taken from the workers, cache modules, and `features/warm/*`.

**Boot order and when each DB opens:** [App lifecycle and data flow](./app-lifecycle-data-flow.md). **Helps ULT chips (quote → align, decoupled from ScriptureViewer):** [Helps quote / align flow](./helps-quote-flow.md).

---

## 1. Overview

tc-study is an **in-tab** job system. There is no background service worker “miniserver.” Three dedicated workers run inside the open tab:

| Worker | File | Role |
| --- | --- | --- |
| Download | `src/workers/backgroundDownload.worker.ts` | Network zip extract → source-of-truth (SoT) cache |
| Prepare | `src/workers/prepare.worker.ts` | Lane-1 prepare; warm fallback on small CPUs; live `batch-*` only if warm Worker fails |
| Warm | `src/workers/warm.worker.ts` | Live lane-1 `batch-quotes` / `batch-align`; lanes 2/3 when `hardwareConcurrency >= 4` |

**Closing the tab kills the workers.** Queues, in-flight zip extracts, and in-memory highlights die with the page. IndexedDB survives.

Main-thread singletons (`backgroundDownloadSession`, `warmScheduler`) survive React remounts (route changes, StrictMode) so the worker and zip queue are not torn down. They do **not** survive a tab close.

### Two IndexedDB databases

| Database | Object store | Version | Adapter | Purpose |
| --- | --- | --- | --- | --- |
| `tc-study-cache` | `cache-entries` | 1 | `IndexedDBCacheAdapter` | All content, prepared rows, helps caches, completeness flags |
| `tc-study-catalog` | `catalog-entries` | 1 | `IndexedDBCatalogAdapter` | Resource **metadata** (titles, ingredients, release stamps) |

Both the main thread (`CatalogContext`) and the download worker construct the same names. Catalog is a **separate** DB — do not look for `unfoldingWord/en/tn` metadata rows inside `tc-study-cache`.

Scripture SoT is **chapter-grained**: `scripture-usj:{resourceKey}:{book}:{chapter}` is one IDB get (Psa 119 does not hydrate chapter 1). A thin book index at `scripture-usj:{resourceKey}:{book}` lists `chapterNumbers` without USJ. Legacy whole-book blobs migrate lazily on first chapter read. `tn:` / `tq:` stay book keys with adapter chapter chunks. `prepared:`, `helps-quote:`, and `helps-align:` are **not** in `BOOK_ORGANIZED_PREFIXES` — one IDB row per key.

---

## 2. IndexedDB / key families

Resource keys are `{owner}/{language}/{id}`, e.g. `unfoldingWord/en/tn`, `unfoldingWord/en/ult`, `unfoldingWord/el-x-koine/ugnt`, `unfoldingWord/hbo/uhb`.

Stamps come from catalog metadata (`release.tag_name` + `published_at`, else `version`, else `nostamp`). Separators `:` `|` `@` are sanitized to `_`. OL stamps append `+{USJ_PROCESSING_VERSION}` (currently `2.1.0-usj`). Target-scripture stamps append `+{SCRIPTURE_PREPARE_VERSION}` (schema `2` + USJ digits → `2000210` for `2.1.0-usj`).

Prepared / quote / align rows use a versioned envelope `{ content, timestamp, version }`. A version mismatch is treated as a miss.

| Prefix / key | Shape | Value | Writes | Reads | TTL / version |
| --- | --- | --- | --- | --- | --- |
| `scripture-usj:` | `scripture-usj:{resourceKey}:{book}:{chapter}` e.g. `scripture-usj:unfoldingWord/en/ult:tit:1` | Per-chapter USJ SoT: `usj` + `alignmentMap` + one `chapters[]` slice. Book key is a thin `{ chapterNumbers }` index. | Download worker (`ScriptureLoader`) writes each chapter as processed; lane-1 DCS writes needed chapter first | `getSoT` / `readUsjChapter`; prepare/warm `readSource({ chapter })` | Gated by `USJ_PROCESSING_VERSION` / tool versions. Legacy book blobs migrate on read. |
| `tn:` / `twl:` / `tq:` | `tn:unfoldingWord/en/tn:tit` · `twl:unfoldingWord/en/twl:tit` · `tq:unfoldingWord/en/tq:tit` | Processed notes / links / questions (`notesByChapter`, `linksByChapter`, …). `tn:` and `tq:` are chunked. | Download worker loaders | Notes/TWL/TQ preparers + CombinedHelps fallback | No envelope TTL. Completeness is `resource:…`. |
| `prepared:` | `prepared:{typeId}:{resourceKey}:{book}:nav` · `prepared:{typeId}:{resourceKey}:{book}:{unit}:{tier}` | Versioned light / full / nav payload | `prepare.worker` and warm `prepare-unit` / `prepare-article` | ScriptureViewer, CombinedHelps, `useAlignedTokens` reconstruct, warm skip-if-exists | `SCRIPTURE_PREPARE_VERSION` / `NOTES_PREPARE_VERSION` (2) / `WORDS_LINKS_PREPARE_VERSION` (1). No TTL. |
| `helps-quote:` | `helps-quote:{helps}@{hs}:{ol}@{os}:{book}:{ch}` | `Record<linkId, CachedQuoteToken[]>` (empty array = settled miss) | Lane-1 `useQuoteTokens`; warm `quote-chapter` | Same + warm align (needs quotes first) | Version `1`. TTL **30 days** (`expiresAt`). |
| `helps-align:` | `helps-align:{helps}@{hs}:{ol}@{os}:{target}@{ts}:{book}:{ch}` | `Record<linkId, { p: number[]; m: 0\|1\|2 }>` | Lane-1 `useAlignedTokens`; warm `align-chapter` | `useAlignedTokens` reconstruct | Version `1`. TTL **30 days**. `m`: 0 miss, 1 semantic/zaln, 2 quote-text fallback. |
| `warm-coverage:v1` | Single key | `Record<relationId, { stamp, unitCount, updatedAt }>` | Scheduler after a batch of `finished`/`cached` jobs | Lane 3 `skipRelation` | Version `1`. No TTL. GC drops stale-stamp / other-language relations. |
| `resource:` | `resource:{resourceKey}` e.g. `resource:unfoldingWord/hbo/uhb` | Cache entry with stamped ingest receipt: `metadata.downloadComplete === true`, `releaseStamp` (`resourceContentStamp`), `ingestSchema` (e.g. `usj:2.1.0-usj` / `helps:1`), optional `ingredientCount` / `downloadMethod` / `downloadCompletedAt` | Download worker loaders + `completenessChecker.markComplete` after a full extract | `checkResource` O(1) when stamp+schema match; `isResourceMarkedComplete` (warm admit); completeness UI | Same DB. Matching receipt skips zip fetch and ingredient walks. Stamp mismatch or USJ schema bump invalidates. Legacy unstamped `downloadComplete` still walks once. |
| `helps-text:` | `helps-text:{kind}:{resourceKey}@{stamp}:{entryId}` | Title / preview strings (`ta-title`, `tw-title`, `tw-preview`) | Helps text cache | TA/TW card chrome | Version `1`. Stamp-swept, not book-chunked. |
| `{resourceKey}/{entryId}` | `unfoldingWord/en/tw/kt/god` · `unfoldingWord/en/ta/translate/figs-metaphor` | TW/TA article body | Download / article loaders | Lane 3 `prepare-article`; entry viewers | One row per article. Lane 3 can prefix-scan `{key}/`. |

### Precise examples

```
prepared:scripture:unfoldingWord/en/ult:tit:nav
prepared:scripture:unfoldingWord/en/ult:tit:1:light
prepared:scripture:unfoldingWord/en/ult:tit:1:full
prepared:notes:unfoldingWord/en/tn:tit:1:full
prepared:words-links:unfoldingWord/en/twl:tit:1:full

helps-quote:unfoldingWord/en/tn@v45:unfoldingWord/el-x-koine/ugnt@v1+2.1.0-usj:tit:1
helps-align:unfoldingWord/en/tn@v45:unfoldingWord/el-x-koine/ugnt@v1+2.1.0-usj:unfoldingWord/en/ult@v1+2000210:tit:1

resource:unfoldingWord/el-x-koine/ugnt
warm-coverage:v1
```

Coverage **relation ids** (values inside `warm-coverage:v1`, not IDB keys):

```
prep:scripture:unfoldingWord/en/ult:tit
quote:unfoldingWord/en/tn|unfoldingWord/el-x-koine/ugnt|tit
align:unfoldingWord/en/tn|unfoldingWord/el-x-koine/ugnt|unfoldingWord/en/ult|tit
```

Quotes are **2-way** (helps × original language). Align is **3-way** (helps × OL × target scripture). Reconstruct align `p[]` against `prepared:scripture` **full** tokens only — never against light or live USJ.

---

## 3. Workers

### 3.1 `backgroundDownload.worker.ts`

Network + extract only. After a window-touching prepare import crashed UHB around 1%, this worker **must not prepare**. `workerLoaderRegistry.ts` says extract/USJ cache is enough for `resource-complete`; `prepare.worker` + `preparedTiersExist` write light/full later.

**IN**

| `type` | Payload |
| --- | --- |
| `start` | `{ resourceKeys, skipExisting, totalIngredients?, runId }` |
| `stop` | `{ runId }` |

**OUT**

| `type` | Meaning |
| --- | --- |
| `progress` | Zip / ingredient pulse (what `DownloadIndicator` shows) |
| `resource-complete` | One resource zip extracted and `markComplete` written |
| `complete` | Whole batch finished |
| `queue-updated` | Remaining keys |
| `error` | Worker / run failure |

Per resource: pick zip vs individual, `loader.downloadResource`, then `completenessChecker.markComplete(resourceKey, { downloadMethod })`, then `resource-complete`. Failures call `markError` and continue the batch.

`runId` fences stale messages after stop / retry. The main-thread session lives in `backgroundDownloadSession.ts` (not a React hook).

### 3.2 `prepare.worker.ts`

Lane-1 CPU for **scripture / helps prepare**. Reads SoT from IndexedDB — no large book payloads on `postMessage` for prepare jobs. Live `batch-quotes` / `batch-align` remain as a **fallback** when dedicated warm.worker cannot start.

**IN**

| `type` | Role |
| --- | --- |
| `enqueue` | `PrepareJob`: `{ typeId, resourceKey, bookId, units, tier: 'light'\|'full'\|'both', priority: 'interactive'\|'background' }` |
| `cancel-book` | Drop queued jobs for that type/resource/book; bump cancel token |
| `batch-quotes` | Live quote build fallback (`bookCode`, `links`, `originalChapters`) |
| `batch-align` | Live align fallback (`BatchAlignLinksArgs`) |
| `warm-job` | Fallback when dedicated warm worker is off (`hardwareConcurrency < 4`) |
| `warm-cancel` | Cancel matching warm fallback jobs |

**OUT:** `ok` / `error`; `ready` (unit+tier written); `ready-failed` (`source-missing` — main thread must heal `scripture-usj:`); `done` for warm fallback.

**Skip-if-prepared:** `preparedTiersExist` checks versioned light/full before work. Interactive jobs sort ahead of background. Warm fallbacks run only when the prepare queue is empty, one job per pump turn, so live batch-align/quotes can interleave.

`enqueueScriptureBookPriority` (main thread) cancels the book, then queues open chapter + neighbors as `interactive`, and (on first open) the rest as `background`. Chapter changes pass `includeRest: false` so the rest of the book waits for lane 2.

### 3.3 `warm.worker.ts`

Dedicated for lanes 2/3 when `navigator.hardwareConcurrency >= 4` (`warmClient.ts` enqueue path). Otherwise `enqueueWarmJob` posts `warm-job` to prepare.worker.

**Live lane-1 quote/align always prefers this worker** (`batchQuotesOnWarmWorker` / `batchAlignOnWarmWorker`) so scripture prepare on prepare.worker cannot starve on-screen TN/TWL chips. The dedicated worker is started for live batch even when lane 2/3 still fold onto prepare (low concurrency). Fallback to prepare.worker only if Worker construction fails.

**IN:** `enqueue` `{ job: WarmJob }` · `cancel` `{ resourceKey?, bookId?, languageCode? }` · `stats` · `batch-quotes` · `batch-align`

**OUT:** `ok` / `error` · `done` `{ jobKey, kind, lane, outcome }` · `stats` `{ queueDepth, byLane }`

Dedupe by `jobKey` (keep the lower lane). Queue sorts lane 1 → 2 → 3. Cancel matches resource / book / language; in-flight abort only if the current job matches (so a pane switch does not kill the other language). Live `batch-*` replies immediately in `onmessage` (not queued behind lane 2/3); the pump yields between warm jobs so batch messages can interleave.

**Job kinds** (`warmTypes.ts`):

| `kind` | Writes | Skip / outcomes |
| --- | --- | --- |
| `prepare-unit` | `prepared:…` light/full (+ nav) | `cached` if tiers already exist |
| `quote-chapter` | `helps-quote:` | `cached` if every link is present or chapter has no quotes; `blocked` if UHB/UGNT USFM missing |
| `align-chapter` | `helps-align:` `{p,m}` | Needs quote row + prepared **full** target; `blocked` if OL USFM missing |
| `prepare-article` | `prepared:` for TA/TW units | `cached` if already prepared |

`runWarmJob` is shared (`warmJobs.ts`). Outcomes: `finished` (wrote), `cached` (already there or true empty chapter), `blocked` (OL missing — retry after download), `noop` (cancel / missing inputs — do **not** mark coverage).

---

## 4. Lanes vs download

Warm is CPU against **already downloaded** SoT. Download is network. They share IndexedDB and a handoff, not a queue.

| Lane | Nickname | What | Where it runs |
| --- | --- | --- | --- |
| **1** | Now | Visible current chapter: prepare open+adjacent on prepare.worker; live quote/align for on-screen TN/TWL on **warm.worker** (prepare.worker fallback) | warm `batch-*` + prepare `enqueue` |
| **2** | Soon | Rest of the **current book** for downloaded keys in `{textLang, helpsLang}` that share Bible vs OBS mode | `warm.worker` (or prepare fallback) |
| **3** | Later | Full canon / OBS stories / TA·TW articles, 32-job slices (1 job if folded onto prepare) | same |

Lane 2 skips the current chapter of **visible** TN/TWL (lane 1 owns it) and skips open+adjacent prepare for visible scripture. Visible-first, then other text-lang scripture, then helps-lang TN/TWL.

**Download badge ≠ warm.** `DownloadIndicator` reads `backgroundDownloadSession` progress. `N / total` is books (ingredients) written this run, not zip bytes. A 100% badge means this run’s extract+cache is on disk, not that `prepared:` / `helps-quote:` / `helps-align:` exist. Zip-byte % may move the current-resource bar while the count stays below the resource’s book total.

### Admission (`canAdmitBackgroundLanes`)

Lane 2/3 start only when **all** of these hold:

1. **`lane1Drained`** — every owner (`scripture`, `helps`) reported ready (`scriptureLane1Ready` / `helpsLane1Ready`).
2. **Scroll settled** — `scrollUnsettled` is false (chapter infinite-scroll pin).
3. **Tab visible** — `document.visibilityState === 'visible'`.
4. **Lane 3 extras** — `pendingJobKeys < 8`, and ≥ 750 ms since the last lane-3 admit.

Lane 2 admits up to **8** new jobs per pass (`LANE2_JOBS_PER_PASS`). Lane 3 admits **32** on the dedicated worker, **1** when folded onto prepare (so interactive batch-align stays responsive).

### Coverage: blocked vs cached vs finished

When a group of jobs for one relation all complete:

- `finished` and `cached` **count**.
- `blocked` and `noop` **do not**. If any job is incomplete, the relation is **not** written to `warm-coverage:v1`, so a later UHB/UGNT download can retry.
- The index accumulates `unitCount` across throttled slices (Psalms 150 must not stall at the first 32).

Quotes wait until the OL key is in `readyOlKeys` (zip `resource:…` marked complete, or just handed off). If no OL is confirmed complete, jobs are still admitted and **probe** USFM (`blocked` if missing) so older zips without the flag are not deadlocked.

---

## 5. Read path

### ScriptureViewer (`useContent`)

1. Read `prepared:scripture:…:nav`. If present, paint nav chrome immediately and enqueue open+adjacent prepare (`includeRest: false`).
2. Defer whole-book `UsjScriptureViewModel` from `scripture-usj:` so light can paint first.
3. Open-chapter paint prefers in-memory `preparedChapterCache` (LRU over IDB light/full). Full is required for tokens / hover / underlines.
4. `source-missing` from the worker → main-thread heal rewrites `scripture-usj:` via `loadViewModel`, then prepare again.
5. Lane 1 ready = not loading **and** viewModel present **and** (open chapter has USJ verses **or** prepared full is in the memory peek).

### CombinedHelps

1. Prefer `prepared:notes` / `prepared:words-links` full rows for the chapter span; else loader `tn:` / `twl:` slices.
2. **`useQuoteTokens` is cache-first:** `readCachedQuoteTokensForSpan` before worker/sync rebuild. Hits skip OL load. While scrolling, hydrate from IDB only (no worker). Soft catalog-stamp budget skips cache read only — live rebuild stays on warm.worker (prepare.worker fallback), not the main thread.
3. **`useAlignedTokens` is cache-first:** `readCachedAlignmentsForSpan`, reconstruct `{p,m}` against `prepared:scripture` **full** (`extractPreparedBroadcastTokens`), or paint from stored display texts (`t`) with **zero** `SCRIPTURE_TOKENS` dependency. Target scripture identity comes from the shared helps target catalog key (written when a scripture panel selects a resource) — not from panel-published tokens. Live-align only misses (warm.worker), preferring prepared full over broadcast. Broadcast `SCRIPTURE_TOKENS` may still help underlines when a panel is mounted, but must not gate chip paint or quote build.
4. **Token reuse across chapter:** `helpsTokenReuse` keeps a module `Map<linkId, {quoteTokens, alignedTokens, …}>` for the current book so an off-chapter card click does not rebuild tokens already in memory. The map clears on book change.
5. **Highlight persist is module memory, not IDB.** `persistHelpsHighlight` in `helpsCardScriptureNav.ts` stores `pendingHelpsHighlight` in module scope so ScriptureViewer remount / chapter reload can replay the underline. Tab close or refresh loses it.

Lane 1 for helps is ready when notes are not pending **and** (`quoteReady` or cache-hit **or** quotes blocked because OL zip is missing — drain so download/retry is not deadlocked).

---

## 6. Lifecycle

```
zip extract (download.worker)
    → scripture-usj: / tn: / twl: / tq: / TW·TA articles
    → markComplete → resource:{key}
    → postMessage resource-complete
         → backgroundDownloadSession.completedResourceKeys
         → useWarmLanes downloadTick + handoffKeys
         → warmScheduler reseeds lanes 2/3
              → prepare-unit / quote-chapter / align-chapter
```

**Original language is required for quotes.** NT → `unfoldingWord/el-x-koine/ugnt`, OT → `unfoldingWord/hbo/uhb` (`resolveOriginalLanguageKey`). Gateway completeness often omits them; `ensureOriginalLanguageDownload` starts a one-key zip when the session is idle. Until that USFM exists, quote/align jobs return `blocked` and coverage is not marked.

**GC** (`runWarmGc`, idle after a lane-3 pass):

1. Adapter `prune()` — drop rows whose `expiresAt` is past (helps-quote / helps-align 30-day TTL).
2. **Stamp mismatch** — delete quote/align keys (and coverage entries) whose helps / OL / target stamp ≠ current catalog stamps.
3. If `navigator.storage` usage **> 60%** of quota: drop align rows whose `targetKey` ≠ current scripture; then quote/align whose language ∉ `{textLang, helpsLang}`; then quote rows for non-current books; trim coverage the same way.

Prepared SoT rows are not stamp-GC’d here; they invalidate via prepare **version** bumps.

---

## 7. How to inspect

### IndexedDB (DevTools → Application)

1. `IndexedDB` → **`tc-study-cache`** → **`cache-entries`**.
2. Filter keys:
   - `scripture-usj:unfoldingWord/…:{book}:{chapter}` — chapter SoT (legacy book blobs migrate)
   - `prepared:scripture:` / `prepared:notes:` — light/full/nav
   - `helps-quote:` / `helps-align:` — warmed underlines
   - `warm-coverage:v1` — one JSON map
   - `resource:unfoldingWord/hbo/uhb` — `metadata.downloadComplete`
3. Catalog metadata is **`tc-study-catalog`** → **`catalog-entries`**, not the cache DB.

Wiping `tc-study-cache` forces re-download + re-prepare. Version bumps (USJ / prepare schema / `HELPS_*_VERSION`) already treat old envelopes as misses.

### `window.__warmDebug`

The scheduler assigns this on every emit:

```ts
{
  lane1Drained: boolean
  scrollUnsettled: boolean
  pendingJobKeys: number
  dedicatedWorker: boolean  // hardwareConcurrency >= 4 and warm.worker started
  context: { bookId, chapter, visibleResources, downloadedKeys, … } | null
}
```

If `dedicatedWorker` is false, lane 2/3 jobs are on prepare.worker (`warm-job`). `pendingJobKeys` is the scheduler’s in-flight set, not the download queue.

### DownloadIndicator

Header download icon + percent. Zip-byte % can move the bar for the current resource; `completedIngredients` increments when a book is written. It does not move when warm writes `helps-quote:` or `prepared:`. After 100%, expect `resource-complete` → warm admission (once lane 1 is drained and scroll is settled).

---

## File map

| Area | Files |
| --- | --- |
| Workers | `src/workers/{backgroundDownload,prepare,warm}.worker.ts` + `prepareClient.ts` / `warmClient.ts` |
| Download session / handoff | `src/features/download/backgroundDownloadSession.ts`, `resourceDownloadComplete.ts`, `ensureOriginalLanguageDownload.ts` |
| Prepare keys / IO | `src/features/prepare/prepareKeys.ts`, `prepareCache.ts` |
| Helps caches | `src/features/helps/helpsQuoteCache.ts`, `helpsAlignCache.ts` |
| Warm | `src/features/warm/{warmTypes,warmJobs,warmScheduler,warmAdmitPlan,warmCoverage,warmCoverageSettle,warmLanePolicy,warmGc,useWarmLanes}.ts` |
| Read | `ScriptureViewer/hooks/useContent.ts`, `CombinedHelpsViewer/useCombinedHelpsPipeline.ts`, `useQuoteTokens.ts`, `useAlignedTokens.ts` |
| Highlight (memory) | `src/features/helps/helpsCardScriptureNav.ts` |
