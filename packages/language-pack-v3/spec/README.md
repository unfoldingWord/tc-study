# Language packs, format 3: specification

Status: **phase 1 is implemented**: the TypeScript reader and builders (`packages/language-pack-v3`), an independent Python reader
(`spec/reader-py/`) and the frozen conformance cases (`tests/`). **Phase 2 part A is implemented** (the maps, `xmap`, `map`, section ids). **Phase 2 part B is implemented** (topics, people, places, events, stories, sections and relations: TIPNR, Theographic, English OBS and the tN outlines in `xtopics`; the language's names from its alignment and outlines in `topics`; two fixed queries). Phase 3 (signatures) is not, and nor are the images and the basemap.

Format 3 is the next major version of the tc-language-packs. Format 2.0 (`packages/language-pack`, parts per book)
keeps being published, frozen, until each app version that reads it has a retirement date. Format 3 keeps what 2.0
does and changes how it is stored: small columnar segments, a map that knows what every book holds before it is
downloaded, and ids that do not change between builds.

The design, the measurements behind it and the plan are in the proposal document ("tc-language-packs: contrapropuesta
para la próxima versión mayor", tabs Paquetes, Consumidores, Plan and Fase 0). Phase 0 measured it with real data:
es-419 Titus goes from 297 KB to 35 KB, English Psalms from 11.1 MB to 1.17 MB, and the common map plus the es-419
map weigh 0.73 MB.

Size: the common map (core and 66 parts) plus the language map (core and parts) must stay within 2 MB compressed
(2 097 152 bytes). The `concepts` table (1 195 ids on Titus, kind none) counts toward the `xmap` core. The sizes measured on the
phase 0 sample are understated for a full pack: the sample lacks 399 of 595 English parts, and tN and tWL for isa, 2ch, jer,
num, ecc, ezk and frt.

## Decisions this specification rests on

| Decision | Choice | Why (phase 0) |
| --- | --- | --- |
| Container | Columnar CBOR (RFC 8949), one document per segment | A SQLite file per book weighs twice as much (Psalms: 2.4 MB against 1.2 MB) |
| Compression | deflate-raw (RFC 1951), no dictionary | Native in browsers, Workers and Node; on a slow CPU it opens Psalms in 2.6 s against 4.0 s for zstd in JavaScript. zstd saved 8–23 %; a dictionary did not help |
| Identity | sha256 of the uncompressed body | Compression can change without changing a segment's identity |
| Schemas | CDDL (RFC 8610) | A reader in any language can check its input |

## The pieces

A language is published as a **catalog** and segments of seven classes. The original and the common map are the same
for every language and are published once.

| Class | What it holds | Scope |
| --- | --- | --- |
| `catalog` | Which segments exist, their ids, sizes and dependencies; the language's resources and their licenses; what each source covers | One language, one revision |
| `xmap` | Where every Strong number, concept and Academy article appears, book by book and verse by verse; topics and relations; what each source covers | All languages; a core plus one part per book |
| `xtopics` | The people, places, events, stories and sections of the Bible, each with the verses that mention it; their relations | All languages; a core plus one part per book |
| `topics` | What this language calls those topics, from its aligned text and outlines; topics only it has | One language; a core plus one part per book |
| `map` | Book names, concept and article titles, Academy subtitles, how many of this language's notes use each article, coverage | One language; a core plus one part per book |
| `book` | The bridge texts with their marks and alignment; notes, questions and word links with their quotes found in the original | One language, one book |
| `orig` | One row per word of the original: form, lemma, Strong, morphology; structure; optionally MACULA | One book of the UHB or UGNT |
| `art` | Word (tW) and Academy (tA) articles, in sections with stable ids | One language, one group of articles |
| `lex` | Lexicon entries for a range of Strong numbers | One language, one group |
| `obs` | Open Bible Stories with their frames, notes, questions, word links and study notes and questions | One language |
| `gen` | Reserved for text a model generated, with its provenance. Not built now | — |

Complements (question classifiers, vectors, number words) are not part of the format. They travel through the same
catalog with their own version, and no reader has to read them (`catalog.md`).

## Files

| File | What it fixes |
| --- | --- |
| [`container.md`](container.md) | The bytes of a segment file: magic number, header, body, compression, identity, errors |
| [`ids.md`](ids.md) | Books, verses, original word positions, pieces, sections and concepts |
| [`counts.md`](counts.md) | What each count in a map counts, and zero against "no source" |
| [`catalog.md`](catalog.md) | Revisions, units, dependencies, published against installed, signatures, complements |
| [`transfer.md`](transfer.md) | The file that carries segments by SD card, USB or Bluetooth |
| [`cddl/`](cddl/) | The schema of every class |
| [`tests/`](tests/README.md) | The conformance cases and what a reader must get from each |

## What phase 0 changed in the design

- **Book names** come from the language's own texts and, for books it has no text of, from a list of names per
  language (`map`, `books`, source `list`). es-419 has text of 6 books only.
- **Academy subtitles**, the question each article answers, go in the language map and in the article. The question
  chain needs them.
- **Articles travel in groups** (tW by category, tA by manual): one segment per article weighed 50 % more.
- **The lexicon** keeps today's shape in v1; a columnar version comes once it is measured.

## Open items

| Item | When |
| --- | --- |
| The transfer file's extension (`.tcpack` is a proposal) and the format's name | Abel decides before the builder publishes |
| Part B of phase 2: topics, people, places, events and relations (TIPNR, Theographic, OBS) in the common map | Done in phase 2 part B. Measured on the real sources: the common map (core and parts) plus the es-419 map and topics weigh 1 474 320 bytes compressed, within the 2 MB limit |
| Verse equivalences between a text's numbering and the original's (`map`, `numbering`) | A later version |
| MACULA and the lexicon in columns | A later version of their tables |
| `needs: "map"` in the units of a catalog was dangling until phase 2 built the `map` unit: done in phase 2 part A. A phase 1 catalog still cannot activate a book on a device that enforces it, so phase 1 catalogs are not published | Done |
| Signatures (`sig`): a reader ignores them today | Phase 3 |
| Two complement kinds, `images` (an image archive with an index: file, size, concepts, verse ranges and a credit per piece) and `basemap` (background layers with no place names; relief is a separate `basemap`; the app places the `lug:` points of the topics with the language's names). In the catalog: both in `complement.kind`, `license` for the whole set with each piece's license in the index, `lang` only when an image has text burned in, `for` names the `xmap` revision. No change to the maps or the units. Approved by Abel on 2026-11-02 | Specified in `catalog.md` and `catalog.cddl`; built later, now that part B of phase 2 is done, in the order Abel approved: the UBS animals and plants at 360 px by default and 600 px optional, then the OBS images, then our own basemap. Left out: images made by AI, Pixabay images whose origin cannot be verified, FIA images whose license is not confirmed, and Biblica's English maps |
| `ev:` concepts get no name from the alignment: the aligned text names people and places, not events; an event has its Theographic title and the language's outline | Open: a later version may add event names by a way that does not mistake a common word for a name. The names of people and places from the alignment are also noisy (a pronoun or a preposition can come glued to a name: `de Moab`); the rule of `topics.cddl` is kept as written |
| `tema:` ids are not built in part B; where their language name goes (the `names` of `topics` or of `map`) is not decided | When the builder's list of topics exists |
| The outline reader knows the headings `Outline` and `Esquema` only, and skips items that are a bare chapter range, a comma list or have no range (they go to the build report); `occurs-in` is by any overlap, so story lists are generous | A later version may add languages and forms of outline |
| The frozen case bytes include the deflate output of pako 2.1.0: a compressor upgrade needs `build-cases.ts --refreeze` (ids and reader outputs do not change) | When pako is upgraded |
| The MACULA trees are kept as published, under MACULA's own license | Before the common pack is published |
| A bridged article's section ids depend on the registry, and a bridge starts with an empty one: `ids.md` says so | Done in phase 2 part A |
| A view allocates its rows from a body within the byte limits; a cap on the rows is not set: the `ulen` rule of `container.md` bounds the rows | Done in phase 2 part A |
| The lexicon carries no `domains` rows in phase 1 | A later version of its tables |
| Lexicon `refs` stored as `[from, to]` pairs are larger than the source strings: a columnar version is planned | A later version of its tables |
| A bridged book names the original's stamp, so a device must have (or build) the matching `orig` segment: a bridged book needs `orig:` (`catalog.md`) | Done in phase 2 part A |
| One CBOR value with both an integer outside -(2^53 - 1) .. 2^53 - 1 and nesting deeper than 64: the TypeScript reader reports the first defect it meets reading the bytes in order, while the Python reader decodes the value and then checks the integer ranges in a second pass (so it gives `E_LIMIT`). No conformance case has such a file; a third reader may pick either until the specification fixes the order | A later minor version of the specification |

## Conformance

"MUST", "MUST NOT", "SHOULD" and "MAY" are used as in RFC 2119.

- A **reader** MUST:
  - check the container (`container.md`) and the schema of each class it reads;
  - give, for every case in `tests/`, the output written there.
- A **builder** MUST give the same bytes for the same inputs (deterministic CBOR, RFC 8949 §4.2.1, plus the rules in
  `container.md`). Building twice gives the same sha256.
- Two readers written apart (TypeScript in `packages/language-pack-v3`, Python in `spec/reader-py/`) give the same
  output for every case. That is what makes this a specification and not a description of one implementation.

## Versions

- The container has a major and a minor version (`container.md`).
  - A reader rejects a major version it does not know.
  - It reads a newer minor version and ignores the header keys it does not know.
- Each class has a schema version, and each table its own version and a required flag.
  - A reader that does not know a required table, or its version, does not open the segment.
  - An optional table it does not know is skipped, together with what depends on it (`container.md`).
