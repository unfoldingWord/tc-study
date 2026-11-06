# @bt-synergy/language-pack-v3

Builders and readers for language packs format 3: the segment files and the transfer file that carry a language's
texts, notes, alignments and lexical data in a compact, deterministic container. The format is defined in
[`spec/`](./spec/README.md); start there, and see `spec/container.md` for the byte layout and the column encodings
this package's `src/codec/columns.ts` implements.

**License.** The sample data in `spec/tests/data/`, the case outputs `spec/tests/**/*.expected.json` and `src/build/lex.uhl-rows.fixture.json` carry
CC BY-SA 4.0 text of unfoldingWord resources (see `spec/tests/data/README.md`); the package's own license does not cover them.
