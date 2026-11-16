# OBS real runs (2026-11-15)

Real Door43 data, `--no-upload`, on branch `feat/packs-obs` (rebased on `origin/master` b66ed861). MACULA is a fresh `taller` clone
with `core.autocrlf=false`; `--lexicons-ref master`; topic sources from `fetch-topic-sources`.

## Method, and why it is cut down

A full `publish-language --parts` is too slow here: Genesis alone took 939 s (800 jobs), so the 66 books would take about 6 hours
per language (machine under load: 0.5 GB free RAM, other sessions running tests). The `obs` unit is built before the books, so each
language was built with OBS on and **only one book** (`rut`; `gen,rut` for en, to get the chapter lengths the passage queries need),
by a temporary one-line change to the book loop of `buildLanguageParts.ts` (a filter on an env var `LP3_BOOKS`), reverted and never
committed. The OBS unit is the same code and the same inputs as in a full run. What this does not measure: full-run time and peak
memory (the obs unit's own numbers are below), and the originals report `ugnt: no parts` (expected, rut is Old Testament).
Then `build-v3 --topics --aligned` of each output (id needs `--books rut`, its Bible text is not aligned so the default book list
of its list file is not what the originals have).

## Picks, counts and size (Done-when check)

All picks match the plan's design table (en all `unfoldingWord`; es-419 all `es-419_gl`; id all `bahtraku`; hi stories, notes and
questions from `Door43-Catalog` at the versions Task 3 checked, no TWL in the catalog; ar stories only).

| Language | Picks | Stories | Notes | Questions | TWL links | obs unit (units.json bytes) | obs unit step (time; peak memory of the whole process, not of the obs step) | vs 3 MB |
|---|---|--:|--:|--:|--:|--:|---|---|
| en | unfoldingWord obs v9, tn v13, tq v10, twl v3 | 50 | 2267 | 672 | 2381 | 223,292 (218 KB) | 27 s, 890 MB peak of the process | 7% |
| es-419 | es-419_gl obs, tn, tq, twl (all v2) | 50 | 2267 | 672 | 2542 | 246,459 (241 KB) | 27 s, 1086 MB peak of the process | 8% |
| hi | Door43-Catalog obs v8.3, tn v11.2, tq v8.2; no twl | 50 | 2325 (markdown) | 672 (markdown) | 0 (none in catalog) | 287,929 (281 KB) | 20 s, 1046 MB peak of the process | 9% |
| ar | OBS-Aquifer ar_obs v1; no tn, tq, twl | 50 | none | none | none | 61,192 (60 KB) | 4.5 s, 1124 MB peak of the process | 2% |
| id | bahtraku obs v6, tn v2.7, tq v2.3, twl v2.1 | 50 | 2266 | 670 | 2381 | 232,320 (227 KB) | 29 s, 1108 MB peak of the process | 7% |

- The threshold is 3 MB per language (ruling R2, text + TN + TQ, no images). Every language is far under it: the largest is hi at 281 KB.
  Sizes are the bytes `units.json` records for the `obs` unit (the compressed segment).
- hi: the markdown to rows converter logged no issue lines (`lastIssues` empty: nothing was skipped) and made 2325 notes and 672
  questions. ar: no `notes` table, so counts over it are `none`, not 0.
- en passage ties: without Bible books the build said `no last verse for gen N` for story ranges; with `gen` built the ranges exist (below).

## OBS off is unchanged (local compare)

The Actions workflow cannot run from the branch, so one real book was compared locally: `es-419`, book `tit`, OBS off, built with the
same inputs and the same MACULA folder on this branch and on `origin/master` (b66ed861, a temporary worktree, removed afterwards).
`list.json` compared part by part (key = kind, resource, book, group, layers) on `sha256`:

| List | Parts (branch / master) | sha256 mismatches | Fingerprint differences | In one only |
|---|--:|--:|--:|--:|
| es-419 | 58 / 58 | 0 | 58 | 0 |
| originals | 67 / 67 | 0 | 67 | 0 |

Same bytes in every part; only the fingerprints differ, as the code constant changed (Task 4 ruling). Both runs exit 1 only for
`unfoldingWord/hbo/uhb: no parts` (not the book asked for).

## Queries on the en build (books gen and rut, no other Bible books)

Folder `C:/Users/LENOVO/Git/Github/wt/lp3-obs-runs/en-v3/`, layout `v3/catalog/{common,en}.seg` and `v3/seg/<id>.seg` (34 segments;
what `publish-v3` puts under the bucket's `v3/` prefix), unsigned. Serve as a static folder from that directory
(`python -m http.server <port>` or `bunx serve`); the client's `httpSource({ base })` takes the folder URL. The queries ran through
`openFromSegments` on that folder.

| Query | Answer |
|---|---|
| `stories('gen 1')` | 2 stories (the design's "Done when" expected stories 1 and 2; story 2 is Genesis 3, so the expectation changed to 1 and 48): 1 "1. The Creation" (gen 1:1-2:25) and 48 "48. Jesus Is the Promised Messiah" (gen 1:1-3:24, 6, 14, 22, heb …) |
| `story(1)` | title "1. The Creation", 16 frames, 90 notes, 22 questions, 35 links |
| `search('1. The Creation')` | 4 hits: a `title` hit in `obs` 01:0, and 3 TN notes of Genesis |
| `concept('tw:kt/god')` | `obs.stories` has 45 stories (story 1 frames 01:01-01:16 …) |
| `books({article:'ta:translate/figs-metaphor'})` | gen 26 notes / 26 verses, rut 15 / 14; `obs` cell count 28, installed; `notInstalled` empty |

Missing in this folder: all Bible books but gen and rut. Queries that need the other books show them as not installed.
Time of the en run with gen: 1441 s (gen 925 s).

## Notes for the supervisor

- Size to Abel: by the R2 threshold (3 MB) `obs` fits for all five languages (largest 281 KB), so adding `obs` to the default units is
  within the rule; the decision stays with the supervisor and Abel.
- Not measured here: whole-language time and memory with OBS on; the workflow run does that.

## Evidence limits

- One book per language (`rut`; `gen` and `rut` for en), through an uncommitted temporary book filter.
- The OBS-off compare is one book (`tit`) of es-419; fingerprints differ on every part, as the Task 4 ruling expects.
- The data is unsigned.
- Whole-language time and memory were not measured.
- The page check ran a modified copy of the page (`trust: {}`, no stylesheet) against the en folder only.

## Staging note

The OBS code-version constant moves every unit's fingerprint, so the first publish after the merge rebuilds all units (about 6 h
per language here). Plan the staging timing for that.
