# Gate results on the held-out sets

One run per test set, no change to any rule, phrase, template, margin or question after seeing a result. No run crashed, so none was repeated.
Result files: `eval/results/{es,en,pt}-test.json` (every question, decision, interpretation, top 3 piece ids, score, card time).

## What was measured

| | |
|---|---|
| Test sets frozen at | `df7a79bb` ("eval: question sets, frozen before tuning"), unchanged since |
| Commit measured | `a4c92b07` (HEAD of `feat/language-pack-assistant` when the runs started; the results commit follows it) |
| Date | 2026-11-15 |
| Machine | Windows 11 desktop, Bun 1.3.3, SQL index (`bun:sqlite`, R30), warm (R34) |
| Staging catalog revisions | `es-419` revision 5, `en` revision 5, `common` revision 2 (staging URL of `eval/packs.ts`, signed by key `78d2e6299a2de4d0`) |
| Portuguese | no pack of its own: the `es-419` reader answers `pt-BR` questions (reported only, not counted) |
| Questions | written by Claude subagents; Abel did not review the Spanish set and asked for it to be measured as frozen |

## The gate (test sets)

n = 150 per language. "Accepted" means decided by a rule or the classifier (R28); "with search" also counts the search fallback.

| Target | es | en | pt (reported only) |
|---|---|---|---|
| Calls correct (>= 90 %) | 90/150 = 60.0 % **FAIL** | 96/150 = 64.0 % **FAIL** | 65/150 = 43.3 % |
| Correct among accepted (>= 98 %) | 74/104 = 71.2 % **FAIL** (with search 76/114 = 66.7 %) | 81/114 = 71.1 % **FAIL** (with search 85/118 = 72.0 %) | 45/84 = 53.6 % (with search 53/120 = 44.2 %) |
| Accepted | 104 (114 with search) | 114 (118 with search) | 84 (120 with search) |
| Expected piece in first 3 (>= 80 %) | 77/126 = 61.1 % **FAIL** | 78/135 = 57.8 % **FAIL** | 47/105 = 44.8 % |
| Card time median (< 300 ms) | 4.6 ms **pass** | 5.7 ms **pass** | 5.2 ms |
| Card time p95 (< 300 ms) | 363.9 ms **FAIL** (9 over 300 ms) | 2841.7 ms **FAIL** (24 over 300 ms) | 1070.1 ms (16 over 300 ms) |

Result: the gate fails for es and en on every target except the median card time.

## The tune numbers next to them

| | es tune (n=100) | es test | en tune (n=60) | en test | pt tune (n=100) | pt test |
|---|---|---|---|---|---|---|
| Calls correct | 76 % | 60.0 % | 91.7 % (55/60) | 64.0 % | 49 % | 43.3 % |
| Correct among accepted | 61/80 = 76.3 % | 71.2 % | 45/47 = 95.7 % | 71.1 % | 38/62 = 61.3 % | 53.6 % |
| Top 3 | not scored (tune sets carry no pieces) | 61.1 % | not scored | 57.8 % | not scored | 44.8 % |
| Median / p95 ms | 2.7 / 218 | 4.6 / 363.9 | 6.9 / 2896 | 5.7 / 2841.7 | 8.2 / 429.4 | 5.2 / 1070.1 |

The drop from tune to test is large (en 91.7 % to 64.0 %): the rules and the classifier were fitted to the tune questions, and the test questions contain kinds the tune set did not (see below).

## Which step decided each question

| | rule | classifier | choose | search fallback |
|---|---|---|---|---|
| es test | 87 | 17 | 36 | 10 |
| en test | 94 | 20 | 32 | 4 |
| pt test | 64 | 20 | 30 | 36 |

## Most common failure kinds (es and en together, 300 questions)

Counts are es + en. A question can appear in more than one kind (a wrong call usually also misses the top 3). Read from the result files.

1. **Descriptive questions that should go to search are answered by the classifier with a concept (18; es 9, en 9).** "Jonah and the big fish" -> `concept tw:names/jonah`; "ninivitas cilicio" -> `concept tw:names/nineveh`. The classifier is over-confident on a name inside a free description.
2. **Descriptive questions that should go to search end in a choose card (17; es 9, en 8).** "prodigal son" -> choose between `tw:kt/sonofgod` and others; "la planta de Jonás" -> choose including `jon front:intro`.
3. **Top 3 missed because the wrong call returned nothing relevant (33 of them are expected-search questions: es 17, en 16).** "good Samaritan": top 3 empty. Follows from kinds 1 and 2. Other wrong-call top-3 misses are `books` questions ("donde se habla de la fe", "which books speak of baptism"; es 6, en 5) and passage questions whose reference did not parse (kind 8).
4. **Passage ranges: top 3 holds the range piece, the question lists the first-verse piece (17; es 7, en 10; the call is correct).** "Jonás 3:5-10": top 3 has `verse:glt jon 3:5-10`, the question expects `verse:glt jon 3:5`. This looks like a mismatch between the test expectation and the reader's piece id, not a wrong answer. Not changed (frozen).
5. **`books` called with `article` where the question expects `concept` (es 6, en 5 + 3 = 14).** "which books talk about grace" -> `books {article: tw:kt/grace}`, expected `{concept: tw:kt/grace}`. The id is right; the argument key differs. Part of these may be a scorer strictness issue; not changed. In en, 3 more questions about a `ta:` article ("where do rhetorical questions show up") were answered with `article` instead of `books`.
6. **A choose card where one call was expected (14; es 6, en 8).** "sabbath", "who was Deborah the judge" (en), "¿en qué libros se menciona a los apóstoles?" (es): the margin did not let one reading win.
7. **Slow cards (es 9, en 24 over 300 ms).** en `renderings` for Strong numbers: "how is G5485 rendered in the ULT" 9233 ms, "H2617 how is it translated" 5889 ms (10 questions): the renderings in the en packs are slow (data gap, known). en search: "1 Cor 13:4-7" 6219 ms (8): the fallback to search on a reference that was not parsed. es: "donde hay informacion implicita" 752 ms; "lista de personas y lugares de Nehemías" 579 ms (`topics`).
8. **A reference that did not parse falls to search (es 4, en 5).** "Nehemías 1:1" and "3 Juan 1:3" (es), "1 Cor 13:4-7" and "2 Tim 3:16" (en). In es this follows the es-419 map naming only 5 of 66 books (R24). In en the abbreviation of a numbered book is not recognized by the rules (not a data gap; cause not confirmed further). pt has the same problem in 16 questions ("Neemias 1:1", "3 João 4"): there is no Portuguese map.
9. **Context asked, passage returned (6; es 3, en 3).** "Tito 1:12 en su contexto", "background for Acts 15:1-11": no rule or phrase maps these to `context`.
10. **Concept top 3 empty although the call was correct (7; es 2, en 5).** "¿qué es un apóstol?", "what does gospel mean": the call is `concept` on the right id but the top 3 holds no piece. Cause not confirmed from the result file alone.

Below the top 10: `topics` asked for a book but answered with `category` (es 2, en 2: the classifier does not read the book), "3 Jn 4" read as chapter 4 of a one-chapter book (es 2), `article` top 3 showing another section of the right article (en 3, and one "strategies" section not requested).

Data gaps named as causes: es-419 map names 5 of 66 books (R24, kind 8); no Portuguese map (the pt reference failures); slow renderings in en (kind 7).

## Known limits

- The sets were written by Claude subagents, not by translators; Abel did not review the Spanish set. Some expectations may be wrong (kinds 4 and 5 in particular).
- The classifier decides few questions (17 es, 20 en, 20 pt of 150) and is often wrong on the free-description questions (kind 1).
- Times are desktop only (phone: C3/Servos). p95 is driven by a few slow paths (search fallback, en renderings), not by the median.
- Portuguese runs on the Spanish packs with no Portuguese map, so the pt numbers are not a Portuguese pack measurement.
- The targets were not met and nothing was changed after the run; any fix is a new task, tuned on the tune sets only, and measuring it would need a new test set.
