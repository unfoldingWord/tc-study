# Language packs: plan

October 2026. How tc-study's resource pipeline becomes a headless package, so that a language can be prepared once
with network and then read with none — in Servos (github.com/idiomaspuentes/servos), in tc-study, from a command line,
or from a server that keeps the latest packs ready.

Built from the code of branch `feat/language-pack`, not from `apps/tc-study/docs` (parts of it are out of date: see
the end).

## 1. Decisions (Abel, 2026-10-14)

1. **Packs are made in three places, by the same code**: inside an app with network (Servos, tc-study), from a
   command line, and on a server that keeps the latest version of each pack ready to download, with the strongest
   compression, behind a page of the official site.
2. **A pack can be a whole language or one book**, and **the original languages go in packs of their own**: UGNT
   and UHB are the same for every language.
3. **A language's resources are what tc-study's Read page finds**: Door43 catalog search
   `lang={lang}&topic=tc-ready&stage=prod`, every owner, plus the OBS helps searches.

## 2. The goal

Given a language code, a headless pipeline that:

- **A. discovers** the resources exactly like the Read page, plus **both** UGNT and UHB (Read only adds the
  current book's testament);
- **B. downloads** every resource completely (zip, or file by file), writing the same source rows and the same
  complete receipts as the download worker — the loader's receipt and then `markComplete` over it;
- **C. builds** every derived row for **every** book and unit, not only the ones somebody visited: prepared views,
  `helps-quote:`, `helps-align:` for every helps × scripture of the language, `helps-text:` titles for every TA/TW
  entry;
- **D. reports** coverage: what is complete, what is missing and why;
- and then makes the pack with `@bt-synergy/language-pack`.

Byte compatibility comes from running tc-study's own code, moved into packages; tc-study imports it from there, so the
two never drift.

## 3. What has to move, in order

At every step the old file in the app becomes a re-export of the package, and tc-study keeps working.

**tc-study's three workers must work exactly as they do now** (Abel, 2026-10-14): the person reads while resources
are still downloading, chapter by chapter, and prepares and warms what is on screen first. Moving code must not change
when or what they download, prepare or warm. Each step is checked against the state before it: the same tc-study unit
tests pass and fail (`bun test src`, 1832 pass and 21 failing before step 1), no new type errors, and `vite build`
still builds the four workers.

| Step | What | Seams to add |
|---|---|---|
| 0 | Export `bookChunkedStorage` from `cache-adapter-indexeddb` (Node needs the same chunking), or run Node on fake-indexeddb | — |
| 1 | Pure leaves: `versionedEnvelope`, `prepareKeys`, `prepareRegistry`, `semanticIdMatchKey`, `wordIdentity` (out of `components/`), `quoteTokens/*`, `lib/obs/*`, `bookChapterCounts`, `warmBookOrder`, `loaderConfig`, `resourceArtifactRecipe`, `languageCodeMatch`, `helpsCacheKeys`, `tocTitleIndex`, `markdownToHast` | A clock for `wrapVersioned` |
| 2 | Builders: `findAlignedTokens`, `findTokensByQuoteText`, `resolveAlignedQuoteTokens`, `resolveHelpsQuoteStatus`, `reconstructAlignFromPositions`, `batchAlignLinks`, `scripturePrepCore`, `buildQuoteTokens` | — |
| 3 | Caches: `prepareCache`, `runPrepare`, `scripturePreparer`, `helpsQuoteCache`, `helpsAlignCache`, `warmCoverage`, and the title I/O + a pure title resolver split out of `useHelpsTextCache` / `useTATitles` / `useTWTitles` | Clock for `expiresAt` |
| 4 | The nine preparers with an explicit `registerAllPreparers()`; `sotCacheKey`, `getSoT`, `fetchDcsSoT`, `sotDebug`, `resolveOriginalLanguageKey`, `extractPreparedBroadcastTokens`, `buildResourceArtifacts` | Logger |
| 5 | Warm jobs: `warmResourceClass`, `warmAdmitPlan`, `warmJobs`, `warmGc`. `warm.worker` and `prepare.worker` become thin shells | — |
| 6 | Download: `downloadBatchOrder`, `backgroundDownloadRun`, `catalogBackgroundDownloadPolicy`, `resourceDownloadComplete`, `ResourceCompletenessChecker`, `ObsLoader`, `LoaderRegistry`, `workerLoaderRegistry`, `BackgroundDownloadManager`, `DependencyResolver`, and a `runDownload` built from `runBackgroundDownloadOnThisThread` | Cache, catalog, Door43 client, logger and clock injected |
| 7 | Discovery: `readCatalogSearch`, `readCatalogIdentity`, `readCatalogPanelPolicy`, the original-language specs, `ResourceMetadataFactory`, viewer-free resource type definitions, and a headless `discoverLanguage` | Door43 client factory, clock |
| 8 | The orchestrator `prepareLanguage(lang)` and the coverage report: jobs from `collectLane3Groups` with no budget, `runWarmJob` for each, then the title pass | — |

Steps 1–5 do not depend on 6 or 7; step 7 is the most tangled with the UI (zustand stores, panel sync) and goes last.

**Where it stands (2026-10-14):** steps 1–8 are done on `feat/language-pack`, in `packages/resource-pipeline`.

- Step 6: the download pipeline moved; the body of `runBackgroundDownloadOnThisThread` became `runDownload`, which takes
  the stores and the Door43 client from its caller. The package compiles class fields as the app does
  (`useDefineForClassFields`); without it the download worker's classes changed shape.
- Step 7: `discoverLanguage`, `createHeadlessResourceTypeRegistry` (tc-study's resource types without viewers: the app
  spreads the data half and adds the viewer), and the Read page's hydrate now calls the shared `door43ResourceForHit` and
  `ensureOriginalLanguageInCatalog`.
- Step 8: `buildLanguageArtifacts` (every lane-3 job with no budget, coverage marked as the scheduler marks it, then
  TA/TW titles, and a report) and `prepareLanguage` (discover, download, build, for the language and UGNT/UHB). The
  warm stamp bags moved out of `useWarmLanes` into `resolveWarmStamps`, which both use.
- `cli/prepare-language.ts` runs it all in Bun over tc-study's IndexedDB adapters on fake-indexeddb and writes
  `{lang}.langpack.zip` and a report. It needs `language-pack`, `cache-adapter-indexeddb` and `catalog-manager` built
  (`bun run build` in each: Bun reads their `dist`, the app reads their `src`). `cli/open-pack.ts` opens a pack into
  empty stores and checks every layer of every resource arrived.
- First real run, es-419 (2026-10-14): 19 resources found and downloaded (17 of the language, among them OBS from BSA
  and growing-church and a second TW from es-419_obt; UGNT and UHB), 18 151 jobs planned, 4 015 built, the rest
  blocked because es-419 has those books in none of its resources; 2 344 article titles. The pack is 26.7 MB and took
  7.5 minutes; opening it into empty stores takes 15 s and every row arrives. In a first run the two OBS downloads
  finished without a verified receipt and were left out of the pack; the second run verified them.
- `es-419_gl/es-419/tq` came with its receipt and no rows, in tc-study too: its v38 tree has an `_old/` folder of
  11 000 files, Door43 returns a tree 12 000 entries per page (`truncated: true`), and `fetchRepoTreePaths` read only
  page 1, so all its books looked absent from the release and the loader skipped the zip. It now reads every page.

Not done: the clock and logger seams; thin worker shells (left on purpose: the workers keep importing the same code
through the app's re-exports); TW previews (`tw-preview` rows) in the title pass.

How every step was checked against the state before it: the same tc-study unit tests fail (20; one of the 21 passes
since step 2), type errors went from 44 to 35 with none new, the four worker bundles are byte-identical (step 5: only
module order and minified names changed), and for steps 7 and 8, which touch the Read page, the browser from an empty
store: the same 14 catalog rows for es-419, and the same warm stamp timeline.

Found on the way, already in tc-study before this work: the warm stamps are resolved before the Read hydrate writes the
catalog rows, so lanes 2/3 build rows under `nostamp` keys until the first download finishes; and the Read hydrate
takes a hit's ingredients from `repo` (master) over the release's (es-419 TN v66 lists Esther, which v66 does not have).

## 4. Compatibility: what must match

Pack and app must agree on these constants; the pack manifest carries them by layer (`versions`).

| Constant | Value | Where |
|---|---|---|
| `USJ_PROCESSING_VERSION` | `2.3.0-usj` | `packages/usj-processor/src/versions.ts` |
| `NOTES_TSV_PARSER_VERSION` | `3` | `packages/resource-parsers/src/parsers/tsv/notes-parser.ts` |
| `HELPS_INGEST_SCHEMA` | `1` (receipt `helps:1`; scripture `usj:2.3.0-usj`) | `packages/resource-catalog/src/ingestReceipt.ts` |
| `SCRIPTURE_PREPARE_VERSION` | `6000230` | `features/scripture/scripturePreparer.ts` |
| `NOTES_PREPARE_VERSION` | `5` | `features/notes/notesPreparer.ts` |
| words-links, questions, academy, words, OBS, OBS notes, OBS questions prepare versions | `1` each | their preparers |
| `HELPS_QUOTE_VERSION` | `8` (TTL 30 days) | `features/helps/helpsQuoteCache.ts` |
| `HELPS_ALIGN_VERSION` | `11` (TTL 30 days) | `features/helps/helpsAlignCache.ts` |
| `HELPS_TEXT_VERSION` | `1` | `features/helps/helpsCacheKeys.ts` |

Physical layout too: databases `tc-study-cache` / `cache-entries` and `tc-study-catalog` / `catalog-entries`, and
book rows of `scripture-usj:`, `tn:`, `tq:` split into a manifest and chapter rows.

## 5. Splitting packs

**Done (format 1.1, `@bt-synergy/language-pack`):** four kinds of pack, `language`, `originals`, `base` and `book`,
with `requires` in the manifest, and DEFLATE level 9. A resource is book-scoped by its catalog type or, since tc-study
stores some as `type: 'unknown'` (word links, OBS helps), by its Door43 subject. On opening, quotes and aligned quotes
are left out only when the device has another release of the original; without it they come and match once the
originals pack is opened. `cli/prepare-language.ts --books all` writes all of them; `cli/open-pack.ts` opens any
sequence of them and checks every row.

### Originals apart

- An **original-language pack** carries UGNT and/or UHB: catalog row, receipt, source rows and their prepared views.
  It serves every language.
- A **language pack** carries the language's resources and what is built from them. Its `helps-quote:` and
  `helps-align:` keys embed the stamp of the original they were built against (`{olKey}@{tag#published_at}+USJ
  version`), and align keys also the stamp of the target scripture. So the manifest must say **which original release
  it needs** (`requires: [{ key, stamp }]`), and opening it must check that the device has that release: with
  another one, quote and align rows are misses and are rebuilt (or the layers are skipped and said).
- Prepared rows carry no release stamp in their key, only a version in their envelope.

### One book

- Book-scoped keys: `scripture-usj:{K}:{book}…`, `tn:/tq:/twl:{K}:{book}…`, `prepared:{type}:{K}:{book}:…`,
  `helps-quote:…:{book}:{ch}`, `helps-align:…:{book}:{ch}`.
- Not book-scoped: TA/TW articles and their titles, OBS. They go in the language's **base pack** (with the catalog
  rows), which every book pack of that language needs.
- **A book pack cannot carry the receipts**: a receipt says the whole resource is complete, and tc-study would then
  never look for the books that are missing. The manifest lists the books it brings; the app keeps track of which
  books it has. To decide: what tc-study does with a resource it has partly and no receipt for, when there is no
  network (today its download monitor would try to download it).

## 6. The server

- A scheduled job (not a request handler: preparing a language downloads and builds for minutes) runs
  `prepareLanguage` for each language, and per book, when the Door43 release stamps of its resources change.
- It keeps the latest pack of each one, compressed as much as possible (the zip format only offers DEFLATE; level 9),
  with its manifest so the page can list sizes, versions and dates without opening the zip.
- A page of the official site lists languages and books and downloads them.
- To decide: where it runs and where the files live (for example a scheduled CI job writing to object storage), and
  whether the packs are named by release so old links keep working.

## 7. What a pack still cannot fix in tc-study

- **The Read page needs the network to open a language**: it clears its panels and then searches the Door43 catalog;
  offline nothing fills them from the local catalog (`features/read/loadReadLanguageCatalog.ts`).
- Its download monitor tries to download any catalog key without a matching receipt; offline that fails and
  `markError` leaves an error in the receipt.
- No service worker: the app shell itself does not open offline.
- OBS images are remote URLs.
- Settings the page needs live in localStorage (`tc-study:read-panels`, `tc-study:helps-language`,
  `tc-study:languages-cache`).

## 8. Where the docs disagree with the code

- Versions in `apps/tc-study/docs/workers-and-persistence.md` are old (USJ `2.1.0-usj`, quote v3, align v3); notes
  versions in `cache-data-structure.md` too (prepare 4, parser 2).
- There are five IndexedDB databases in the code, not two: also `tc-study-collections`, `bt-synergy-passage-sets` and
  the legacy `bt-synergy-cache`, where the collection import still writes.
- The TW article key is `{key}/bible/kt/god`, not `{key}/kt/god`.
- `src/preloaded` is not used, and there is no service worker, although the README says "offline-first".
