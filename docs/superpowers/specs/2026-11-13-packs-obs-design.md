# Open Bible Stories in the language packs (format 3) — design

Task T-071. Asked by Abel on 2026-11-13. Claude writes the code under the format 3 exception: no Cursor, Codex may
review read-only. Shared work (unfoldingWord and Idiomas Puentes); the code lives in `unfoldingWord/tc-study`.

## Why

A translator who opens a passage or searches for words should also meet the Open Bible Stories that tell it. For
example:

- Genesis 1 should show the stories that tell Genesis 1;
- a search for "creation" should find the story titled "The Creation";
- a key term, an Academy article or a person should lead to the stories and frames that use them.

Format 3 already has an OBS segment, but no published pack carries it. Since 2026-10-24 the parts build refuses OBS
(`OBS_PARTS_REFUSED`), because the OBS loader fetches each story from Door43 over the network instead of reading the
zip that the build downloads and fingerprints.

Every app that reads format 3 gets this through the shared library: Servos, tC Study, the MCP, BT Servant Mini and the
try page. The try page is where it is shown and checked first. Each app decides later how to present it.

## Goals

1. **The packs carry OBS.** These are the languages that already have a Bible pack (en, es-419, hi, ar, id, and any
   other language the workflow publishes). The pack takes the stories and, when the language has them, their
   Translation Notes, Translation Questions and Translation Words Links.
2. **Passage → stories.** Asking for a passage returns the stories whose Bible references overlap it, with their titles
   in the pack's language. This works even when the OBS segment is not installed.
3. **Free search → stories.** Search finds story titles. It also finds the text of the frames, and the notes and
   questions of OBS.
4. **Key term → frames.** A `tw:` id returns the stories and frames whose OBS TWL links it.
5. **Academy article → OBS notes.** A `ta:` id returns the OBS notes whose SupportReference is that article, counted by
   story.
6. **Person, place or event → stories.** The topics that name a person, place or event return the stories that
   mention them.
7. **A whole story.** One query returns a story with:
   - its frames;
   - its notes, questions and key terms per frame;
   - the Bible passages it tells.
8. **The assistant (C2)** can answer from the OBS questions. This is coordinated with the C2 session; see "Left to the
   builder".

## Non-goals

- **Languages that have OBS and no Bible pack** are not packed (Abel, 2026-11-13).
- **No change to how the Bible books build.** With OBS off, every language gives the same parts as today.
- **No images.** OBS illustrations are a separate complement (the `images` kind), later.
- **No OBS counts in the maps** (approach B) unless the size measurement asks for it.
- **App screens** (Servos, tC Study, Mini) are not part of this work, beyond the try page.

## Anti-goals

- A pack whose OBS rows come from a network fetch instead of the fingerprinted zip.
- A language with only the stories that shows empty notes as if they were "zero": missing resources must read as
  "none", following `counts.md`.
- Story titles or text taken from a different owner than the language's Bible pack, without saying so.

## Constraints and decisions

- **Which resources.** For each language with a Bible pack, take the OBS of the **same owner as that pack's Bible**.
  When that owner has no OBS, take the Door43 catalog's `prod` OBS for the language and record the owner in the report.
  (This is Claude's proposal. Abel did not object.)
  - The OBS helps (TN, TQ, TWL, and SN/SQ if they exist) do not require the `tc-ready` topic (Abel's rule of
    2026-10-29, T-034).
  - The OBS text follows the same rule as the Bible text.
- **Old formats are converted.** Some languages publish OBS notes and questions in the old markdown form instead of TSV
  (hi: `hi_obs-tn`, `hi_obs-tq`). The pipeline converts them to the same rows as the TSV form, keyed `story:frame`
  (Abel, 2026-11-13).
- **Missing helps are left out.** A language without OBS notes, questions or TWL packs the stories alone (ar today).
  The segment simply has no such table (Abel, 2026-11-13).
- **Read from the zip.** The OBS loader reads the stories and helps from the repository zip that the parts build
  downloads and fingerprints, like the other shared resources. The rows keep their current shape (`obs:{res}:{NN}`,
  `content.frames`, helps keyed `story:frame`), so `extractObs` needs no change.
- **The workflow.** `.github/workflows/language-packs.yml` gets an `obs` input that is passed to `publish-language`. It
  stays off by default until a measured staging run proves it; then Abel decides whether to turn it on.
- **Download.** The OBS segment is downloaded by default with the language, if its measured size allows it. The design
  proposes a ceiling of about 300 KB per language for that. Over the ceiling, it becomes an optional unit, and
  approach B may be revisited.
- **Spec.** OBS is already specified (`spec/cddl/obs.cddl`, `read/obs.ts`). Only the client queries and the search
  rows are new. They go into the client's `schemas.json` like the other queries.

Current Door43 availability (2026-11-13, `prod`):

| Language | Stories | Notes | Questions | TWL |
|---|---|---|---|---|
| en | `unfoldingWord/en_obs` | `en_obs-tn` | `en_obs-tq` | `en_obs-twl` |
| es-419 | `es-419_gl/es-419_obs` (also BSA) | `es-419_gl/es-419_obs-tn` (TSV) | `es-419_gl/es-419_obs-tq` | `es-419_gl/es-419_obs-twl` |
| id | `bahtraku/id_obs` | `id_obs-tn` | `id_obs-tq` | `id_obs-twl` |
| hi | `Door43-Catalog/hi_obs` | `hi_obs-tn` (markdown) | `hi_obs-tq` (markdown) | — |
| ar | `OBS-Aquifer/ar_obs` | — | — | — |

## Approaches

| | What | Trade-off |
|---|---|---|
| **A (chosen)** | The pipeline fills the existing OBS segment, and the library adds queries over the data that already exists. Passage → stories uses the topics module's story ranges (`xtopics` `obs`), which are language-independent and present without the OBS segment. Counting needs the OBS segment installed. | No format change. Most of the value. |
| B | Also add OBS notes and TWL counts to `map` and `xmap`, so they can be counted without the OBS segment. | Changes the spec, both readers and the conformance cases. Only worth it if OBS is too big to download by default. |
| C | A now, B only if the measurement asks for it. | — |

Abel chose to follow the recommendation: **A, with C as the way out.**

## How it is decided to work

1. **Pipeline** (`packages/resource-pipeline`):
   - The OBS loader reads the zip.
   - The markdown helps are converted.
   - The refusals are removed: `OBS_PARTS_REFUSED`, and the `--parts --obs` refusal in `publish-language.ts`.
   - The workflow gets its `obs` input.
2. **Format 3 build** (`packages/language-pack-v3`): `buildLanguage` already calls `extractObs`. The catalog gets the
   `obs` unit with its `needs`. Check that the topics module's `obs` names come from the language's story titles.
3. **Library** (`packages/language-pack-client`), with new queries or extended ones:
   - `passage` (or a new `stories` query) adds the stories that overlap the passage, with id, title and ranges;
   - `search` indexes OBS rows: titles, frame text, notes and questions, with `kind` and `ref` `NN:FF`;
   - `books`/`concept` for `tw:`, `ta:`, `per:`/`lug:`/`ev:` add the OBS stories and frames;
   - `story(n)` returns the whole story.
4. **Try page** (unfoldingWord/tc-language-packs): shows the stories under a passage, in search results and for a
   concept.

## Done when

- A `no-upload` build of en and es-419 with OBS on produces the OBS segment, with the expected counts:
  - en: 50 stories, with notes, questions and TWL;
  - es-419: the same, from `es-419_gl`;
  - hi: stories, with notes and questions converted from markdown;
  - ar: stories only.
- With OBS off, every Bible build is unchanged (shown with the existing tests and one `no-upload` run).
- These queries work against a local build, with tests:
  - "Genesis 1" lists stories 1 and 2;
  - a search for the title of story 1 finds it;
  - `tw:kt/god` lists OBS frames;
  - `ta:translate/figs-metaphor` counts OBS notes.
- The measured size of the OBS segment per language, and the decision on default download.
- Published to staging and verified with `verify-v3`, only with Abel's yes.
- The try page shows it, deployed only with Abel's yes.

## Calls made after the builder check (Claude's, for Abel to check)

1. **Story titles without the OBS segment.** They come from the language's `topics` unit: `topics.ts` already names
   `obs:{n}` with the language's story title when the build has the stories. Now that the build reads OBS, those names
   get filled. A story that has no title in the language shows "Story N". The common `xtopics` keeps only the ranges.
2. **OBS is its own unit,** not part of the shared unit with TW and TA. Turning OBS on then does not change the
   fingerprints or the downloads of TW and TA, which keeps "the Bible builds are unchanged" true. The catalog gets an
   `obs` unit for the language; its `needs` are the language's map, so that its concepts resolve.
3. **Which version is zipped:** the same rule as the other resources of the pipeline, which is the Door43 catalog's
   `prod` release of each repository. Helps without the `tc-ready` topic still need a `prod` release. The report records
   the owner, repository and tag of each OBS resource.
4. **Person, place or event → stories:** a story is listed when its Bible ranges overlap the verses of the topic. It
   needs no new data and works without the OBS segment. Key terms (`tw:`), names included, also list the frames whose
   OBS TWL links them, which does need the segment.
5. **When the OBS segment is not installed,** the queries answer the same way as the other queries: what the maps and
   topics know (stories by passage, titles), plus `notInstalled` with the `obs` unit and its size. They never answer
   "zero" for counts they could not read (`counts.md`).
6. **Missing versus failed.** A resource that Door43's catalog does not list is left out, and the report says so. A
   resource that the catalog lists but that fails to download or parse fails the build, like any other resource.
7. **The size ceiling** is measured on the compressed OBS segment of each language. The build only reports it. Whether
   OBS downloads by default is set in the catalog after Abel sees the numbers.
8. **The other sessions.** C2 and C5 change `packages/language-pack-client` in other worktrees. This work rebases onto
   `master` after they merge, keeps its client changes small, and announces new query fields to both sessions.
   `schemas.json` gets the new entries; the package has no version number to bump.

## Left to the builder

- The exact names and shapes of the new query fields, following the existing envelope (`Answer<T>`, `cites`,
  `notInstalled`).
- How the markdown OBS notes and questions map to rows (one row per `#` heading or per frame file). Record the rule.
- Whether `passage` grows a field or a separate `stories` query is cleaner.
- How the OBS search rows share the search index with book rows (`book: 'obs'`).
- Coordination with the C2 session (assistant) and the C5 session (tC Study), which change the same library in other
  worktrees. Changes to `packages/language-pack-client` are kept small and announced to them.
