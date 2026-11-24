# Language packs format 3, C2.1 (the assistant, second round) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. The controller follows `.claude/lp3-controller.md` and dispatches `lp3-implementer`, `lp3-reviewer` and `lp3-runner`.

**Goal:** Fix the defects the C2 final review found, give es-419 its 66 book names on staging, show OBS pieces in the card, and measure the gate once on a new held-out set.

**Why:** C2 (`feat/language-pack-assistant`, d4d574f3) failed the gate twice. The run-2 numbers were 72 % calls correct in es and 75 % in en, against a target of 90 %; `packages/language-pack-assistant/eval/RESULTS.md` has the details. The C2 test sets have been seen, so they cannot measure anything again.

**Spec:** `docs/superpowers/specs/2026-11-12-language-pack-assistant-c2-design.md` (unchanged, except that part 2 gains OBS fragments, Task 6). The C2 plan `docs/superpowers/plans/2026-11-12-language-pack-assistant-c2.md`: its Global Constraints hold here too, apart from the changes below. The C2 rulings (R1–R38) hold unless a task here changes one; they are in the notes folder, `lp3-c2-ledger.md`.

## Abel's decisions (2026-11-16)

1. **The new test sets** are written by fresh subagents with no access to any rule, phrase, template or earlier question. They are frozen before any code of this plan changes. The C2 test sets become tune sets.
2. **Book names:** es-419 gets a list of the 66 book names through the pipeline (`build-v3 --book-names`), published to staging before the gate run. Production is not touched.
3. **OBS:** the card shows OBS pieces, now that #86 is on master.

## Changes to the C2 Global Constraints

- **Branch and start:** same worktree and branch. Task 1 rebases onto `origin/master` (b64253e9 or later, with OBS #86).
- **Freeze:** the held-out sets of this plan are `eval/questions/{es,en,pt}-test2.jsonl`, frozen by Task 2's commit. The C2 sets `*-test.jsonl` become tune data: they can be read and tuned on from Task 2 on. Tuning uses `*-tune.jsonl` and `*-test.jsonl`; `*-test2.jsonl` is run once, in Task 8.
- **Staging publish:** Abel runs it in his own terminal (as in phase 3, step S4). Claude prepares the list and the exact command, and does not handle R2 credentials or the signing key.

## Review Focus

1. **An ambiguous name with more words** («Jonás y el gran pez», «la planta de Jonás»): never accepted as a concept or a book; it goes to search or to a choice. Covered in Task 4.
2. **The index after the rebase:** OBS rows and C2's stems and role columns coexist. An index of any earlier version (C1, C2 v2/v3, OBS) is rebuilt once. Covered in Task 1.
3. **Book names:** «Juan 3:16», «Jn 1:1», «1 Juan 3» and «Génesis 1» are references in es-419 once the map carries the names; a book with no text still says it is not installed, and is not treated as "no answer". Covered in Tasks 3 and 4.
4. **A card never shows text it did not get from an answer.** OBS pieces cite their story and frame. Covered in Task 6.
5. **Slow cards:** `renderings` for a common Strong key and a fallback search stay under 300 ms at the 95th percentile on the desktop, or the report says why not. Covered in Task 7.

---

### Task 1: Rebase onto master with OBS

- [ ] Rebase `feat/language-pack-assistant` onto `origin/master`. In the client, keep both sides:
  - OBS rows (`book: 'obs'`, kinds `title`, `text`, `note`, `question`, refs `NN:FF`), `stories` and `story`, and the `obs` fields;
  - C2's stems column, role column, `section` kind, interning and `books({strong})`.
- [ ] Set `INDEX_VERSION` above both sides' versions, so any earlier index is rebuilt. Add one migration test from an OBS-era index.
- [ ] The `search` schema lists every kind. Each OBS row also gets stems.
- [ ] Run the suites of client, assistant, language-pack-mcp and language-pack-v3, and `tsc` for the three TS packages.
- [ ] Commit fixes as `client: C2 after OBS`. Record the conflicts in the report.

### Task 2: New held-out sets, frozen (before any code change of this plan)

- [ ] Move the C2 test sets to tune use: keep their files and add a line to `eval/questions/README.md` saying they were seen in C2 runs 1 and 2 and are tuning data from now on.
- [ ] Three fresh writers, one per language, run in parallel and do not commit. They write 150 questions each in `{es,en,pt}-test2.jsonl`, with the same mix and line shape as C2 Task 4b, plus 10 OBS questions per language where the packs have OBS.
  - The writers may not open the existing question files, rules, phrases, templates or `eval/results/`.
  - Book references use the call the person means: a passage for any book. Pieces go only where the cached packs hold them.
- [ ] An independent opus reviewer samples each set, as in C2.
- [ ] One fix pass, then `check-ids` with 0 failures.
- [ ] The controller makes the freeze commit `eval: second held-out sets, frozen before C2.1`, with counts per language and per query.

### Task 3: es-419 book names on staging

- [ ] Write `packages/resource-pipeline/data/book-names/es-419.json` in the form `{ book: [name, short, abbreviation] }` for all 66 books.
  - Where staging has text, the names follow its `\toc` lines, so they agree with the text.
  - For the rest, use the Latin American forms the es-419 GLT uses for its own books. The source is noted in `language-pack-v3/spec/fuentes.md`.
- [ ] Wire `--book-names` into the pipeline's es-419 build: the workflow (`language-packs.yml`) and the local command in the phase 3 S4 doc. Add a test that the map core of a fixture build has `source: 'list'` for a book with no text.
- [ ] Abel reviews the list (66 lines).
- [ ] Prepare for Abel the exact `publish-language --parts --no-upload` and `publish-v3` commands for es-419 with the new list. **Abel runs them** against `packs-staging`.
- [ ] Then `verify-v3` against staging, and a check that the es-419 map core has 66 named books.
- [ ] Commit `pipeline: es-419 book names`.

### Task 4: Chain fixes from the C2 final review

Tune on `*-tune.jsonl` and the C2 `*-test.jsonl` only. Each rule states its general form.

- [ ] `rules.ts`, `ambiguousBook`: a name is "alone" only when the question has no other content words. Otherwise the rule does not decide.
- [ ] `decide.ts`, fix (f): the threshold is `>= N`, with N set on the tune data. It applies to every non-tA concept, not only names.
- [ ] `templates/*.json`, search templates: written with slots instead of real names; retrain the three classifiers.
- [ ] Rules 7 and 3: with several named concepts, the order follows their position in the question. With more than one, the chain offers a `choose` of up to 3 concept calls.
- [ ] Rule 6: two categories, or content words that are not entities, give a choice or go to search.
- [ ] `mask` gets a guard against overlapping spans; `looksLikeRef` gets a time-of-day guard («10:30 de la mañana»); `predict` builds its vocabulary map once per model.
- [ ] Review Focus 1 and 3 tests. The tune numbers before and after go in the commit bodies.

### Task 5: The card, other sections

- [ ] For `concept` and `article`, ask `article(id, 'all')`, as spec part 5 says.
- [ ] Order the pieces: the default section first, then the other sections in the article's order, then where the concept is used.
- [ ] The `concept:` piece goes after the sections.
- [ ] Tests.

### Task 6: OBS pieces in the card

- [ ] Spec part 2 (its own commit): the fragment ids `frame:obs NN:FF`, `obsnote:NN:FF/<rowid>` and `obsquestion:NN:FF/<rowid>`. A `pieza:` link for each, or `obs:NN:FF` when the app can open a frame (add it to the link forms).
- [ ] `fragmentsOf` builds these pieces from OBS search hits and from the `obs` fields of the `concept` and `books` answers. `canonId` and `check-ids` learn the new ids.
- [ ] Tests on the OBS spec fixtures.

### Task 7: Slow cards

- [ ] Profile `renderings` for G5485 on the en packs, and the fallback search, on the desktop. Fix in the client what is algorithmic, for example a per-key index of the aligned words built once per reader, instead of a scan per call.
- [ ] Test the result and report the times before and after on the tune data.

### Task 8: The gate, once

- [ ] Prerequisites: Abel published the book names (Task 3), and Tasks 4–7 are reviewed.
- [ ] `LP3_GATE=1` run of `*-test2.jsonl` for es, en and pt, one run each.
- [ ] Update `RESULTS.md` with a new section next to the C2 runs: the gate table, failure kinds and known limits.
- [ ] Update `SERVOS.md` and both READMEs.
- [ ] Final review: three opus reviewers, one fix wave, one scoped re-review.

## Done

- **Commits:** local on the branch; push, PR and merge only on Abel's yes.
- **Gate:** measured once on the new sets and reported as it comes out, whatever it is.
- **Report:** a short report in Spanish.
