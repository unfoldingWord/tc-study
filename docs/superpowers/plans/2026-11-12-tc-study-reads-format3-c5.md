# Language packs format 3, C5 part 1 (tc-study reads format 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The controller follows `.claude/lp3-controller.md` and dispatches `lp3-implementer`, `lp3-reviewer` and `lp3-runner`.

**Goal:** With the packs server set to staging, tc-study (`apps/tc-study`) reads a language from format 3 packs through `@bt-synergy/language-pack-client` instead of downloading it from Door43. It keeps what it does today: collections, helps in another language, every Bible of the language, the originals and their alignment. With the default server (production) nothing changes.

**Architecture:** A format 3 path sits beside the Door43 loaders and is chosen per language. (1) A switch: format 3 only when the packs server is staging (`?packs=staging` or `VITE_TCS_PACKS=staging`), the pattern Servos uses. (2) One library client per app run, on an IndexedDB store of its own (`tc-study-packs-v3`), with the staging server and the staging key read at build time. (3) After the library activates a book or an article group, the app writes the rows that the Door43 loaders write today, with the same keys and shapes, into `tc-study-cache` and `tc-study-catalog`: `scripture-usj:` chapters (from USFM rebuilt from the book segment), `tn:`, `tq:`, `twl:` and `obs:` rows, tW and tA entries, catalog entries and completeness receipts. Panels, the prepare and warm workers, collections and helps in another language read those rows unchanged. The catalog's resource keys already have the app's form (`es-419_gl/es-419/tn`), so a row from format 3 and a row from Door43 are the same row. (4) Read, collections and the pack opener ask the format 3 path first for a language the staging server serves, and Door43 otherwise.

**Tech Stack:** TypeScript, React 18, Vite, Bun test runner (`bun test src` in `apps/tc-study`, `bun test` in packages), Playwright for E2E, IndexedDB (`fake-indexeddb` in unit tests), `@bt-synergy/language-pack-client` and `@bt-synergy/language-pack-v3` as workspace sources.

**Spec:** the C5 section of the Plan tab and the "Funciones de hoy y nuevas", "Cada app" and "La transición sin red" sections of the Consumidores tab of https://claude.ai/artifact/5Vw6P8Bm3bo51VkTRwsuPA; `packages/language-pack-v3/spec/` (`serving.md`, `catalog.md`, `transfer.md`); `packages/language-pack-client/README.md`. The working example is Servos C3 (idiomaspuentes/servos#43, worktree `servos/.claude/worktrees/lp3-c3-73f4b1`, folder `src/resources/v3/`) and unfoldingWord/tc-study#77.

## Decisions for Abel before this runs

Each is what the tasks below do unless Abel says otherwise.

1. **Write today's rows from format 3 (recommended), rather than have every panel ask the library.** tc-study's panels, its two workers, collections and helps in another language all read rows of `tc-study-cache` keyed by resource. Writing those same rows from format 3 keeps all of that working with one new path and no panel change, which is what "conservar" asks. The Door43 loaders stay for production and for languages staging does not serve; phase 4 removes them. The cost: the content is stored twice (segments and rows), and the quotes and alignments of the helps are still worked out on the device by today's warm worker. Having panels read the library directly is the right step for the new panels (part 2), not for this part.
2. **Scope of this part: C5.1 (reading), C5.3 (opening old `.langpack.zip` files through the library) and C5.4 (tests for today's functions).** C5.2, the new panels (topics, tA use per book, key words, article by sections, related book not downloaded), gets its own plan once this part is merged. C5.5, publishing, is Abel's.
3. **MACULA diagrams and the lexicon are not in tc-study today.** The code has no panel for either; they exist only in the pack builders and in Servos. So there is nothing to keep in this part. If Abel wants them in tc-study, they go into part 2 as new panels (note: staging has no English lexicon).
4. **PR unfoldingWord/tc-study#66 (2.0 parts from the packs server): close it without merging.** It adds a second download path for format 2.0, which phase 4 retires, in the same files this part changes (`useReadLanguageBootstrap.ts`, `useCatalogBackgroundDownload.ts`). This part keeps three things from it: the fix of the unhandled rejection in `features/helps/olLoadCache.ts` (cherry-picked as its own commit in Task 8), the current book first, and the rule that Door43's background download leaves a language alone while another path serves it. The alternative is to merge #66 first, so production gets smaller downloads before format 3 is in production. In that case, rebase this plan's Task 8 on it.
5. **The USFM rebuild goes in `language-pack-v3`, shared with C4.** tc-study's scripture path is USFM to USJ (`processUsfmToUsjResult`), and translation-helps-mcp needs USFM for `get_passage`. One function, `bookUsfm`, with a test that compares it with the source USFM, serves both. If C4 writes it first, Task 2 reuses it and keeps only the tests missing there.
6. **Search stays out.** The app has no full-text search today. The library's `memoryIndex` is enough until part 2. The wa-sqlite driver that the Consumidores tab plans for tc-study comes with the search panel.

## Global Constraints

- **Format 3 only against staging.** `packsFormat()` is `3` only when the packs server is staging. The default build behaves as `master` does today: no request to the format 3 routes, no `tc-study-packs-v3` database opened. Production (`https://translation-helps-mcp.unfoldingword.workers.dev` and Door43 production data) is never written to, and no test calls it.
- Staging origin: `https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev`. Routes: `GET /v3/packs/{lang}/catalog`, `GET /v3/packs/common/catalog`, `GET /v3/packs/seg/{id}`. Staging key: `packages/language-pack-v3/keys/78d2e6299a2de4d0.pub`, read at build time, never copied into source. A staging build with no key fails to build.
- IndexedDB database names: library store `tc-study-packs-v3`; rows go to the existing `tc-study-cache` (`cache-entries`) and `tc-study-catalog` (`catalog-entries`) through the adapters `CatalogContext.tsx` already creates. No other new database.
- Rows written from format 3 use exactly the keys and value shapes the Door43 loaders write (see `apps/tc-study/docs/cache-data-structure.md`), and the catalog's resource key as written (`{owner}/{lang}/{id}`).
- Do not change `packages/language-pack-client/src/assistant/` (C2 works there). Any library change outside it is announced to the `lp3-c2` session (`local_eb70f331-a6a6-4808-b69e-1273fd83e5e2`) before its commit, and gets its own commit.
- Tests never reach a network except the opt-in staging runs (`LP3_STAGING=1`), which are never in CI. Test keys are generated at run time.
- Checks at every commit, from `apps/tc-study`: `bun test src` (output to a file, read the summary), `bun run type-check`, `bun run lint` (at most 23 warnings), `bun run test:arch` (the size budgets apply to the new folder). In packages touched: `bun test` and `bun x tsc --noEmit -p <package>`.
- Code, comments and commits in English; each commit body says why. User-facing text in tc-study follows its existing i18n (no new language). Nothing is pushed, opened as a PR, merged or deployed without Abel's yes.

## Review Focus

1. **A book the language's pack does not have** (es-419 on staging has six books; the reader opens Genesis). That book loads from Door43 as today, and its rows are not mixed with format 3 rows of another book. Test in Task 8.
2. **A new revision on staging after rows were written.** The rows of the units that changed are replaced, and the derived `prepared:`, `helps-quote:` and `helps-align:` rows of those books are deleted so the warm worker recomputes them. Rows of unchanged books stay. Test in Task 7.
3. **The network drops in the middle of an install.** Rows are written only for units the library activated. The Read view keeps what it had, and the next sync fetches only what is missing. Test in Task 7.
4. **Helps in a language staging does not serve** (text es-419 from format 3, helps in `pt` or any language without a format 3 pack). Text from format 3, helps from Door43, aligned against the format 3 Bible as today. Test in Task 8.
5. **Switching the server back to production after format 3 rows exist.** The rows stay readable (same keys as Door43), Door43's background download completes what is missing, and the `tc-study-packs-v3` database is not opened. Test in Task 1 (switch) and Task 10 (journey).

---

### Task 1: Switch, keys and the client

**Files:**
- Create: `apps/tc-study/src/features/packsV3/packsFormat.ts`, `apps/tc-study/src/features/packsV3/client.ts`, `apps/tc-study/src/features/packsV3/testing/sample.ts` (port of Servos `src/resources/v3/testing/sample.ts` and its `fakeFetch`)
- Modify: `apps/tc-study/package.json` (dependencies `@bt-synergy/language-pack-client`, `@bt-synergy/language-pack-v3`, `workspace:*`), `apps/tc-study/vite.config.ts` (plugin `trustedKeysV3`, port of Servos `vite.config.ts:95-121`), the version label (`src/utils/deployVersion.ts`: «· staging» when format 3)
- Test: `packsFormat.test.ts`, `client.test.ts` beside them

**Interfaces:**
- Produces:
  - `packsServer(): 'production' | 'staging'`: `?packs=staging|production` in the URL wins and is saved in localStorage `tc-study:packs-server`; otherwise the saved value; otherwise `import.meta.env.VITE_TCS_PACKS`; otherwise `'production'`.
  - `packsFormat(): 2 | 3`: `3` exactly when `packsServer() === 'staging'`.
  - `V3_ORIGIN_STAGING = 'https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev'`.
  - `createPacksV3(o?: { fetch?: typeof fetch; store?: BlobStore; trustedKeys?: Record<string, Uint8Array> }): LanguagePackClient`, default store `indexedDbStore({ name: 'tc-study-packs-v3' })`, `index: null` (memory index by default).
  - `packsV3(): LanguagePackClient` (singleton; throws `Error('format 3 is off')` when `packsFormat() === 2`), `readerV3(lang: string): Promise<PackReader | null>` (cached per language, `null` when nothing is active), `forgetReadersV3(): void`.
  - `testing/sample.ts`: `buildSample(): Promise<Sample>` (a signed es-419 Titus and Ruth with tN, tQ, tWL, GLT, GST and the needed tW and tA groups, plus en tN/tWL/tQ for Titus, built with `language-pack-v3` builders and a key generated at run time) and `fakeFetch(sample): typeof fetch & { urls: string[] }` answering the three routes.

- [ ] **Step 1: Failing tests.** `packsFormat`: default 2; `?packs=staging` gives 3 and is remembered after the query is gone; `?packs=production` goes back to 2; `VITE_TCS_PACKS=staging` gives 3. `client`: with `fakeFetch(sample)` and `memoryStore()`, `install('es-419', { books: ['tit'] })` then `readerV3('es-419')` answers `passage('tit 1:1')` with a note; `readerV3('fr')` is `null`; `packsV3()` throws with format 2, and no IndexedDB database is opened (spy on `indexedDB.open`).
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** Vite must compile the library's TS sources (they export `./src/index.ts`); check that `bun run build` works with the default server and with `VITE_TCS_PACKS=staging`.
- [ ] **Step 4: Run the checks of Global Constraints.**
- [ ] **Step 5: Commit** `tc-study: a format 3 client, on only when the packs server is staging`.

### Task 2: USFM from a format 3 book (`language-pack-v3`)

**Files:**
- Create: `packages/language-pack-v3/src/read/usfm.ts`, test `src/read/usfm.test.ts`
- Modify: `packages/language-pack-v3/src/index.ts` (export)

**Interfaces:**
- Produces: `bookUsfm(book: BookModel, text: number, orig: OrigModel): string` (the text `book.texts[text]` with `\zaln-s`/`\zaln-e` milestones from `align`, `\w` words, chapters, verses, paragraphs, poetry, section titles, introductions, footnotes and cross references from `events` and `attrs`); `origUsfm(orig: OrigModel): string` (`\w` with `lemma`, `strong`, `x-morph`; ketiv and qere as marked in the segment).
- Consumes: `bookView`, `origView`, the builders `bookSegment`, `origSegment` (tests).

- [ ] **Step 1: Failing tests.** Build a book segment from a small USFM fixture with every marker kind listed above (existing fixtures in `src/build/*.test.ts`), rebuild it, and assert: the rebuilt USFM, built again, gives a segment with the same id; verse texts equal the source's; each aligned word keeps its `x-strong`, `x-lemma`, `x-occurrence` and `x-content`. The same for `origUsfm`, including one ketiv/qere pair. Opt-in with `LP3_DATA=<folder of real sources>`: es-419 GLT Titus and UGNT Titus rebuild to segments with the same ids.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** Words that `alignMissing` lists stay unaligned text.
- [ ] **Step 4: Run** `bun test` and `tsc --noEmit` in `language-pack-v3`, and `bun test` in `language-pack-client`.
- [ ] **Step 5: Codex review** (read-only, recipe in the Servos memory `codex-cli-windows.md`) of `usfm.ts`, with the Sonnet reviewer.
- [ ] **Step 6: Commit** `v3: rebuild a book's USFM, with its alignment, from the book segment`.

### Task 3: Scripture rows

**Files:**
- Create: `apps/tc-study/src/features/packsV3/rows/scriptureRows.ts`, test beside it

**Interfaces:**
- Consumes: `bookUsfm`, `origUsfm` (Task 2); `processUsfmToUsjResult` and the chapter row writer of `@bt-synergy/scripture-loader` (`usjChapterStore.ts`).
- Produces: `type Row = { key: string; value: unknown }`; `scriptureRows(reader: PackReader, book: string): Promise<Row[]>`: for each text of the book, `scripture-usj:{resourceKey}:{book}:{chapter}` rows and the book index row, exactly as `ScriptureLoader` writes them; `origRows(reader: PackReader, book: string): Promise<Row[]>`, the same for UGNT (`unfoldingWord/el-x-koine/ugnt`) or UHB (`unfoldingWord/hbo/uhb`).

- [ ] **Step 1: Failing test.** From `buildSample()`: the rows of es-419 GLT Titus equal, key by key and value by value, the rows that `processUsfmToUsjResult` gives for the source USFM the sample was built from (ignore only processing timestamps). Every text of the book gets rows ("todas las Biblias"). The UGNT Titus rows carry `strong`, `lemma` and `morph` on each word.
- [ ] **Step 2: Run, see it fail. Step 3: Implement. Step 4: Run the checks.**
- [ ] **Step 5: Commit** `tc-study: scripture rows from a format 3 book`.

### Task 4: Help rows (tN, tQ, tWL)

**Files:**
- Create: `apps/tc-study/src/features/packsV3/rows/helpsRows.ts`, test beside it

**Interfaces:**
- Produces: `helpsRows(reader: PackReader, book: string): Promise<Row[]>`: `tn:{key}:{book}` as `ProcessedNotes` (book and chapter introductions included, split by chapter the way the tN loader splits), `tq:{key}:{book}` as `ProcessedQuestions`, `twl:{key}:{book}` as `ProcessedWordsLinks` (`twLink` as `rc://*/tw/dict/bible/{category}/{id}`).

- [ ] **Step 1: Failing test.** From `buildSample()`: each row equals what the matching loader's parser gives for the source TSV of the sample (ignore `processingDate`). Notes keep `supportReference`, `quote`, `occurrence` and `tags`; links keep the category.
- [ ] **Step 2–4.** Run, implement, run the checks.
- [ ] **Step 5: Commit** `tc-study: note, question and word-link rows from a format 3 book`.

### Task 5: Article rows (tW and tA)

**Files:**
- Create: `apps/tc-study/src/features/packsV3/rows/articleRows.ts`, test beside it

**Interfaces:**
- Produces: `articleRows(reader: PackReader, group: string): Promise<Row[]>`: tW entries `{key}/{entryId}` (markdown, plus the `helps-text:tw-title:` and `helps-text:tw-preview:` rows), tA entries as `TranslationAcademyArticle` (title, subtitle/question, related) plus `helps-text:ta-title:`. `articleMarkdown(model: ArticleModel): string` joins the sections and writes article ids back as the `rc://*/tw/...` and `rc://*/ta/man/...` links the entry viewers follow.

- [ ] **Step 1: Failing test.** From `buildSample()`: a tW article and a tA article give the rows the TW and TA loaders give for their source files; every link in the source markdown is still followable (same target) after the round trip; a related tA article is listed.
- [ ] **Step 2–4.** Run, implement, run the checks.
- [ ] **Step 5: Commit** `tc-study: tW and tA rows from format 3 articles`.

### Task 6: OBS rows

**Files:**
- Create: `apps/tc-study/src/features/packsV3/rows/obsRows.ts`, test beside it

**Interfaces:**
- Produces: `obsRows(reader: PackReader): Promise<Row[]>`: `obs:{key}:{01..50}` as `ParsedObsStory` (frames with image links), and the OBS tN, tQ and tWL rows under the prefixes the OBS helps reuse.

- [ ] **Step 1: Failing test.** Add OBS stories 1–2 with their helps to `buildSample()`; the rows equal what `ObsLoader` and the OBS help loaders give for the sources.
- [ ] **Step 2–4.** Run, implement, run the checks.
- [ ] **Step 5: Commit** `tc-study: OBS rows from format 3`.

### Task 7: Sync a language into the rows

**Files:**
- Create: `apps/tc-study/src/features/packsV3/syncV3.ts`, `apps/tc-study/src/features/packsV3/catalogRowsV3.ts`, test `syncV3.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3–6; the cache and catalog adapters of `CatalogContext.tsx`.
- Produces:
  - `catalogRowsV3(reader: PackReader): CatalogEntryRow[]`: one `tc-study-catalog` entry per catalog resource (`key`, `title`, `subject`, `release`, `license`, `rights`, `attribution`, books as `ingredients` and `contentMetadata.downloadedIngredients`), the shape `openLanguagePacks.ts` writes today.
  - `syncLanguageV3(lang: string, want: { books: string[]; articles?: 'all' }, deps: { client: LanguagePackClient; cache: CacheAdapter; catalog: CatalogAdapter; signal?: AbortSignal; onProgress?: (p: SyncProgress) => void }): Promise<SyncOutcome>` with `type SyncOutcome = { kind: 'done'; books: string[] } | { kind: 'no-pack' } | { kind: 'offline' } | { kind: 'failed'; code: ClientErrorCode; retryAfter?: number }` and `type SyncProgress = { lang: string; unit: string; done: number; total: number }`.
  - Order: `refresh`, then `install` of the books asked for (the library adds their `orig` and needs), then rows of each activated book, its original and the article groups its helps point to, then catalog entries and the `resource:{key}` completeness receipts. One sync at a time per language (a second call waits for the first).
  - On a unit whose revision changed: delete its previous rows and the `prepared:`, `helps-quote:` and `helps-align:` rows of that book before writing. `E_NO_PACK` gives `no-pack`; `E_NETWORK` gives `failed` and keeps every row already written.

- [ ] **Step 1: Failing tests.** With `fakeFetch(sample)`, `memoryStore()` and in-memory adapters: syncing es-419 Titus writes the rows of Tasks 3–5 and the catalog entries; a second sync with no change fetches only the catalog (`urls`) and writes nothing; Review Focus 2 (revision 2 of the sample changes one Titus note: Titus rows and its `helps-quote:` rows are replaced, Ruth rows untouched); Review Focus 3 (fetch fails after the second segment: no row for the cut unit, `failed`, and a retry fetches only the missing segments); `fr` gives `no-pack`; two concurrent calls fetch each segment once.
- [ ] **Step 2–4.** Run, implement, run the checks.
- [ ] **Step 5: Commit** `tc-study: sync a format 3 language into the rows the panels read`.

### Task 8: Read takes format 3 languages

**Files:**
- Modify: `apps/tc-study/src/features/read/useReadLanguageBootstrap.ts`, `apps/tc-study/src/features/read/loadReadLanguageCatalog.ts`, `apps/tc-study/src/hooks/useCatalogBackgroundDownload.ts`, `apps/tc-study/src/components/read/DownloadIndicator.tsx`
- Create: `apps/tc-study/src/features/packsV3/useReadV3.ts`, test `useReadV3.test.ts`
- Cherry-pick: the `olLoadCache` fix commit of PR #66 (`tc-study: a failed original-language load rejects only for its callers`), as its own commit, if Abel closes #66.

**Interfaces:**
- Consumes: `syncLanguageV3`, `packsFormat`, `forgetReadersV3`.
- Produces: `useReadV3({ lang, book, helpsLang }): { mode: 'v3' | 'door43' | 'checking'; progress?: SyncProgress }`. With format 3: the catalog comes from `catalogRowsV3` instead of the Door43 search; the current book syncs first, then the language's other books and articles in the background; a book change syncs that book; the helps language syncs its helps for the same book (en helps over es-419 text). `mode` is `door43` for a language or helps language with `no-pack`, and Read then runs exactly as today. While a language is `v3` or `checking`, the Door43 background download leaves its resources and the originals alone. The download indicator shows `{lang} · {unit} {done}/{total}`.

Size: this task touches five files. If the implementer passes about 30 turns, the download indicator change goes to a fresh implementer as Task 8b.

- [ ] **Step 1: Failing tests.** Format 2: the hook does nothing and opens nothing. Format 3: es-419 Titus is `v3` and its rows land; Review Focus 1 (Genesis, not in the sample: Door43 for that book, no format 3 rows for it); Review Focus 4 (helps in `pt`: text rows from format 3, helps go to Door43); the background download skips a `v3` language's resources (test on the gate function you extract from `useCatalogBackgroundDownload`).
- [ ] **Step 2–4.** Run, implement, run the checks.
- [ ] **Step 5: Commit** `tc-study: Read takes a language from format 3 when the packs server is staging`.

### Task 9: Collections and old packs

**Files:**
- Modify: `apps/tc-study/src/features/collections/hydrateCollectionResources.ts`, `apps/tc-study/src/features/packs/openLanguagePacks.ts`
- Test: their existing test files, extended

**Interfaces:**
- Consumes: `syncLanguageV3`, `packsV3()`.
- Produces: with format 3, importing a collection or loading it in Studio syncs, for each language that has a format 3 pack, the resources the collection lists with the books it lists (others go to Door43 as today); exporting a collection is unchanged (it carries keys and layout). With format 3, opening a `.langpack.zip` goes through `packsV3().importOldPack(...)`, then rows as in Task 7; with format 2 it stays as today.

- [ ] **Step 1: Failing tests.** A collection with es-419 GLT and en tN for Titus imports with format 3: rows from format 3 for both, no Door43 call; the same collection with format 2 calls Door43 as today. Opening the sample as an old pack (`bridgeZip` input built in the test) with format 3 writes the Titus rows; with format 2 the existing tests pass unchanged.
- [ ] **Step 2–4.** Run, implement, run the checks.
- [ ] **Step 5: Commit** `tc-study: collections and old packs go through format 3 on staging`.

### Task 10: E2E journeys

**Files:**
- Create: `apps/tc-study/e2e/fixtures/packsV3.ts` (serves `buildSample()` segments on the staging origin with `page.route`; Door43 routes abort so any leak fails), `apps/tc-study/e2e/journeys/12-read-from-format3.spec.ts`, `apps/tc-study/e2e/journeys/13-format3-staging.spec.ts`

- [ ] **Step 1: Journey 12 (always runs).** Open `/?packs=staging`, pick es-419: Titus 1:1 shows with a note and its highlighted quote; helps in English show over the es-419 text; changing to Ruth brings Ruth; export the collection and import it in a fresh profile; reload offline and Titus 1:1 still shows; `?packs=production` shows the same rows without opening `tc-study-packs-v3` (Review Focus 5).
- [ ] **Step 2: Journey 13 (opt-in, `LP3_STAGING=1`, never in CI).** Against the real staging server: en Titus 1:1 with notes and words, es-419 Titus 1:1 with en helps. Record the times to first verse in the ledger.
- [ ] **Step 3: Run** `bun run test:e2e` (the existing journeys pass unchanged; journey 10 still skips without `PACKS_DIR`). If a CI-like failure is a browser download DNS error, it is the network, not the code.
- [ ] **Step 4: Commit** `tc-study: E2E journeys for reading format 3`.

### Task 11: Same data as Door43, and the docs

**Files:**
- Create: `apps/tc-study/src/features/packsV3/sameRows.test.ts`, `apps/tc-study/docs/format3.md`
- Modify: `packages/language-pack-client/README.md` (tc-study as a consumer; open items), `apps/tc-study/README.md` (one paragraph and the `?packs=staging` switch)

- [ ] **Step 1: `sameRows.test.ts`, opt-in `LP3_STAGING=1`.** For es-419 Titus and en Titus, the rows synced from staging equal the rows the Door43 loaders write for the same releases (ignore timestamps; a difference whose cause is the source release, not the reader, is listed in the ledger, not fixed). This is the proof of "conserva".
- [ ] **Step 2: `docs/format3.md`** (English): the switch, the database, which rows come from where, how to go back to production, what part 2 adds.
- [ ] **Step 3: Run the checks; commit** `tc-study: compare format 3 rows with Door43's, and document the format 3 path`.

---

## Final check in the browser (controller)

Build with `VITE_TCS_PACKS=staging`, `vite preview`, built-in browser: en Titus and es-419 Titus with en helps, Ruth, a collection export and import, offline reload. Screenshots and times go in the ledger.

## Final review

Three Opus reviewers in parallel (`.claude/lp3-controller.md`, "Reviews"), each with its part of `git diff origin/master..HEAD`, the ledger's deferred items and the rulings:

1. **Rebuilding the text:** `language-pack-v3/src/read/usfm.ts`, `rows/scriptureRows.ts`. Against the source USFM: every marker kind, alignment, ketiv/qere, footnotes, poetry, RTL. Questions: can a verse lose words or alignment; are all the language's Bibles written.
2. **Helps, articles and OBS rows:** `rows/helpsRows.ts`, `rows/articleRows.ts`, `rows/obsRows.ts`, `sameRows.test.ts`. Questions: does any field the panels read come out empty or different; do links still lead where they led.
3. **The app path:** `packsFormat.ts`, `client.ts`, `syncV3.ts`, `catalogRowsV3.ts`, `useReadV3.ts`, the Read, download, collection and pack-opener changes, `vite.config.ts`, E2E. Questions: can the default build touch format 3 or staging; can stale rows survive a new revision; can Door43 and format 3 write the same book at once; does a failure leave Read empty.

Then the controller writes `FIN:` with the commit list, the browser times, and the open items (at least: part 2 panels, MACULA and lexicon if Abel wants them, the wa-sqlite search driver, removing the Door43 loaders in phase 4, and having the warm worker use the quote positions format 3 already has).
