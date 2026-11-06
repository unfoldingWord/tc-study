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
| `topics` | The language topics: its core and its parts (`topics`, language catalog). Needs nothing |
| `xtopics` | The common topics: its core and its parts (common catalog). Needs nothing |
| `art:tw:kt`, `art:ta:translate`… | A group of articles |
| `lex:G5`… | A group of lexicon entries |
| `aligned:a-am`, `aligned:ar-b`, `aligned:other`… | One part of the language's index of aligned phrases (`aligned`, language catalog), named by its range of keys (prefixes of 1 to 6 characters; `cddl/aligned.cddl`). Optional: a device installs it only when asked. Needs nothing, and no unit needs it |
| `obs` | Open Bible Stories |

Each unit lists the units it needs (`needs`). A unit may carry `optional: true`: a device installs it only when asked. Every `aligned:{part}` unit must carry it (with the value `true`) and no other unit may; no unit lists an optional unit in `needs`, and an optional unit lists no `needs` (rules of the builder; a reader does not check them). The part of an `aligned:{part}` id must be a group (`cddl/aligned.cddl`), or the catalog is `E_BODY`. A book needs its original, the language map (`needs: "map"`, now satisfied by its own catalog) and the article groups its
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
| The alias list | the `xmap` core and the parts whose books they touch |
| TIPNR, Theographic, English OBS, the English tN outlines or the builder's list of events | the `xtopics` core and every `xtopics` part (all of them share the `inputs` of the sources, so each is re-checked; only the core and the parts whose books they touch change in content); never an `xmap` or `map` segment |
| A language's aligned text, or the outline of its introductions | its `topics` core and every `topics` part of that language (all share the `inputs` of the core, so each is re-checked; only the core and the parts whose books they touch change in content); never a segment of the map |

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
- **The kinds `images` and `basemap`** (specified here, built after part B of phase 2). `images` is an image archive with an index: file, size, concepts, verse ranges and a credit for each piece. `basemap` is background layers with no place names; relief is a separate `basemap` complement; an app places the `lug:` points of the topics with the language's names. `license` is the license of the whole set, and each piece's license is in the index; `lang` is present only when an image has text burned in; `for` names the `xmap` revision whose concept ids and verse ranges the index uses. They change no map and no unit.
- **The `aligned` units are optional.** A unit with `"optional": true` is installed only when the device asks for it. No unit lists an `aligned:{part}` unit in `needs`, and these units list no `needs`: nothing else depends on them. Building a language with or without them gives byte-equal segments of every other class, and a catalog that lists them differs only by those units and their segments. A lookup in a part that is not on the device answers `installed: false`, never "not found"; with the part, a key that is not in it is simply absent. The part of a key is the one whose range holds the key, after NFC and lowercase (`cddl/aligned.cddl`). A catalog that lists `aligned` units needs a reader of part C: a reader of part A or B knows no class `aligned`, so it answers `E_BODY` (catalog class) for such a catalog, whatever it does with `optional`.
- **Topics and installation.** The `xtopics` and `topics` units need nothing and nothing needs them. `xtopics` decides: an occurrence query needs it, and without it `installed` is `false` whatever `topics` holds. With `xtopics` and no `topics` of the language, `installed` is `true` and the names are absent: the answer shows the English `title` and says so, and is not an error. A topics answer says `installed: false` when the module is not on the device, and then gives no state of `counts.md` (that file has no "not installed" state); with the module the four states apply as always.
- A complement is built before the catalog that lists it. A complement built later goes in a later revision.
