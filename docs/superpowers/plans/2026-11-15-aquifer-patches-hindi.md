# Aquifer patches, Hindi pilot (format 3)

> **For agentic workers:** execute task by task. Each task is written by one agent and reviewed by a different one (`lp3-reviewer`), with a final review over the whole branch. Steps use `- [ ]`.

**Goal:** fill the Hindi gaps of the Door43 packs with unfoldingWord® Translation Notes (48 books) and Translation Questions (33 books) adapted by Mission Mutual and published by Aquifer. They go in a **separate, marked patch catalog**; Door43 stays the base and always wins.

**Why:** Door43 production has Hindi tN for 1 book (Acts) and tQ for 33 books. Aquifer (`BibleAquifer` on GitHub, CC BY-SA 4.0) has tN for 49 books and tQ for 66. Phase 0 and its decisions are in `bt-servant-workspace/handoff/mini-servant/aquifer-fase0.md` (2026-11-15). Abel delegated those decisions, and they are taken: GitHub pinned by commit, no key; a notice by `review_level`; Hindi first.

## Design

1. **A patch catalog is a language catalog with a private-use tag:** `{lang}-x-{source}`, here `hi-x-aquifer`. It is valid BCP 47 and passes the Worker's tag check (`serving.md`), so `/v3/packs/hi-x-aquifer/catalog` works unchanged. `publishV3`, the readers and the client already treat it as a language. Its header `lang` and its segments' `lang` are `hi-x-aquifer`.
2. **Its units are `book:<book>` segments with `texts: []`.** `book.cddl` already allows "a language with notes and no text of this book". They carry only `notes` and/or `questions`, with no `quotes` table in the pilot, because Aquifer gives no occurrence. They `require` the published common catalog. They need `orig:<book>` and `map` like any book, but **not** `art:` groups: their `ta:` concepts resolve in the base language (`hi`), and the app opens both. A patch book exists only where Door43 has no tN (or no tQ) for that book; a book with both stays out of the patch.
3. **Provenance lives on the catalog's `resources` entries.** It is the only provenance slot in format 3, and the segment header's `res` points to it.
   - The key is `aquifer/hi/tn` or `aquifer/hi/tq`.
   - `title` is the source title.
   - `release` is `UWTranslationNotes@<commit>`.
   - `license` is `CC-BY-SA-4.0`.
   - `rights` is "© 2022 unfoldingWord; adapted by Mission Mutual".
   - `attribution` is the exact `adaptation_notice` text from `metadata.json`, without HTML.
   - Two new optional fields go on a resource entry:
     - `source`: `"aquifer"`, the aggregator the data came from;
     - `review`: `"none"`, `"community"`, `"professional"` or `"mixed"`, the `review_level` of its articles (mixed when they differ).
   - These fields are a spec change to `catalog.cddl`, `catalog.md` and both readers. A Door43 resource has neither.
4. **Signed** with the same publisher key as the other packs. `about.publisher` is `unfoldingWord`, who publishes the pack; the source and the original publisher are on the resource entry.
5. **Rows:**
   - `id` is the Aquifer `content_id` (strings form). `ref` comes from the article's `passage` associations (`BBCCCVVV`).
   - `cols.quote` is the leading original-language quote (the first `<strong><span style='direction: ltr;'>`).
   - `cols.note` (or `question`/`response` for tQ) is the rest, as markdown.
   - `concept` and inline links: each `<data class="resource-ref" data-resource-code="UWTranslationManual" data-content-id=…>` becomes `[[ta:<manual>/<slug>]]`, via a map:
     - the Aquifer Hindi TA article (`content_id`);
     - its English article, by `reference_id`;
     - the English title;
     - the Door43 `en_ta` slug, by title.
     An unmatched link keeps its label as plain text and is counted.
6. **App side, for the Mini coordinator.** The order of preference is Door43 `hi` first, then `hi-x-aquifer`, then English. The notice comes from `review`. This plan adds only the client helper that merges a patch reader into passage answers (Task 5). The UI belongs to the Mini coordinator.
7. **Not in the pilot:**
   - the `quotes` table;
   - Portuguese, which comes after Hindi is measured;
   - automatic withdrawal of a patch book when Door43 publishes it, which is a rule of the builder: it rebuilds without that book;
   - an upload to staging, which happens only after verification and coordination with the Mini coordinator (`local_846480fa-230a-4f07-b7af-b984fef45739`).

## Tasks

### Task 1: Spec and readers: patch catalogs, `source` and `review`
- [ ] `spec/catalog.md`: a "Patch catalogs" section with points 1–4 above.
- [ ] `cddl/catalog.cddl`: add `? "source": tstr` and `? "review": "none" / "community" / "professional" / "mixed"` to `resource`.
- [ ] TS reader (`src/read/catalog.ts`, `readResource`): read both fields; a `review` outside the four values is `E_FORMAT`.
- [ ] Python reader (`spec/reader-py/lp3read.py`): the same, with tests.
- [ ] `catalog.ts` `buildCatalog` writes them when given, and has a `patch` mode in which a book's needs carry no `art:`.
- [ ] Tests in both readers, plus one conformance case (`tests/`) for a catalog with a patch resource.
- [ ] Commit `spec: patch catalogs and the resource source and review fields`.

### Task 2: Downloader `resource-pipeline/cli/fetch-aquifer.ts`
- [ ] `--repo UWTranslationNotes --lang hin --out <dir> [--commit <sha>] [--books ...]`.
  - Resolves the commit: the given one, or the head of the default branch through the GitHub API, using `GITHUB_TOKEN` when set and anonymous otherwise.
  - Downloads `{lang}/json/*.content.json` and the head of `{lang}/metadata.json` (only `resource_metadata`, by Range).
  - Writes `manifest.json` with repo, commit, date, and the sha256 and size of each file.
- [ ] Downloads go through `raw.githubusercontent.com/BibleAquifer/<repo>/<commit>/...` (pinned by commit, never by branch).
- [ ] Tests run on a local fake server; no network in tests.

### Task 3: Converter `language-pack-v3/src/build/aquiferHelps.ts`
- [ ] `aquiferNotes(items, book, res, taMap, issues)` and `aquiferQuestions(...)` return the `HelpTable` that `bookSegment` takes (as `extractHelps` returns it).
- [ ] `buildTaMap(hinTa, engTa, enTaTitles)` returns a map from the Aquifer content_id to `ta:<manual>/<slug>`.
  - `enTaTitles` comes from Door43 `en_ta` at a pinned release: `{manual}/{slug}/title.md`. A small fetch script writes it as JSON.
- [ ] HTML to markdown: `<p>`, `<strong>`, `<em>`, lists and links only. Anything else becomes its text.
- [ ] Tests with real fixtures: 2 notes and 2 questions from `hin`, cut from Aquifer JSON, plus the fixture of the TA map.

### Task 4: `resource-pipeline/cli/build-patch-v3.ts`
- [ ] `--lang hi --source aquifer --tn <dir> --tq <dir> --ta-map <json> --base-books <json> --common <dir|url> --out <dir> [--sign-key <pem>] [--revision n --previous <id>]`.
  - `--base-books` lists the books that have tN and tQ in Door43 production. It can be generated with `door43-books.ts --lang hi`.
  - The command builds only the books (and tables) the base lacks.
- [ ] Output: `catalog-hi-x-aquifer.seg`, `segments/`, and `report.txt` with the counts, the unmatched TA links and the books built.
- [ ] Tests: a two-book fixture builds, both readers open it, the resource entry carries `source` and `review`, and the needs have no `art:`.

### Task 5: Client: merge a patch into passage answers
- [ ] `language-pack-client`: `openPatched(lang, patchLang)` or an option on `open`, returning a reader whose `passage` (and `context`) answers:
  - add the patch's notes and questions only for books where the base has none of that table;
  - mark each cite with `source`, `review`, `attribution` and `license` from the patch resource;
  - resolve the `ta:` concepts in the base language.
- [ ] Tests on fixtures: base wins where both have notes; patch notes are marked; `ta:` resolves through the base.
- [ ] README: a short section for the app side, with the order, the notice text by `review` (from `plan-aquifer.md`) and attribution.

### Task 6: Measures and the TA check on 20 notes
- [ ] `resource-pipeline/cli/aquifer-measure.ts`:
  - before and after cells of the gap map for hi (books × tN and tQ);
  - the TA link hit rate over all notes;
  - 20 random notes printed with their links resolved, for a person to check.
- [ ] Results go in the report.

### Task 7: Local end to end
- [ ] Run Tasks 2 and 4 on the real data:
  - commits UWTranslationNotes and UWTranslationQuestions at head, recorded;
  - common taken from staging;
  - the staging signing key, passed by path (Claude never reads it).
- [ ] `verify-v3`, or both readers directly, open `hi-x-aquifer`.
- [ ] Sizes per book; Task 6's measures.
- [ ] No upload.

After Task 7: the final review (a different agent) over the whole diff, the fixes, the PR marked ready, and a Spanish report for Abel. No merge without Abel.
