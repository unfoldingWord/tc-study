# C5 part 1, handoff of 2026-11-24

Where the C5 part 1 work stands (tc-study reads language packs format 3 on staging), and how to continue in a new session. Read this file and the plan, `docs/superpowers/plans/2026-11-12-tc-study-reads-format3-c5.md`. The detailed ledger, which is not in git, is `.superpowers/sdd/2026-11-12-tc-study-reads-format3-c5/ledger.md`. Read only its "Rulings" sections and its last 15 lines.

## Done

- Worktree `C:\Users\LENOVO\Git\Github\wt\lp3-c5`, branch `feat/tc-study-reads-format3`, local only. Nothing is pushed and there is no PR.
- **Abel approved the plan on 2026-11-12** with its six decisions as written (see "Decisions for Abel" in the plan).
- **Tasks 1–8b are done and reviewed:** 18 commits on top of `origin/master` `ac276343`, from `368d1461` to `29a65d0a`. At `29a65d0a`:
  - `apps/tc-study`: `bun test src` 2051 pass, 0 fail; type-check clean; lint 22 warnings (the limit is 23); `test:arch` 124 pass.
  - `language-pack-client`: 238 pass.
- **The only library change** is `PackReader.resources()` (`0b11752d`, `packages/language-pack-client/src/reader.ts`). The C2 session was told.
- **Codex reviewed Task 2** (`bookUsfm`, the USFM rebuild) before Codex stopped reviewing. It found two real bugs, fixed in `d4f248c0`.
- **PR unfoldingWord/tc-study#66 is closed** with Abel's OK. Its `olLoadCache` fix, originally `7d626707` on the PR branch, is cherry-picked here as `7f6ec7ca`.
- Committed together with this file: the plan's "Final review" section, rewritten for the review model below.

## Decisions taken while running, that are not in the plan

1. **A book that the language's pack lacks sends the whole language to Door43, not just that book.** Example: Genesis in es-419. The plan's Review Focus 1 asked for one book only. The controller accepted this and documented it in Task 8 (`9bf66584`). Abel was told on 2026-11-15 and has not answered. If he wants it per book, it becomes a fix task. Until then, leave it.
2. **The release stamp is the tag only.** Format 3 has no `published_at`. Sync keeps the Door43 row when the tag matches (Task 7, `97f607be` / `0b9efbcf`).
3. **T-071 (OBS in the packs) and later merges changed `language-pack-client`.** C5 keeps using its own OBS rows (Task 6); no C5 task changes.
4. **Review model (Abel, 17 Nov).** Codex no longer reviews. Reviews follow the Elephant Goldfish model: fresh Sonnet subagents that did not see the work. The plan's "Final review" section is updated.

## What remains, in order

1. **Rebase on `origin/master`.** Use `git fetch origin && git rebase origin/master`; the branch is local only, so rebasing is allowed. On 2026-11-24 `origin/master` was `3cb4fc75`, and the branch was 216 commits behind and 18 ahead.
   - **What changed on `master`.** Nothing in `apps/tc-study`. It did change many files in `packages/language-pack-v3/src` and `packages/language-pack-client/src` (`client.ts`, `index.ts`, `reader.ts`, `query/*`, new `patch.ts` and `complements.ts`), plus `packages/scripture-loader/src/processUsfm.ts`, `bun.lock` and CI.
   - **`reader.ts` conflict (our `0b11752d`).** `master` already has a public `resources?(): CatalogResource[]`. It lists only the language catalog's resources: it has no `catalog` field, and it does have `books`. Ours lists every catalog, the common one too, with a `catalog` field. Keep `master`'s method unchanged and drop our version of it.
     - Then make `apps/tc-study/src/features/packsV3/catalogRowsV3.ts` (which calls `reader.resources()`) work with `master`'s shape.
     - If its tests show that it needs the common catalog's resources (the originals UGNT and UHB), add a separate additive method in the library, in its own commit. Do not change `master`'s `resources`. Tell Abel in the report.
   - **`language-pack-v3/src/index.ts`.** Keep both sides; ours adds the `bookUsfm`/`origUsfm` export.
   - **`bun.lock`.** Take `master`'s version, then run `bun install` at the repo root and commit the lockfile only if it changed.
   - **Checks after the rebase:**
     - in `apps/tc-study`: `bun test src`, `bun run type-check`, `bun run lint` (23 warnings at most) and `bun run test:arch`;
     - in `language-pack-v3` and `language-pack-client`: `bun test`.
     - The numbers under "Done" are from before the rebase. Write the new ones in the ledger.
     - `processUsfm.ts` changed on `master`, so `scriptureRows.test.ts` (which compares with Door43's processing) may fail. If it does, fix the code, not the test's expectation, unless the difference comes from `master`'s change itself.
2. **Task 9:** collections and old packs.
   - **The test sample.** `apps/tc-study/src/features/packsV3/testing/sample.ts` (`buildSample`) has only es-419 Titus and the common unit. It has no Ruth and no English helps, although the plan's Task 1 asked for both. Task 9's tests (en tN over es-419) and journey 12 (Ruth) need them, so Task 9's implementer extends the sample first.
   - **`packsV3()` returns a Promise,** not the client directly as the plan's Task 1 says. Await it.
   - **Briefs.** Write the implementer's brief like the existing `brief-task*.md` files in the ledger folder: the plan section's line numbers, Global Constraints, staging only its own paths, and the report path.
3. **Task 10:** E2E journeys 12 and 13. Journey 13 runs only with `LP3_STAGING=1`.
4. **Task 11:** `sameRows.test.ts` and the docs.
5. **Browser check** against staging, with en Titus and es-419 Titus with en helps (plan, "Final check in the browser").
6. **Final review** with goldfish (plan, "Final review"), and fix rounds.
7. **Report for Abel** in Spanish: a short report, then three separate questions, one after the other:
   - push the branch;
   - open the PR;
   - deploy (tc-study's Pages deploy is manual).

   Ask the next question only after he answers the one before. While waiting, do nothing more.

## Open minor items (for the final review)

These are in the ledger's Progress lines:

- Task 2: the `alignMissing` id; the parser devDependency; note attributes are untested.
- Task 3: `origRows` has no Door43 equality test; GST `x-morph` differs from Door43.
- Task 4: the builder loses `<br>`, lowercases link ids, and rewrites `rc://en` links to `es-419`.
- Task 5: the stamp default.
- Task 7: magic segment counts in tests; `dropBook` derived rows.
- Task 8: `ensureLanguageV3` is called twice.
- Task 8b: the indicator label is hard-coded in English.

## How to run it (Abel's rules of 2026-11-24)

- **This file overrides `.claude/lp3-controller.md`** where they differ. There is no supervisor session, no `RELEVO` line, no 15-minute `CronCreate` check, no Codex, and no "three Opus reviewers". The rest of `lp3-controller.md` still applies: small context, return contracts, and at most 3 or 4 tasks per context. When you reach that limit, write a new handoff file like this one instead of a `Handoff:` line, and stop. A sensible point is after Task 10.
- Task 2 Step 5 of the plan ("Codex review") was already done; ignore it.
- **One fresh session** runs the rest. It reads this file and the plan, and dispatches the `lp3-implementer`, `lp3-reviewer` and `lp3-runner` agents (`.claude/agents/`) one at a time, on Sonnet or medium effort.
- No scheduled checks every few minutes.
- No session alive for days: when a context gets long, write a new handoff file like this one and stop.
- Commits stay local. No push, PR, merge or deploy without Abel's yes. Never call production. No secrets.
- Code, comments and commits in English, with a body that says why. Commits end with the `Co-Authored-By` line given in the conversation's system reminder. PR bodies end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
- Talk to Abel in Spanish, using «tú».
- Never archive sessions.
- **E2E in GitHub CI:** a failure from DNS while installing the browser is the runner's network, not the code. Read the log before calling a run bad.
