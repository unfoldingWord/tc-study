# Gate results on the held-out sets

# C2.1: the gate on the second held-out sets

One run per language of `eval/questions/{es,en,pt}-test2.jsonl` (n = 150 each), frozen at `8d6fedc9` and not read or changed afterwards.
Command: `LP3_STAGING=1 LP3_GATE=1 bun eval/run.ts --lang <l> --set test2`. No rule, phrase, template, margin or question changed after the
results; no run crashed, so none was rerun. Result files: `eval/results/{es,en,pt}-test2.json` (every question, decision, interpretation,
top 3 ids, score, card time). `run.ts` gained `--set test2` (guarded by `LP3_GATE=1`); `test` is tune data now and is not guarded.

| Staging catalog revisions | `es-419` revision 7 (names all 66 books: 61 from the new list, 5 from text), `en` revision 6, `common` revision 3 |
|---|---|
| Freeze commit | `8d6fedc9` |
| Portuguese | no pack of its own: `pt-BR` questions run on the `es-419` reader (reported, not a Portuguese pack measurement) |

## The gate table

"Accepted" is R28 (a rule or the classifier); the second reading counts the search fallback as accepted too.

| | es | en | pt | target |
|---|---|---|---|---|
| Calls correct | 125/150 = 83.3 % **fail** | 112/150 = 74.7 % **fail** | 88/150 = 58.7 % **fail** | >= 90 % |
| Correct among accepted (R28) | 80/85 = 94.1 % **fail** | 80/94 = 85.1 % **fail** | 51/70 = 72.9 % **fail** | >= 98 % |
| Correct among accepted, with search | 101/113 = 89.4 % **fail** | 95/115 = 82.6 % **fail** | 79/133 = 59.4 % **fail** | >= 98 % |
| Top 3 (questions with pieces) | 85/127 = 66.9 % **fail** | 94/135 = 69.6 % **fail** | 46/98 = 46.9 % **fail** | >= 80 % |
| Card p50 / p95 ms (warm, SQL index) | 1.0 / 32.7 **pass** | 1.9 / 104.6 **pass** | 3.7 / 219.7 **pass** | p95 < 300 |
| Cards over 300 ms | 0 | 5 | 6 | |
| Steps (rule / classifier / choose / search) | 81 / 4 / 37 / 28 | 87 / 7 / 35 / 21 | 64 / 6 / 17 / 63 | |

Every accuracy target fails in all three languages; the time target passes in all three. The result is reported as it came out.

## Tune numbers on the new data (`eval/results/*-c21.json`, staging revisions above)

The `test` sets are tune data in C2.1 and were run once for these numbers.

| | es tune (n=100) | es test | en tune (n=60) | en test | pt tune (n=100) | pt test |
|---|---|---|---|---|---|---|
| Calls correct | 94/100 | 116/150 = 77.3 % | 56/60 | 116/150 = 77.3 % | 58/100 | 80/150 = 53.3 % |
| Correct among accepted (R28) | 78/81 | 87/91 | 47/49 | 94/108 | 48/62 | 48/67 |
| Median / p95 ms | 0.9 / 50.5 | 1.1 / 35.3 | 2.2 / 88.2 | 1.9 / 63.9 | 2.1 / 119.9 | 2.3 / 117.4 |

The test2 calls correct (es 83.3 %, en 74.7 %, pt 58.7 %) are above the tuned-on `test` sets for es (77.3) and pt (53.3) and below for
en (77.3). Three sets and one run each cannot say whether the gains are fitted: no conclusion is drawn either way. All are far from the targets.

Accepted and wrong (rule 6 and rule 8). A decision counts as accepted when the chain returns a `call` by a rule or the classifier, and
a `search` call decided by a rule is one of them. When the question expected another query, that row is accepted and wrong, so it lowers
correct-among-accepted. Counted from the test2 result files by decision shape only (no expectation read): rule-decided `search` calls:
es 1, en 2, pt 13 of the accepted rows (es 85, en 94, pt 70). A `choose` that offers `search` next to another query (rule 6) is not
accepted: es 1 and pt 2 rows, none in en.

## Known defects after C2.1, not fixed

From the chain review. Test2 has been run, so none of these was touched (R42); they need a third held-out set to be measured.

- Rule 1 accepts a `passage` call when leftover words remain (a `context` was asked).
- Rule 5 accepts an `article` call with leftover words (`books` was asked).
- Rule 7 accepts a `concept` call when the question holds a concept phrase and leftover words.
- STOP word gaps with N=1: en from, by, at, as, be, can, you, i, my; pt é, foi, era, ao, pelo, pela.
- `describesWithName` counts book, reference and category spans as description words.
- The ASK lists and slot templates look picked from the tune wordings.
- The time guard can drop a pt reference.

## Decisions per step

- Client: aligned-words index for `renderings` built once per book and text; section rows carry roles; `books({ strong })` pads keys.
- Pipeline: es-419 book names (61 from a list, 5 from text); staging republished as revision 7.
- Chain: fixes from the C2 final review; question words are not content words.
- Cards: concept and article cards show every section; OBS pieces and ids (frame refs padded on both sides).
- Gate: run once per language on the frozen sets, no change after seeing results.

## Failure kinds in the test2 rows (10 most common; expected query against what the chain gave, counted from the rows after the run)

1. **A search expected, a `choose` given (es 9, en 15, pt 2 = 26).** Free-text questions the chain offers as a choice between two queries.
2. **Passage reference answered by search (pt 14: 10 with a rule and a search call, 4 by search).** Portuguese forms have no map.
3. **Concept or article expected, search given (es 4, en 2, pt 14).** Names the lexicon does not hold in that form, or described in words.
4. **`context` expected, `passage` given (es 2, en 6).** Wordings the context phrases do not cover (the C2 kind persists).
5. **`books` expected, search given (es 1, en 4, pt 5).**
6. **`books` expected, an `article` card given (es 2, en 2).** The `ta:` id kind of C2 persists.
7. **Call correct, but the first expected piece is not in the top 3 (es 24: concept 9, search 9, topics 5, books 1; en 11; pt 8).** Piece order.
8. **A `choose` expected, search given (pt 7, es 1) or a different choose (es 3).**
9. **`renderings` expected, search given (pt 3; es 1 gave a rule `renderings` where a choice was expected).**
10. **Concept expected, a choice given or a wrong concept id (en 1, pt 4).**

## Known limits

- The sets were written by Claude subagents, not by translators; Abel did not review them. Some expectations may be wrong, notably the many "expects search" items that the chain answers with a choice (kind 1).
- No OBS (Bible stories) is in the staging packs, so OBS pieces are covered by unit tests, not measured here.
- Times are desktop only (phone: C3/Servos).
- Portuguese runs on the Spanish packs with no Portuguese map, so the pt numbers are not a pack measurement.
- The second held-out sets are used now: any further change needs a third set to be measured.

---

# C2 runs
Two runs per test set: run 1 (commit `a4c92b07`) and run 2 after one fix round (fixes (a)-(g) below, commits `e8b631e8`..`9277edd3`).
No rule, phrase, template, margin or question was changed after seeing run 2, and no run crashed. The gate fails in both runs.
Result files: `eval/results/{es,en,pt}-test.json` (run 1) and `eval/results/{es,en,pt}-test-run2.json` (run 2): every question,
decision, interpretation, top 3 piece ids, score, card time.

**Run 2 is not fully independent of run 1**: the fixes were chosen after reading run 1's failure kinds, so the
run 2 numbers are those of a system tuned on the kinds of failure the test set showed. They are better than a fresh set would give.
Fix (b) (books by article = by concept, `59ccece1`) was found by reading run 1's per-question rows, not only the failure kinds: the
commit quotes a test question. The other fixes came from the kinds.

## Run 1 and run 2 side by side (test sets, n = 150)

"Accepted" means decided by a rule or the classifier (R28); "with search" also counts the search fallback.

| Target | es run 1 | es run 1, scored like run 2 | es run 2 | en run 1 | en run 1, scored like run 2 | en run 2 | pt run 1 (reported only) | pt run 1, scored like run 2 | pt run 2 (reported only) |
|---|---|---|---|---|---|---|---|---|---|
| Calls correct (>= 90 %) | 90 = 60.0 % | 99 = 66.0 % | 108 = 72.0 % **FAIL** | 96 = 64.0 % | 106 = 70.7 % | 113 = 75.3 % **FAIL** | 65 = 43.3 % | 73 = 48.7 % | 76 = 50.7 % |
| Correct among accepted (>= 98 %) | 74/104 = 71.2 % | 81/104 = 77.9 % | 87/102 = 85.3 % **FAIL** | 81/114 = 71.1 % | 89/114 = 78.1 % | 98/117 = 83.8 % **FAIL** | 45/84 = 53.6 % | 51/84 = 60.7 % | 51/80 = 63.8 % |
| ... with search | 76/114 = 66.7 % | 83/114 = 72.8 % | 94/117 = 80.3 % | 85/118 = 72.0 % | 93/118 = 78.8 % | 105/125 = 84.0 % | 53/120 = 44.2 % | 59/120 = 49.2 % | 63/123 = 51.2 % |
| Expected piece in first 3 (>= 80 %) | 77/126 = 61.1 % | 77/126 = 61.1 % | 92/126 = 73.0 % **FAIL** | 78/135 = 57.8 % | 78/135 = 57.8 % | 100/135 = 74.1 % **FAIL** | 47/105 = 44.8 % | 47/105 = 44.8 % | 53/105 = 50.5 % |
| Card time median (< 300 ms) | 4.6 ms | 4.6 ms | 3.4 ms **pass** | 5.7 ms | 5.7 ms | 3.5 ms **pass** | 5.2 ms | 5.2 ms | 4.5 ms |
| Card time p95 (< 300 ms) | 363.9 ms (9 over) | 363.9 ms (9 over) | 190.1 ms **pass** (4 over) | 2841.7 ms (24 over) | 2841.7 ms (24 over) | 1228.4 ms **FAIL** (19 over) | 1070.1 ms (16 over) | 1070.1 ms (16 over) | 864.4 ms (14 over) |

The scorer changed between the runs (fix (b): `books` article and concept keys count as one call). "Run 1, scored like run 2" is run 1's stored
decisions and top 3 ids scored again with the current scorer by `eval/rescore.ts`: no chain run, no packs, no `LP3_GATE`. Run 2 scored
again the same way gives its stored numbers. So of the es calls gain (60.0 % to 72.0 %), 9 questions (6.0 points) are scoring and 9 (6.0 points) are the
chain; en: 10 (6.7 points) scoring, 7 (4.7 points) chain; pt: 8 (5.3 points) scoring, 3 (2.0 points) chain. Times and top 3 do not
depend on the scorer. The correct-among-accepted rows also use the final rule for accepted (rule or classifier, R28).

Result: es passes the card time targets and fails the three accuracy targets; en fails the three accuracy targets and the p95.

| Step that decided | rule | classifier | choose | search fallback |
|---|---|---|---|---|
| es run 1 / run 2 | 87 / 89 | 17 / 13 | 36 / 33 | 10 / 15 |
| en run 1 / run 2 | 94 / 95 | 20 / 22 | 32 / 25 | 4 / 8 |
| pt run 1 / run 2 | 64 / 64 | 20 / 16 | 30 / 27 | 36 / 43 |

## The fixes (one round, ledger ruling R37; checked on unit tests and the tune sets only)

a. Passage card: one `verse:` fragment per verse of a range, in text order (the fragment id never carries a range), then notes, questions, links. (`7fb3afaf`)
b. Scorer: `books({article: X})` and `books({concept: X})` score as the same call for `tw:`, `ta:` and person ids. (`59ccece1`)
c. Lexicon: numbered books with a digit and an abbreviation ("1 Cor", "1Co", "2 Tim.", "3 Jn", "1 Juan", "2 Reyes") in es, pt, en. (`e8b631e8`)
d. Phrases: `context` phrases ("in its context", "background for", "en su contexto", "contexto de", "no seu contexto"). (`74e574ca`)
e. Concept card: a `concept {id}` card is not lost to a choice with a namesake, so its top 3 is not empty; a title the maps split in two is still a part. (`1980783d`, `d8b4fd26`)
f. A name inside a free description (no concept, books or renderings phrase, a name entity, more than N other content words) goes to search. N = 1: the tune sets are flat for N = 1..4 (es 76/100, pt 49/100, en 55/60, the same as without the rule), so the smallest N is kept. (`9277edd3`)
g. "<one-chapter book> N" reads as verse N of chapter 1. (`e8b631e8`)

Tune sets after the round (`eval/results/*-tune.json`): es 76/100 calls (61/80 correct among accepted), pt 49/100 (39/63), en 55/60 (47/50).

## What was measured

| | |
|---|---|
| Test sets frozen at | `d1791dde` ("eval: question sets, frozen before tuning"; it was `df7a79bb` before the rebase onto master), unchanged since |
| Commit measured, run 1 / run 2 | `a4c92b07` / `10e0a36a` |
| Date | 2026-11-15 |
| Machine | Windows 11 desktop, Bun 1.3.3, SQL index (`bun:sqlite`, R30), warm (R34) |
| Staging catalog revisions | `es-419` revision 5, `en` revision 5, `common` revision 2 (staging URL of `eval/packs.ts`, signed by key `78d2e6299a2de4d0`) |
| Portuguese | no pack of its own: the `es-419` reader answers `pt-BR` questions (reported only, not counted) |
| Questions | written by Claude subagents; Abel did not review the Spanish set and asked for it to be measured as frozen |

## Failure kinds in run 2 (es and en; read from the decisions in run 2's rows, expectations not consulted, so counts are approximate)

1. **A name in a free description is still answered by the classifier with a concept (13: es 5, en 8; run 1 had 18).** "Jonah and the big fish" -> `concept tw:names/jonah`, "good Samaritan" -> `tw:names/samaria`, "ninivitas cilicio". Fix (f) did not reach these: they still arrive through the classifier step. Why the rule did not fire on them is not diagnosed (the tune sets are flat for N, so they could not show it).
2. **A choose card for a descriptive question or an ambiguous short name (about 25 failing rows).** "prodigal son", "lost sheep", "la planta de Jonás", "Juan", "John", "Daniel", "Mark" (the choice offers `front:intro` of the book).
3. **A reference that falls to search (7: es 5, en 2).** "Juan 3:16", "Romanos 8:28", "Génesis 1", "Nehemías 1:1", "3 Juan 1:3" (the es-419 map names few books, R24), "Jn 1:1", "Phil 2:5-8 notes" (en: abbreviations of books without a number are not in the map). Fix (c) covers numbered books only.
4. **Context asked, passage still returned (4: es 1, en 3).** "que hay antes y despues de Jonás 3:3", "what comes before and after Mark 10:45", "what is going on around Gal 3:28": the phrases of fix (d) are those of the brief, not these wordings.
5. **`books` asked, an `article` card returned for `ta:` ids (en 5)** ("where do rhetorical questions show up", "books with lots of hyperbole").
6. **`topics` answered with `category` where a book was asked (es 2)** ("lista de personas y lugares de Nehemías").
7. **Slow en cards (19 over 300 ms, p95 1228 ms)**: renderings for Strong numbers in the en packs (data gap, known); es has 4 over 300 ms.

Data gaps named as causes: es-419 map names few books (R24, kind 3); no Portuguese map (the pt reference failures); slow renderings in en (kind 7).

## Run 1: tune numbers next to the test numbers

| | es tune (n=100) | es test | en tune (n=60) | en test | pt tune (n=100) | pt test |
|---|---|---|---|---|---|---|
| Calls correct | 76 % | 60.0 % | 91.7 % (55/60) | 64.0 % | 49 % | 43.3 % |
| Correct among accepted | 61/80 = 76.3 % | 71.2 % | 45/47 = 95.7 % | 71.1 % | 38/62 = 61.3 % | 53.6 % |
| Median / p95 ms | 2.7 / 218 | 4.6 / 363.9 | 6.9 / 2896 | 5.7 / 2841.7 | 8.2 / 429.4 | 5.2 / 1070.1 |

Run 1's failure kinds (ranges as passage, `books` article/concept key, numbered-book abbreviations, context phrases, empty concept top 3,
one-chapter books) are what fixes (a)-(g) address; they are in the history of this file at `c4a0c9f9`.

## Known defects found by the final review, not fixed

Three reviewers read the final code after run 2. These defects are in the chain as measured; they are not fixed because changing the chain
after two test runs would tune against the held-out sets. They need a new held-out set to measure (follow-up C2.1).

- An ambiguous book alone ignores plain words, so "a name in a description" ("Jonah and the big fish") is accepted as a concept and never reaches fix (f). This explains failure kind 1 above, which was not diagnosed when it was written.
- N (fix f) is 1 with a strict `>`; the tune sets are flat, so it was never tested apart.
- Fix (f) applies to names only (entities), not to other ids.
- The search templates are built with real names from the question.
- Rule 7 picks the named entity by kind, not by position in the question.
- When two categories match, the first is taken.
- The card does not show the other sections of a concept or an article (spec part 5); it shows the default section, then the books.

## Known limits

- The sets were written by Claude subagents, not by translators; Abel did not review the Spanish set. Some expectations may be wrong.
- Run 2 is not independent of run 1 (above). Any further change needs a new test set to be measured.
- Times are desktop only (phone: C3/Servos). p95 is driven by a few slow paths (search fallback, en renderings), not by the median.
- Portuguese runs on the Spanish packs with no Portuguese map, so the pt numbers are not a Portuguese pack measurement.
- The targets were not met after the one fix round allowed by the plan.
