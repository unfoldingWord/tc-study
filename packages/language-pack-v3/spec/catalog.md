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
| `orig:tit` | The original of Titus (common catalog; a local, bridged catalog may list its own copy too) |
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

A bridged book names the original's stamp, so its unit needs `orig:<book>` like any book. The local catalog of the bridge lists the
`orig:<book>` of each book it builds, and a need is resolved in the book's own catalog first, then in a catalog it requires: the
bridged book finds its original there and activates with no common catalog. Only a book the `originals` source lacks waits for an
original from elsewhere.

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
| A tW article | its `art` group, the `map` core if its title changed, the catalog |
| A tA article, or the `config.yaml` of a tA manual | every `ta:` group of the language is re-checked (their `inputs` share the `sot` rows of every tA article and one row `ta-config\|{resource}/{manual}/config.yaml#{sha-256 of the text}` per config, since `related` ties articles of different groups); only the groups whose `related`, text or title changed change in content; the `map` core if a title changed; the catalog |
| One book of the original | `orig` of that book, and every `book` segment of that book in every language (their positions); the `xmap` part of that book |
| A new release stamp of a resource, with the same rows | The segments that list it in `res`, the cores, the catalog. A map part keeps its segment id, but its `inputs` carry the tN stamp of its book and so change: the part is re-checked, not re-published |
| The alias list | the `xmap` core and the parts whose books they touch |
| TIPNR, Theographic, English OBS, the English tN outlines or the builder's list of events | the `xtopics` core and every `xtopics` part (all of them share the `inputs` of the sources, so each is re-checked; only the core and the parts whose books they touch change in content); never an `xmap` or `map` segment |
| A language's aligned text, or the outline of its introductions | its `topics` core and every `topics` part of that language (all share the `inputs` of the core, so each is re-checked; only the core and the parts whose books they touch change in content); never a segment of the map |

## Signatures

- A catalog MAY carry signatures in its header (`sig`, `cddl/common.cddl`): a list of `{key, alg, s}`. `alg` is
  `ed25519` (RFC 8032, pure Ed25519, no context) and `s` is the 64-byte signature **of the catalog's 32-byte id**, the
  raw bytes and not their hex.
- **The key id.** `key` is the first 16 hex digits (lowercase) of the sha256 of the key's 32-byte raw public key.
- **The id does not change when a catalog is signed.** `sig` is a key of the file header, outside the body, and the id
  is the sha256 of the body. Signing changes the header, so `H` (the header length), `clen`'s position and the file
  bytes change; the body, the id and the `h` inside the header do not. So the same catalog can be signed by two
  keys, by one key later, or signed again, without changing any id that names it (`previous`, `requires`, a transfer
  file's index).
- Signing the id is enough: the id is the hash of the whole catalog, and the catalog holds the id of every segment.
- Which keys a reader trusts, and where it keeps them, is up to the app. The format only says how to check a signature.
  An app gives the reader its trusted keys as a map from key id to raw public key (a key whose id, computed from
  its bytes, is not the one it is listed under is not trusted).
- **A trusted-keys map entry counts only if** its id equals the key id (lowercase hex, above) of its 32-byte key. Other
  entries are dropped: a key of another length, an id in uppercase or of another length, an id that is not the key's.
- **Verification** is Ed25519 as RFC 8032 section 5.1.7 gives it, with the cofactorless equation `[S]B = R + [k]A`
  (`k` is the SHA-512 of `R || A || message`, little-endian, mod `L`). A signature does not verify when `S >= L`, or
  when the encoding of `R` or of `A` is not canonical (a `y` that is `>= p`, or `x = 0` with the sign bit set) or is
  not a point of the curve. A signature does not verify either when `R` or `A` is a point of small order (a point `P`
  with `[8]P` the identity: eight encodings are canonical). WebCrypto runtimes disagree on such points, so a reader
  checks this itself and does not leave it to the runtime.
- **Elements are compared by exact text.** A `sig` element's `key` is compared to the trusted ids as it is written (no
  case folding). Keys of an element beyond `key`, `alg` and `s` are ignored.
- A signature labels who published the catalog. It does not judge the content.
- A catalog an app builds on the device (from an old pack, `transfer.md`) has `origin: local` and no signature.

**When a reader checks, and when it rejects.**

1. A reader given **no** trusted keys ignores `sig` altogether (a `sig` of the wrong type too) and its output is the
   same as before signatures existed. "Given trusted keys" means the app passed a key map, even an empty one or one
   whose entries were all dropped (above): then no signature can be from a trusted key, and every published catalog is
   rejected with `E_SIGNATURE` (an unsigned one too). An app that has no keys passes none; it does not pass an empty map.
2. A reader given trusted keys checks every catalog it reads (a catalog file, and each catalog of a transfer file) whose
   `about.origin` is `published`, once the rest of the file has been accepted: an `E_BODY` or any other earlier error
   wins over `E_SIGNATURE`. It rejects the file with `E_SIGNATURE` when:
   - `sig` is missing, is not a non-empty array, or has an element that is not a map with `key` (text), `alg`
     (exactly `ed25519`) and `s` (64 bytes): malformed. One malformed element rejects the file, even if its `key` is
     not a trusted one;
   - no element names a trusted key (unknown key): elements whose `key` is not in the trusted map are skipped, and at
     least one element from a trusted key must be present;
   - **any** element that names a trusted key does not verify over the id (the element's `s` is not the signature of
     that key on the id): every element of a trusted key must verify, not only the first;
   - otherwise it accepts. Elements of unknown keys beside the verifying elements of trusted keys are ignored.
3. A `local` catalog is never signed and never rejected for its signature: a reader ignores its `sig`, whatever
   keys it was given. **Exception: a transfer file.** A local catalog is one the device builds for itself, so it can
   only come from the device's own store. When a reader given trusted keys reads a catalog that arrives inside a
   transfer file (`readTransfer`, import) and has `about.origin` `local`, it rejects the file with `E_SIGNATURE`: a
   file from outside must not install a catalog that claims the device made it, which no signature vouches for. A
   reader given no keys accepts it, as it ignores signatures altogether (1).
4. A `sig` in a segment that is not a catalog is ignored always.
5. **Output.** Only when keys were given, the catalog's reader output has `"sig": {"key": <key id>, "valid": true}`
   (the first verifying element in file order). A local catalog has no `sig` in the output, nor does a file read
   without keys.
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
