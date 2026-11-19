# Aquifer patches, Spanish and Indonesian, and the Hindi recheck (2026-11-19)

Built locally from GitHub BibleAquifer (UWTranslationNotes@603546cd for `spa` and `ind`; UWTranslationManual@1c3178fa `ind` and `eng`), en_ta v91 titles, Door43 production book lists (`door43-books.ts`) and the staging common catalog (revision 6, f5a764bd…). Signed with the staging key (78d2e6299a2de4d0). Measured against the published staging packs (`es-419` rev 10, `id`, `hi` rev 7). **Not uploaded.**

## What changed in the code

- `build-patch-v3`, `aquifer-measure`: `--lang` takes a tag with a region (`es-419`, `pt-br`), as `spec/catalog.md` already allows; a private-use subtag is still refused.
- `build-patch-v3`: `--tq` is optional (Aquifer has no Spanish questions) and so is `--ta`. Without `--ta` the Manual is taken from the notes' own `associations.resource` (`taFromNotes`): their `content_id`, the `reference_id` of the English twin and the label. Aquifer publishes no Spanish Manual, but every Manual link in the Spanish notes (126 distinct) is in those associations, 111 with an English twin. `--ta-eng` and `--en-ta-titles` are still needed (the English twin and its Door43 title).

## es-419-x-aquifer (revision 1)

- Notes of 24 books, 20,448 rows (exo lev jdg est job pro jol nam mal mat mrk luk jhn act rom col 1th 2th 1ti 2ti phm jas 1jn jud); Door43 has gen rut jon tit 3jn. No questions (Aquifer has none in Spanish). Book introductions travel inside the notes as introduction rows; the Open Study Notes book introductions are **not** in this patch (a new source and row kind, left for later).
- Translation Academy links: 98.4 % resolved (18,967 inline `[[ta:…]]`, 314 left as text); 94.0 % of the notes carry a resolved `concept`.
- Empty answers in the same 30 references as the Hindi pilot: 28 before, 25 after, as a minimum (the base reader here is the real `es-419` rev 10). Most of the 25 are verses with no note in a patched book, or books Aquifer has no notes for.
- Both readers (TypeScript and Python) agree on the 25 files. 20 notes read by hand: concepts and links name the article each note is about; an empty bold quote `**""**` shows where a note has no quote (as in Hindi).

## id-x-aquifer (revision 1)

- Notes of 7 books, 5,401 rows (mat mrk luk jhn act 2co gal), same code, with the real Indonesian Manual. Questions: Aquifer's 9 books are the 9 Door43 already has, so none.
- Translation Academy links: 96.1 % resolved (4,881 inline, 198 left as text).
- Empty answers: 26 before, 24 after (minimum). Both readers agree on the 8 files.

## hi-x-aquifer, checked against `hi` rev 7 and common rev 6

- The revision 1 on staging **does not fit any more**: it pins common revision 2, and the client leaves every `hi-x-aquifer/book:*` waiting for `orig:*` (no notes come back).
- Rebuilt with `--published` (revision 2, common revision 6): the 65 segments are byte-identical (same ids), only the catalog changes. Both readers agree on the 66 files. The client installs `hi` and `hi-x-aquifer` together; Door43 wins where it has data (Acts: 5 notes, none from the patch); the patch fills Titus, Ruth, Genesis, Matthew, Jonah. Translation Academy links 98.9 %, as before.
- Same 30 references: 14 before, 6 after (minimum; php 2:23 is the sixth, a verse of a book Door43 has questions for but not for that verse).
- To publish: only the catalog of revision 2 (`catalog-hi-x-aquifer.seg`) needs uploading.

## Commands

As in `docs/aquifer/hi-pilot-2026-11-16.md`; for es-419:

```
bun packages/resource-pipeline/cli/fetch-aquifer.ts --repo UWTranslationNotes --lang spa --commit 603546cd949d694d42d2b85dc0e37fdacb20407f --out <dir>/tn
bun packages/resource-pipeline/cli/door43-books.ts --lang es-419 --out <dir>/base-books.json
bun packages/resource-pipeline/cli/build-patch-v3.ts --lang es-419 --source aquifer --tn <dir>/tn --ta-eng <dir>/ta-eng \
  --en-ta-titles <dir>/en-ta-titles.json --base-books <dir>/base-books.json --common <staging URL> --published <staging URL> --out <dir>/out --sign-key <staging.pem>
```
