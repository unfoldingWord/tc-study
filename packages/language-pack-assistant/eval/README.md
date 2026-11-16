# Evaluation of the assistant

The harness runs the chain over question sets against the real staging packs. Node and Bun only; nothing here is imported by `src/`.
The network is opt-in (`LP3_STAGING=1`), GET requests only and only to the staging URL: production is never touched. Packs are
cached in `C:\Users\LENOVO\Git\Github\wt\lp3-c2-cache` (`LP3_CACHE` overrides it), outside the repo. The search index is a SQLite
file there (the client's `sqlIndex` over `bun:sqlite`, as an app on a device keeps it): the memory index over all the English books
does not fit in memory (R30).

## Commands

- `LP3_STAGING=1 bun eval/packs.ts <lang>`: refresh and install the packs of `es-419` or `en`; prints the report.
- `LP3_STAGING=1 bun eval/run.ts --lang <es|pt|en> --set <tune|test|test2>`: runs the assistant (`createAssistant` with the committed
  complements) and writes `eval/results/<lang>-<set>.json`: a `summary` row and, per question, the decision, its interpretation,
  the ids of the top 3 pieces, the score and the card time in ms. `--set test2` is refused unless `LP3_GATE=1` (the held-out sets are
  run once).
- `bun eval/check-ids.ts` (with `--lang es-419|en`): checks that the ids the question sets expect exist in the packs. It prints
  failures only; it does not score.
- `LP3_STAGING=1 bun eval/tune.ts [--margins 0,0.1,...] [--misses <file>]`: the chain alone over the tune sets, for several margins.

es and pt are asked of the `es-419` reader (pt has no pack of its own yet; its tag is `pt-BR`).

## Question sets

`questions/*-tune.jsonl` (100 questions in es and pt, 60 in en) are for tuning; `questions/*-test.jsonl` (150) are held out and frozen (see
`questions/README.md`). A change to a test set needs a commit of its own, `eval: refreeze <lang> test set`. The tune sets have no
expected pieces, so `top3` is measured on the test sets only.

## Scoring (`score.ts`)

- calls correct: the decision's call equals the expected call (a `choose` is right when it holds the expected call; a `search` call
  is right for an expected `search`); for an expected `choose`, the options must be the same set.
- accepted (R28): a `call` decided by a rule or the classifier. The search fallback is the chain not deciding, so it is not
  accepted. The summary also gives the numbers counting the fallback as accepted (`acceptedWithSearch`).
- top 3: the first expected piece is among the first three pieces of the card, ids compared in canonical form (R29), over the
  questions that have expected pieces.
- card time: warm (the assistant is created and one question asked first), with the SQL index; median, p95 and the number of cards
  over 300 ms.
- decisions per step: rule, classifier, choose, search fallback.

## Known gaps in the data

- The staging `es-419` map names only 5 of 66 books (R24); the pipeline takes `--book-names` but no list was given. Questions about
  other books by name do not resolve and go to search; the es numbers understate the chain.
- Portuguese has no map: it is read against `es-419` with the Portuguese lexicon, so Portuguese concept names rely on the
  complements and stems.
- Some searches and renderings of very frequent Strong keys (G5485 among them) are slow on `en`: see the card time p95.
