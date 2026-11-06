# lp3read: the Python reader of format 3

An independent reader of language pack format 3, **written from the specification alone** (`../README.md`,
`../container.md`, `../ids.md`, `../catalog.md`, `../transfer.md`, `../cddl/` and `../tests/README.md`). It was
written without looking at the TypeScript reader in `packages/language-pack-v3/src/`, so that the two can be compared:
where they differ on a file, one of them misreads the specification, or the specification is not clear. Each point
where the text left a choice open was a question about the specification; the answers are in the specification itself
(`container.md`, `ids.md`, `transfer.md`, `tests/README.md`; see the spec commits "answers to the questions of the second
reader" in the history of `packages/language-pack-v3/spec`), and the reader follows them.

## What it needs

- Python 3.11 or later and the standard library. `lp3read.py` imports nothing else: it has its own strict CBOR decoder,
  because the specification forbids floats, tags, `null` and `undefined` and limits nesting to 64 levels, and a general
  decoder hides tags (it returns a bignum tag as an `int`) and recurses without limit.
- `cbor2` and `pytest` for the tests only (`cbor2` builds the test files and checks the decoder).

## Running it

```
python lp3read.py <file>
```

prints the reader output of a segment file (kind `01`) or a transfer file (kind `02`) as the canonical text that
`tests/README.md` defines (the form the `*.expected.json` files hold: keys sorted by code point, UTF-8 not escaped,
two-space indent) and exits 0. A rejected file prints `{"error": "<code>"}` (on one line) and exits 1. A file that cannot be read
exits 2. An unexpected exception inside the reader (a bug, never a verdict on the file) prints one line on stderr and
exits 3, so that it cannot be taken for a format error.

Trusted keys (catalog signatures, `spec/catalog.md`): `python lp3read.py <file> --keys <keys.json>` (the `x.keys.json` of a case: key id to 64 hex digits) and/or `--trusted <64 hex digits>` (a raw key, repeatable; its id is computed). Without either the reader ignores `sig`. `ed25519.py` is the RFC 8032 verifier (strict: `S >= L` and non-canonical encodings are rejected).

As a library:

```python
from lp3read import read_file, canonical_text, compact_text

out = read_file(data)             # the reader output, or {"error": "E_..."}
out = read_file(data, expect="segment")   # or "transfer": any other kind is E_KIND
print(canonical_text(out))        # indented, as the *.expected.json files
print(compact_text(out))          # the canonical text of tests/README.md, without whitespace
```

`read_segment(data)` and `parse_segment(data)` raise `LP3Error` (with `.code`) instead of returning the error object.

## What it reads

Segment files of the classes `book`, `orig`, `art`, `lex`, `obs`, `catalog`, `map`, `xmap`, `topics`, `xtopics` and `aligned`, and transfer files. It checks the
container in the order of `container.md` (all thirteen codes), the identity, the required and optional tables (an
optional table it does not know is skipped with what depends on it), the column encodings, and the further checks of
`tests/README.md`, "Checks of the tables". A segment of the class `gen` is `E_TABLE`: no reader knows a table of it yet. Of the maps it does
not know `topics` and `numbering` (optional, so skipped).

## Tests

From `packages/language-pack-v3`:

```
python -m pytest spec/reader-py -q
```

- every `.seg` and `.tcpack` of the conformance cases under `tests/` (`container/`, `entero-fuera-de-rango/` and the
  rest, not `data/`) gives its `*.expected.json`, compared as text byte for byte and as parsed values;
- every error code has a test whose file is made from `minimal.seg` with exactly one defect, and the order of checks
  has tests of its own;
- every class has files built in the test (an encoder written from the cddl files) and the output written by hand;
- the varint edges (2^31, 2^40, 2^53 − 1), the CBOR subset, the limits, and the transfer file (full, cut inside an entry,
  cut inside the index, defects of the index, statuses of entries).

## Status

Complete for phase 2 (the maps included). Not done: `gen`, checking the signatures of a catalog (phase 3).
`../.gitattributes` makes git check the `*.expected.json` files out with LF line ends on every platform, so the tests
compare the text of the output with the file byte for byte.

`aligned` (part C): `entries` as `{key: {strong: {book: [verses, occurrences]}}}`. The check of an `other` part against the
catalog is made only when the caller passes the ranges of the catalog's `aligned:` units:
`read_segment(data, aligned_ranges=aligned_ranges_of_catalog(catalog_output))`; a segment alone does not make it.
Tests: `test_aligned.py`.
