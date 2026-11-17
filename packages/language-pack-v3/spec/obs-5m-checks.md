# OBS Five Movements: build checks (draft, phase 0)

Status: draft for review. Nothing builds these tables yet. The tables are in `cddl/obs.cddl` ("DRAFT: OBS Five
Movements"). Measured against `unfoldingWord/en_obs-tf` v4 and `unfoldingWord/en_obs` v9 on 16 Nov 2026.

## Sources of truth

- The `obs` resource of the language owns the frames: their text, the story titles, the "A Bible story from" lines and
  the images.
- The OBS Theological Formation resource (OBS-TF) supplies only its own content, keyed by frame (story × 100 + frame).
  Every question is kept, also those that match OBS tQ.
- Frame text from OBS-TF goes in `tf-frames` only for a frame the `obs` resource lacks. It names its origin there.

## What the build reads

- Per story, the file `obs_story_{N}.md`. Its fixed headings give the parts: `## Introduction`, `### Open Bible Story:`,
  the frames (`######### NN-FF`), `## Biblical Interpretation…` (m1), `### Observation Questions`,
  `### Translation Questions`, `## Theological Dialogue…` (m2), `### Discourse Questions`, `### Theological Questions`,
  `## Personal Reflection…` (m3), `### Journal Reflection`.
- Transclusions `![[name]]` and `![[file#heading]]` from `transclusions/`. Each block is stored once in `tf-shared`.
  From the devotionals, only the sections that a story names, read from the unit files (`obs-devotionals-unit-N.md`),
  never from `obs-devotionals-master.md`.
- Not read: images (`![[imageN.jpeg]]`), `<!-- page break -->`, `transclusions/overview.md` only as the optional framing text of `tf-framework` (license cleared 2026-11-17),
  and the other transclusion files that no story names.
- A heading anchor matches the heading text exactly. Otherwise it matches with runs of white space collapsed, with a
  warning. It happens once in v4: story 9 names `…between the Flesh…`, and unit 5 has a double space there.

## Reviewed correspondence

The build reads frame labels through this table. A label the table does not cover must name a frame of `obs`, or a
frame that `obs` lacks and `tf-frames` supplies (the fallback, Checks 1 and 2).

| Story | Where | OBS-TF label | OBS frames | Why |
|---|---|---|---|---|
| 21 | Frame headers of the story text | `21-13` | 21-13 and 21-14 | The `21-14` header is missing, so the text of OBS 21-13 and 21-14 sits under one header |
| 21 | Frame headers of the story text | `21-14` | 21-15 | Same cause |
| 44 | Discourse question 2 | `43-03` | 44-03 | A typo in a list of story 44 frames (`43-03, 44-04, …`) |

Story 21 applies only to the frame headers of the story text. Its observation questions, translation terms and
discourse references use the OBS numbering (21-13, 21-14, 21-15) and need no correspondence. The terms prove it: under
the label `21-14` stand "raise the Messiah from the dead" and "to make the New Covenant", which are the words of OBS
21-14.

Frame lists are read with commas or spaces as separators, and with one-digit frames (`14-1`). Story 8 writes
`08-10 08-11` without a comma; stories 14 and 30 write one-digit frames. A reference the build corrected or wrote
differently keeps the published label in `refText` (for example `43-03, 44-04, …` on `44/m2/2`).

## Checks

Fail the build (an error):
1. A story's frame headers, after the correspondence, are not the frames of the `obs` story, in the same order. The
   exception is the approved fallback: a story or a frame that the `obs` resource lacks entirely goes in `tf-frames`
   with its origin, and is not a mismatch. A frame that `obs` has under another number is a mismatch, never a fallback.
2. A question, term or discourse reference names a frame that is neither in the `obs` story nor in `tf-frames`.
3. A transclusion names a file or heading that does not exist.
4. A heading that starts a part is unknown.

Warn (the build goes on and the report lists each one):
5. **Frame text.** Compare after normalizing quotes, dashes and white space. Report the count and the first difference
   per frame. v4 against v9: 62 frames with this normalization. The 07-10 typo «again., so» is one of them.
6. **Titles and references.** Compare the same way. v4: story 32 has «and» where OBS has «&», story 34 has
   «13:18-21;18:9-14» and story 36 has «Luke9:28-36».
7. **A missing part or list.** v4: story 33 has no drafting transclusion and no Personal Reflection (m3). Story 14 has
   an m3 heading but no Journal Reflection.
8. **A term not found in its frame** (after normalizing). It is a hint only, not proof. v4: 11 terms. Each one matches
   its own frame better than any other, so none comes from a wrong frame. Most are ellipses or paraphrases («the older
   son...the younger son»); some are transcription slips worth reporting upstream: `38:8/4` repeats «all the sheep», and
   `48:9/1` runs two clauses together.
9. **Versions.** The catalog lists both releases (`obs` v9, `obs-tf` v4). Warn when the `obs` release is newer than the
   `obs` version that OBS-TF's manifest gives as its source (`source: obs en 9`). Note that the manifest of the v4
   release says `version: '3'`.

## Results on v4

- 50 stories, 796 part rows, 2044 questions (1505 observation, 187 discourse, 157 theology, 195 journal), 1565 terms, and
  55 shared blocks: checking, M4, M5 and the conclusion in all 50 stories, drafting in 49 (not story 33), and 50
  devotional sections.
- With the correspondence above: no errors, and the warnings listed in 5–8.
