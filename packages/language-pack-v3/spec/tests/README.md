# Conformance cases

Every reader of format 3 MUST give, for each case, the output written here. The TypeScript reader and the Python reader
(`spec/reader-py/`) are written apart, and the two must agree on every case. A case is a folder with its file or files
and `expected.json`.

## Where the bytes come from

- **Container examples** (`container/`) come from `make_examples.py`, a small encoder kept apart from the builder.
  Status: written.
- **The other cases** are built in step 1.7 from the inputs described below. Their bytes are frozen once both readers
  give the expected output. From then on a builder change that alters them fails the tests, until someone decides the
  new bytes are right and freezes them again.

## Reader output

For a file it rejects, a reader prints `{"error": "<code>"}` with the code of `container.md`.

For a file it accepts, it prints a JSON object:

- **Always:**
  - `id`, the segment's id in lowercase hex;
  - `h`, the logical header as it is.
- **Then, by class, the tables decoded into rows:**
  - **`book`**:
    - `texts`: per text, `res` (the resource key), `pieces` (`[text, is word]`), `events` (`[position, "chapter" |
      "verse" | "open" | "close", argument]`) and, when the segment has it, `align` (per word, the list of original
      positions) and `alignMissing`.
    - `notes`, `questions` and `links`: per row, `id`, `ref` (its reference text), `from` and `to` (verse ids),
      `concept` when it has one, every column of `cols` by name, and `quote` (the original positions, `-1` for a word
      not found) when the segment has quotes.
  - **`orig`**:
    - `words` (per word, its `form`, `lemma`, `strong`, `morph` and other attributes);
    - `pieces` and `events`, as in a book text. A word's piece is its form.
  - **`art`, `lex`, `obs`**: as their schemas, with byte strings in hex. An OBS help row has `frame` (`"10:3"`) in
    place of `ref`.
  - **`map`, `xmap`**:
    - each counts table as `{"unit", "rows": {key: {book: [count, distinct verses]}}}`;
    - in a part, each verse list as `{key: [verse ids]}`;
    - `coverage` as `{source: {"whole": [books], "partial": [books]}}`.
  - **`catalog`**: as its schema, with ids in hex.
  - **A transfer file** (kind `02`, `transfer.md`):
    - `index`: the index as it is (`cddl/transfer.cddl`), with ids in lowercase hex;
    - `entries`: one object per index entry, in the index's order: `id` (hex), `kind`, `class` when the entry is a
      segment, and `status`:
      - `"ok"` when the whole entry is in the file and it verifies like a downloaded file (a segment as in
        `container.md`, a complement by the sha256 of its bytes);
      - `"missing"` when the file ends before the entry's end;
      - otherwise the error code the entry fails with (`E_ID`, `E_INFLATE`, ...);
    - `catalogs`: the reader output of each catalog entry (as for a segment file), in the order of the index's
      `catalogs`;
    - a file cut inside its index, or before the end of any catalog, is `{"error": "E_TRUNCATED"}`.

    Activating units is the app's job and is not part of the output: it also depends on what the device already has.

Keys are sorted, so that two readers' outputs can be compared as text.

## Cases

| # | Folder | What it checks | Input | Expected |
| --- | --- | --- | --- | --- |
| 1 | `container/minimal` | The container and the smallest valid book | Titus 1:1, "Pablo, siervo de Dios": one text, no helps | `minimal.expected.json` |
| 2 | `container/truncated` | A file cut short | `minimal.seg` without its last 10 bytes | `E_TRUNCATED` |
| 3 | `container/bad-id` | A wrong id | `minimal.seg` with its id changed | `E_ID` |
| 4 | `tito-es419` | A real book, whole | The es-419 Titus of the format 2.0 parts on staging (GLT, GST, tN, tQ, tWL) | GLT: 1 416 pieces, 953 words, all aligned, 69 events. GST: 3 075 pieces, 1 732 words, all aligned, 69 events. 216 notes (212 with quote), 36 questions, 223 links (223 with quote). Both readers give the same output |
| 5 | `nota-varios-versiculos` | A range | Titus 1:1-4 in one text; one note on `1:2-4` pointing to `ta:translate/figs-metaphor` | The note: `ref` "1:2-4", `from` 56001002, `to` 56001004. In the language map: 1 note, 3 distinct verses |
| 6 | `strong-repetido` | Counting occurrences against verses | An original verse where one Strong key appears three times | In the common map: 3 occurrences, 1 distinct verse |
| 7 | `seccion-insertada` | Section ids that last | An article built twice with the registry in between. The first time it has an intro, a definition and translation suggestions. The second time it has an examples section before the suggestions, and its definition heading is corrected | First build: `intro`, `definition`, `translation-suggestions`. Second build: `intro`, `definition`, `examples`, `translation-suggestions`, with the first three unchanged |
| 8 | `articulo-mal-titulado` | Articles that do not follow the pattern | An es-419 article with text before any heading, a heading no rule places, and a section whose heading is in English | `intro` with role `intro`; `s1` with role `unknown`; the English section with `lang` "en". Every section readable |
| 9 | `tabla-desconocida` | Tables a reader does not know | Case 1 with an extra optional table `future-x`, and again with an extra required table `future-y` | The first gives case 1's output plus nothing; the second gives `E_TABLE` |
| 10 | `transferencia-cortada` | A transfer file cut inside an entry | A `full` transfer file of cases 1 and 4 and their catalog, cut in the middle of case 4's segment | The catalog and case 1 have status `ok`; case 4 has status `missing` |
| 11 | `revisiones-mixtas` | Published against installed | Catalog and language map of revision 4, where Ruth has 15 notes on metaphor; Ruth's book segment of revision 3, where it had 14 | From the map: 15, "revision 4". From the installed book: 14 |
| 12 | `idioma-parcial` | Zero against no source | An es-419 map whose tN covers tit, rut, 3jn and jon | Use of `ta:translate/figs-metaphor` in Titus: the count. In Jonah with no such note: zero. In Isaiah: no source |
| 13 | `paquete-viejo` | The bridge from an old pack | `es-419-tit.langpack.zip`, format 1.1, with the originals from case 4 | The same book segment as case 4, with the same id; a local catalog (`origin` "local", unsigned) |

Cases 6, 11 and 12, and the map half of case 5, need the maps, so they are built in phase 2.

Phase 2 also adds the fixed queries of the common map, with the answers phase 0 measured:
- G5485;
- `tw:names/abraham`;
- the notes on metaphor by book;
- Isaiah;
- the key terms of Ruth.
