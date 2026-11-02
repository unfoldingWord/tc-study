# The catalog

The catalog is where reading starts. It says which segments a language has, which of them changed, what each depends
on, and which licenses apply. It is a segment of class `catalog` (`container.md`), small, and the only one that is
signed. Its schema is `cddl/catalog.cddl`.

There are two kinds:

- a **language catalog** (`lang` set), for one language's segments;
- the **common catalog** (no `lang`), for the original and the common map, which every language needs and nobody
  downloads twice.

A language catalog names the common catalog revision it was built against (`requires`).

## Revisions

- Every publication of a catalog is a **revision**: a number that only grows, per publisher and catalog, and the id of
  the revision before it (`previous`).
- A segment that did not change keeps its id from one revision to the next, so a device downloads only what changed.
- Two builds of the same inputs give the same segments (`container.md`), and so the same catalog except for its date.

## Units and dependencies

A **unit** is what a device installs or replaces at once:

| Unit | Segments |
| --- | --- |
| `book:tit` | The language's book segment for Titus |
| `orig:tit` | The original of Titus (common catalog) |
| `map` | The language map: its core and its parts. Needs nothing |
| `xmap` | The common map: its core and its parts (common catalog). Needs nothing |
| `art:tw:kt`, `art:ta:translate`… | A group of articles |
| `lex:G5`… | A group of lexicon entries |
| `obs` | Open Bible Stories |

Each unit lists the units it needs (`needs`). A book needs its original, the language map (`needs: "map"`, now satisfied by its own catalog) and the article groups its
notes and links point to that the catalog builds (the others are reported and not listed). The lexicon is not needed to read; an app downloads it when asked.

A bridged book names the original's stamp, so its unit needs `orig:<book>` like any book: a device without that
original does not activate it.

**Activation.**
- A device activates a unit when the unit and every unit it needs are complete and verified.
- Until then, it keeps using the unit it had.
- A device does not need every book: units nobody needs can be missing.

## Published against installed

The map describes what its revision **published**, not what the device **installed**. A device can hold the map of
revision 12 and Ruth from revision 9.

- An answer from the map names the revision it describes.
- An answer about installed content ("the notes I have of Ruth") reads the installed book segment.
- When the map of the installed revision says a book changed, the app can offer to update it. It knows how much the
  update weighs, because the catalog gives each segment's size.

## What changes when an input changes

The builder records each segment's inputs (`inputs`, a fingerprint) and rebuilds only what they touch:

| Change | Segments that change |
| --- | --- |
| The wording of a note of Ruth | `book:rut`, the catalog |
| The SupportReference of a note of Ruth | `book:rut`, the `map` part of Ruth and the `map` core (its counts), the catalog |
| The introduction of Ruth (its outline) | `book:rut`, the `map` core (topics), the catalog |
| An English note or word link | the English `book` segment; the `xmap` part of that book and its core, if a count or the Strong keys of a link's quote (`strongs`) changed; both catalogs |
| A tW or tA article | its `art` group, the `map` core if its title changed, the catalog |
| One book of the original | `orig` of that book, and every `book` segment of that book in every language (their positions); the `xmap` part of that book |
| A new release stamp of a resource, with the same rows | The segments that list it in `res`, the cores, the catalog. A map part keeps its segment id, but its `inputs` carry the tN stamp of its book and so change: the part is re-checked, not re-published |
| TIPNR, Theographic or the alias list | the `xmap` core and the parts whose books they touch |

## Signatures

- A catalog MAY carry signatures in its header (`sig`). Each is Ed25519 over the catalog's 32-byte id, with the id of
  the key that made it.
- Signing the id is enough: the id is the hash of the whole catalog, and the catalog holds the id of every segment.
- Which keys a reader trusts, and where it keeps them, is up to the app. The format only says how to check a signature.
- A signature labels who published the catalog. It does not judge the content.
- A catalog an app builds on the device (from an old pack, `transfer.md`) has `origin: local` and no signature.
- **Going back.** A reader MUST NOT replace an installed catalog with a lower revision of the same publisher and
  catalog, unless the person confirms it. An old SD card must not undo an update without asking.

## Complements

Complements are files a reader is not obliged to read: question classifiers, vectors, number words, models. They
travel through the catalog with their own version, and their bytes are opaque to the format.

- Each complement has its sha256, size, media type and version.
- A complement may name what it is for (`for`: the version of the library's queries).
- A complement is built before the catalog that lists it. A complement built later goes in a later revision.
