#!/usr/bin/env python3
"""lp3read: an independent reader of language pack format 3.

Written from the specification alone (``packages/language-pack-v3/spec/``): ``container.md``, ``ids.md``,
``catalog.md``, ``transfer.md``, ``cddl/`` and ``tests/README.md``. It has not seen the TypeScript reader.

    python lp3read.py <file>

prints the reader output of the file as the canonical text of ``tests/README.md`` and exits 0, or prints
``{"error": "<code>"}`` and exits 1 when the file is rejected (2: the file cannot be read; 3: an unexpected exception,
a bug of this reader and not a verdict on the file).

As a library: ``read_file(data) -> dict`` (the reader output, or ``{"error": code}``), ``canonical_text(obj)``
(the indented text the ``*.expected.json`` files hold) and ``compact_text(obj)`` (the canonical text without
whitespace).

Only the standard library is needed. The CBOR decoder is written here rather than taken from ``cbor2`` because the
specification makes a reader reject indefinite lengths, floats, tags, ``null`` and ``undefined`` and limits the nesting
to 64 levels, and a general decoder hides tags (a bignum tag comes back as an ``int``) and recurses without a limit. ``cbor2`` is used by the
tests, to build files and to check this decoder against it.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import zlib

MAX_INT = 2**53 - 1
MAGIC = bytes([0x89, 0x54, 0x4C, 0x50])
MAX_HEADER = 65536
MAX_LEN = 67108864
MAX_DEPTH = 64

CLASSES = ("catalog", "xmap", "map", "book", "orig", "art", "lex", "obs", "gen")
KINDS = ("chapter", "verse", "open", "close")
BOOKS = (
    "gen exo lev num deu jos jdg rut 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam ezk dan hos "
    "jol amo oba jon mic nam hab zep hag zec mal mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti 2ti tit "
    "phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev"
).split()
BOOK_NUMBER = {code: i + 1 for i, code in enumerate(BOOKS)}
ROLES = ("intro", "definition", "facts", "translation-suggestions", "examples", "strategies", "description",
         "reason", "bible-references", "word-data", "unknown")

# What a phase 1 reader knows: every table of cddl/<class>.cddl, at version 1.
KNOWN_TABLES = {
    "book": {"strings", "texts", "align", "notes", "questions", "links", "quotes"},
    "orig": {"words", "text", "macula"},
    "art": {"articles"},
    "lex": {"entries"},
    "obs": {"strings", "stories", "notes", "questions", "links", "study-notes", "study-questions"},
    "catalog": {"about", "resources", "segments", "units", "requires", "complements"},
}
REQUIRED_TABLES = {
    "book": {"strings", "texts"},
    "orig": {"words", "text"},
    "art": {"articles"},
    "lex": {"entries"},
    "obs": {"strings", "stories"},
    "catalog": {"about", "resources", "segments", "units"},
}
KNOWN_VERSION = 1

_TABLE_NAME = re.compile(r"[a-z][a-z0-9-]*")
_BOOK_CODE = re.compile(r"[0-9a-z]{3}")
_LEX_GROUP = re.compile(r"[GH][0-9]+")
_STRONG = re.compile(r"([GH])([0-9]+)[A-Za-z]*")


class LP3Error(Exception):
    """A rejected file. ``code`` is one of the codes of container.md and transfer.md."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _fail(code: str):
    raise LP3Error(code)


def _bad():
    raise LP3Error("E_BODY")


# ---------------------------------------------------------------------------------------------------------------
# CBOR (RFC 8949), strict as container.md says ("What a reader accepts"): no indefinite lengths, floats, tags, null,
# undefined or other simple values (only false and true); text must be valid UTF-8; map keys are text and not repeated;
# nesting at most 64 levels. Integers not in their shortest form and map keys not sorted are accepted.
# ---------------------------------------------------------------------------------------------------------------


class _Malformed(Exception):
    pass


class _TooDeep(Exception):
    pass


class _Decoder:
    def __init__(self, buf: bytes):
        self.b = buf
        self.i = 0

    def take(self, n: int) -> bytes:
        if n > len(self.b) - self.i:
            raise _Malformed("cut short")
        s = self.b[self.i:self.i + n]
        self.i += n
        return s

    def head(self):
        """Returns (major, argument). Indefinite lengths (additional information 31) are rejected."""
        if self.i >= len(self.b):
            raise _Malformed("cut short")
        ib = self.b[self.i]
        self.i += 1
        major, info = ib >> 5, ib & 31
        if info < 24:
            return major, info
        if 24 <= info <= 27:
            return major, int.from_bytes(self.take(1 << (info - 24)), "big")
        raise _Malformed("indefinite length or reserved additional information")

    def item(self, depth: int):
        if self.i < len(self.b) and self.b[self.i] >> 5 == 7:
            info = self.b[self.i] & 31
            self.i += 1
            if info == 20:
                return False
            if info == 21:
                return True
            raise _Malformed("float, null, undefined, simple value or break")
        major, arg = self.head()
        if major == 0:
            return arg
        if major == 1:
            return -1 - arg
        if major == 6:
            raise _Malformed("tag")
        if major in (2, 3):
            raw = self.take(arg)
            if major == 2:
                return bytes(raw)
            try:
                return raw.decode("utf-8")
            except UnicodeDecodeError:
                raise _Malformed("invalid UTF-8") from None
        # arrays and maps
        if depth + 1 > MAX_DEPTH:
            raise _TooDeep()
        if arg > len(self.b) - self.i:
            raise _Malformed("cut short")
        if major == 4:
            return [self.item(depth + 1) for _ in range(arg)]
        out = {}
        for _ in range(arg):
            k = self.item(depth + 1)
            if type(k) is not str or k in out:
                raise _Malformed("map key")
            out[k] = self.item(depth + 1)
        return out


def _cbor_one(buf: bytes):
    """One CBOR item that is exactly all of ``buf``. Raises _Malformed or _TooDeep."""
    d = _Decoder(buf)
    v = d.item(0)
    if d.i != len(buf):
        raise _Malformed("bytes after the item")
    return v


def _ints_in_range(v) -> bool:
    stack = [v]
    while stack:
        x = stack.pop()
        if type(x) is int:
            if x > MAX_INT or x < -MAX_INT:
                return False
        elif type(x) is list:
            stack.extend(x)
        elif type(x) is dict:
            stack.extend(x.values())
    return True


# ---------------------------------------------------------------------------------------------------------------
# Small type tests. ``bool`` is an ``int`` in Python, so every test looks at the exact type.
# ---------------------------------------------------------------------------------------------------------------


def is_uint(x) -> bool:
    return type(x) is int and x >= 0


def is_str(x) -> bool:
    return type(x) is str


def is_bool(x) -> bool:
    return type(x) is bool


def is_bytes(x, n: int | None = None) -> bool:
    return type(x) is bytes and (n is None or len(x) == n)


def is_strlist(x) -> bool:
    return type(x) is list and all(type(s) is str for s in x)


def is_pair_strs(x) -> bool:
    return type(x) is list and len(x) == 2 and all(type(s) is str for s in x)


def deep_equal(a, b) -> bool:
    """Equality that does not take True for 1."""
    if type(a) is not type(b):
        return False
    if type(a) is list:
        return len(a) == len(b) and all(deep_equal(x, y) for x, y in zip(a, b))
    if type(a) is dict:
        return a.keys() == b.keys() and all(deep_equal(a[k], b[k]) for k in a)
    return a == b


def jsonable(v):
    """The value as the reader output holds it: byte strings in lowercase hex."""
    if type(v) is bytes:
        return v.hex()
    if type(v) is list:
        return [jsonable(x) for x in v]
    if type(v) is dict:
        return {k: jsonable(x) for k, x in v.items()}
    return v


# ---------------------------------------------------------------------------------------------------------------
# Column encodings (container.md). Every defect is E_BODY.
# ---------------------------------------------------------------------------------------------------------------


def uvarints(b) -> list[int]:
    if not is_bytes(b):
        _bad()
    out = []
    i, n = 0, len(b)
    while i < n:
        v = 0
        for k in range(8):
            if i >= n:
                _bad()                      # cut short
            byte = b[i]
            i += 1
            v |= (byte & 0x7F) << (7 * k)
            if not byte & 0x80:
                if k > 0 and byte == 0:
                    _bad()                  # not minimal
                break
        else:
            _bad()                          # longer than 8 bytes
        if v > MAX_INT:
            _bad()
        out.append(v)
    return out


def unzigzag(u: int) -> int:
    return (u >> 1) if u % 2 == 0 else -((u + 1) >> 1)


def svarints(b) -> list[int]:
    return [unzigzag(u) for u in uvarints(b)]


def deltas(b, lo: int = 0, hi: int = MAX_INT) -> list[int]:
    """The values a ``deltas`` column adds up to; each must be in lo..hi."""
    out, cur = [], 0
    for d in svarints(b):
        cur += d
        if cur < lo or cur > hi:
            _bad()
        out.append(cur)
    return out


def bits(b, n: int) -> list[bool]:
    if not is_bytes(b) or len(b) != (n + 7) // 8:
        _bad()
    if n % 8 and b[-1] >> (n % 8):
        _bad()                              # an unused bit is set
    return [bool((b[i >> 3] >> (i & 7)) & 1) for i in range(n)]


def texts_column(col) -> list[str]:
    if type(col) is not dict or not is_bytes(col.get("utf8")) or "len" not in col:
        _bad()
    lens = uvarints(col["len"])
    raw = col["utf8"]
    if sum(lens) != len(raw):
        _bad()
    out, at = [], 0
    for n in lens:
        try:
            out.append(raw[at:at + n].decode("utf-8"))
        except UnicodeDecodeError:
            _bad()
        at += n
    return out


def decode_column(col, n: int, strings: list[str] | None = None, allow_flags: bool = True) -> list:
    """The value of each of ``n`` rows: text, bool or None (the row lacks the value)."""
    if type(col) is not dict:
        _bad()
    kinds = [k for k in ("strings", "texts", "flags", "uints") if k in col]
    if len(kinds) != 1:
        _bad()
    kind = kinds[0]
    if kind == "flags" and not allow_flags:
        _bad()
    if "has" in col:
        has = bits(col["has"], n)
        m = sum(has)
    else:
        has = None
        m = n
    if kind == "strings":
        nums = uvarints(col["strings"])
        if len(nums) != m:
            _bad()
        if strings is None:
            _bad()
        if any(x >= len(strings) for x in nums):
            _bad()
        vals = [strings[x] for x in nums]
    elif kind == "texts":
        vals = texts_column(col["texts"])
        if len(vals) != m:
            _bad()
    elif kind == "flags":
        vals = bits(col["flags"], m)
    else:
        nums = uvarints(col["uints"])
        if len(nums) != m:
            _bad()
        vals = [str(x) for x in nums]
    if has is None:
        return vals
    out, it = [], iter(vals)
    for present in has:
        out.append(next(it) if present else None)
    return out


# ---------------------------------------------------------------------------------------------------------------
# A parsed segment (container.md, steps 1 to 4 of the order of checks)
# ---------------------------------------------------------------------------------------------------------------


class Segment:
    def __init__(self, id_hex, h, t, skip):
        self.id = id_hex
        self.h = h
        self.t = t
        self.skip = skip
        self.cls = h["class"]

    def has(self, name: str) -> bool:
        """The table is in the file and this reader reads it."""
        return name in self.h["tables"] and name not in self.skip

    def table(self, name: str):
        return self.t[name] if self.has(name) else None

    def res_key(self, index) -> str:
        res = self.h.get("res")
        if not is_uint(index) or res is None or index >= len(res):
            _bad()
        return res[index][0]


def _check_fixed(data: bytes, kinds: tuple) -> int:
    """Step 1: each fixed byte as soon as it is present. Returns the kind."""
    for i, b in enumerate(MAGIC):
        if len(data) > i and data[i] != b:
            _fail("E_MAGIC")
    if len(data) > 4 and data[4] != 3:
        _fail("E_VERSION")
    if len(data) > 6 and data[6] not in kinds:
        _fail("E_KIND")
    if len(data) < 12:
        _fail("E_TRUNCATED")
    return data[6]


def _validate_logical_header(h) -> None:
    """The general shape of the body's ``h`` (E_BODY)."""
    if type(h) is not dict:
        _bad()
    if h.get("class") not in CLASSES:
        _bad()
    if not is_uint(h.get("v")):
        _bad()
    tables = h.get("tables")
    if type(tables) is not dict:
        _bad()
    for name, entry in tables.items():
        if not _TABLE_NAME.fullmatch(name):
            _bad()
        if type(entry) is not list or len(entry) != 2 or not is_uint(entry[0]) or not is_bool(entry[1]):
            _bad()
    for key in ("lang", "book", "part", "group"):
        if key in h and not is_str(h[key]):
            _bad()
    if "orig" in h and not is_pair_strs(h["orig"]):
        _bad()
    if "res" in h:
        r = h["res"]
        if type(r) is not list or not all(is_pair_strs(x) for x in r):
            _bad()


def parse_segment(data: bytes, expect_id: bytes | None = None, must_class: str | None = None) -> Segment:
    """A segment file up to and including E_TABLE (container.md, steps 1 to 4); step 5 is ``decode_segment``.

    ``must_class`` is the class the body's ``h`` must have (a catalog inside a transfer file): another class is
    E_BODY, as part of the general shape of the body (after E_ID, before E_HMISMATCH).
    """
    _check_fixed(data, (1,))
    hlen = int.from_bytes(data[8:12], "big")
    # step 2
    if hlen > MAX_HEADER:
        _fail("E_LIMIT")
    if len(data) < 12 + hlen:
        _fail("E_TRUNCATED")
    try:
        header = _cbor_one(data[12:12 + hlen])
    except _TooDeep:
        _fail("E_LIMIT")
    except _Malformed:
        _fail("E_HEADER")
    if type(header) is not dict:
        _fail("E_HEADER")
    hh = header.get("h")
    codec, clen, ulen, id_ = header.get("codec"), header.get("clen"), header.get("ulen"), header.get("id")
    if type(hh) is not dict or not is_str(codec) or not is_uint(clen) or not is_uint(ulen) or not is_bytes(id_, 32):
        _fail("E_HEADER")
    # step 3
    if clen > MAX_LEN or ulen > MAX_LEN:
        _fail("E_LIMIT")
    if len(data) < 12 + hlen + clen:
        _fail("E_TRUNCATED")
    if len(data) > 12 + hlen + clen:
        _fail("E_TRAILING")
    # step 4
    if codec != "deflate-raw":
        _fail("E_CODEC")
    compressed = data[12 + hlen:]
    inflater = zlib.decompressobj(-15)
    try:
        body = inflater.decompress(compressed, ulen + 1)
    except zlib.error:
        _fail("E_INFLATE")
    if len(body) != ulen or not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
        _fail("E_INFLATE")
    digest = hashlib.sha256(body).digest()
    if digest != id_ or (expect_id is not None and digest != expect_id):
        _fail("E_ID")
    try:
        doc = _cbor_one(body)
    except _TooDeep:
        _fail("E_LIMIT")
    except _Malformed:
        _bad()
    if type(doc) is not dict or "h" not in doc or "t" not in doc:
        _bad()
    if not _ints_in_range(doc):
        _bad()
    h, t = doc["h"], doc["t"]
    _validate_logical_header(h)
    if type(t) is not dict or t.keys() != h["tables"].keys():
        _bad()
    if must_class is not None and h["class"] != must_class:
        _bad()
    if not deep_equal(h, hh):
        _fail("E_HMISMATCH")
    cls = h["class"]
    if cls not in KNOWN_TABLES:
        _fail("E_TABLE")                    # map, xmap, gen: this reader knows no table of them
    skip = set()
    for name, (version, required) in h["tables"].items():
        known = name in KNOWN_TABLES[cls] and version == KNOWN_VERSION
        if known:
            continue
        if required or name in REQUIRED_TABLES[cls]:
            _fail("E_TABLE")
        skip.add(name)
    return Segment(digest.hex(), h, t, skip)


# ---------------------------------------------------------------------------------------------------------------
# Shared pieces of the classes
# ---------------------------------------------------------------------------------------------------------------


def _need(m, key, test):
    if type(m) is not dict or key not in m or not test(m[key]):
        _bad()
    return m[key]


def _opt(m, key, test):
    """The value of an optional key, or None when the key is absent."""
    if key not in m:
        return None
    if not test(m[key]):
        _bad()
    return m[key]


def _header_needs(p: Segment, *keys: str, nonempty_res: bool = False) -> None:
    h = p.h
    for key in keys:
        if key not in h:
            _bad()
    if "book" in keys and not _BOOK_CODE.fullmatch(h["book"]):
        _bad()
    if nonempty_res and (not isinstance(h.get("res"), list) or len(h["res"]) == 0):
        _bad()
    if h["v"] != 1:
        _bad()


def _strtab(x) -> list[str]:
    if not is_strlist(x):
        _bad()
    return x


def _events(ev, npieces: int, arg_of) -> list:
    nums = uvarints(ev)
    if len(nums) % 3:
        _bad()
    out, pos = [], 0
    for i in range(0, len(nums), 3):
        pos += nums[i]
        if pos > npieces:
            _bad()
        code, arg = nums[i + 1], nums[i + 2]
        if code > 3:
            _bad()
        if code == 3:
            if arg != 0:
                _bad()
            text = ""
        else:
            text = arg_of(arg)
        out.append([pos, KINDS[code], text])
    return out


def _attrs(attrs, nevents: int) -> list:
    if type(attrs) is not list:
        _bad()
    out, seen = [], set()
    for pair in attrs:
        if type(pair) is not list or len(pair) != 2 or not is_uint(pair[0]) or type(pair[1]) is not dict:
            _bad()
        if pair[0] >= nevents or pair[0] in seen:
            _bad()
        if not all(is_str(v) for v in pair[1].values()):
            _bad()
        seen.add(pair[0])
        out.append([pair[0], dict(pair[1])])
    out.sort(key=lambda pr: pr[0])
    return out


def _ranges(r, n: int) -> list[tuple[int, int]]:
    if type(r) is not dict or "from" not in r or "span" not in r:
        _bad()
    starts = deltas(r["from"])
    spans = uvarints(r["span"])
    if len(starts) != n or len(spans) != n:
        _bad()
    out = []
    for a, s in zip(starts, spans):
        if a + s > MAX_INT:
            _bad()
        out.append((a, a + s))
    return out


def canonical_ref(first: int, last: int, book: int | None) -> str | None:
    """The canonical text of a range of verse ids (ids.md), or None when it has none."""
    if book is None or first // 1000000 != book or last // 1000000 != book or first > last:
        return None
    c1, v1 = (first // 1000) % 1000, first % 1000
    c2, v2 = (last // 1000) % 1000, last % 1000
    if first == last:
        if c1 == 0:
            return "front:intro" if v1 == 0 else None
        if v1 == 0:
            return f"{c1}:intro"
        return f"{c1}:{v1}"
    if 0 in (c1, v1, c2, v2):
        return None
    if c1 == c2:
        return f"{c1}:{v1}-{v2}"
    return f"{c1}:{v1}-{c2}:{v2}"


def _ids(idc, n: int, strings: list[str]) -> list[str]:
    if type(idc) is not dict:
        _bad()
    if ("ascii4" in idc) == ("strings" in idc):
        _bad()
    if "ascii4" in idc:
        raw = idc["ascii4"]
        if not is_bytes(raw) or len(raw) != 4 * n or any(b > 127 for b in raw):
            _bad()
        return [raw[4 * i:4 * i + 4].decode("ascii") for i in range(n)]
    nums = uvarints(idc["strings"])
    if len(nums) != n or any(x >= len(strings) for x in nums):
        _bad()
    return [strings[x] for x in nums]


def _ref_text(entries, n: int) -> dict[int, str]:
    if type(entries) is not list:
        _bad()
    out = {}
    for e in entries:
        if type(e) is not list or len(e) != 2 or not is_uint(e[0]) or not is_str(e[1]):
            _bad()
        if e[0] >= n or e[0] in out:
            _bad()
        out[e[0]] = e[1]
    return out


def _common_rows(tab, strings: list[str]):
    """The parts of a table of helps that books and OBS share. Returns (n, ids, concepts, cols, ref_text)."""
    if type(tab) is not dict:
        _bad()
    n = _need(tab, "n", is_uint)
    ids = _ids(tab.get("id"), n, strings)
    concept = None
    if "concept" in tab:
        concept = decode_column(tab["concept"], n, strings, allow_flags=False)
    cols_in = _need(tab, "cols", lambda x: type(x) is dict)
    cols = {name: decode_column(c, n, strings) for name, c in cols_in.items()}
    ref_text = _ref_text(tab["refText"], n) if "refText" in tab else {}
    rows = []
    for i in range(n):
        row = {"id": ids[i]}
        if concept is not None and concept[i] is not None:
            row["concept"] = concept[i]
        row["cols"] = {name: vals[i] for name, vals in cols.items() if vals[i] is not None}
        rows.append(row)
    return n, rows, ref_text


# ---------------------------------------------------------------------------------------------------------------
# book
# ---------------------------------------------------------------------------------------------------------------


def _decode_book_text(p: Segment, tx, strings: list[str]):
    if type(tx) is not dict:
        _bad()
    res = p.res_key(_need(tx, "res", is_uint))
    tok = uvarints(_need(tx, "tok", is_bytes))
    pieces = []
    for x in tok:
        if x // 2 >= len(strings):
            _bad()
        pieces.append([strings[x // 2], x % 2 == 1])

    def arg_of(a):
        if a >= len(strings):
            _bad()
        return strings[a]

    events = _events(_need(tx, "ev", is_bytes), len(pieces), arg_of)
    out = {"res": res, "pieces": pieces, "events": events}
    if "attrs" in tx:
        attrs = _attrs(tx["attrs"], len(events))
        if attrs:
            out["attrs"] = attrs
    return out, sum(1 for pc in pieces if pc[1])


def _decode_align(al, nwords: int):
    if type(al) is not dict:
        _bad()
    nums = uvarints(_need(al, "words", is_bytes))
    at, last, words = 0, 0, []
    for _ in range(nwords):
        if at >= len(nums):
            _bad()
        k = nums[at]
        at += 1
        if k > len(nums) - at:
            _bad()
        lst = []
        for _ in range(k):
            last += unzigzag(nums[at])
            at += 1
            if last < 0 or last > MAX_INT:
                _bad()
            lst.append(last)
        words.append(lst)
    if at != len(nums):
        _bad()
    missing = []
    if "missing" in al:
        if type(al["missing"]) is not list:
            _bad()
        for e in al["missing"]:
            if (type(e) is not list or len(e) != 4 or not is_uint(e[0]) or not is_uint(e[1]) or not is_str(e[2])
                    or not is_uint(e[3]) or e[0] >= nwords):
                _bad()
            missing.append(list(e))
    return words, missing


def _decode_quotes(q, name: str, nrows: int, rows: list) -> None:
    """Adds ``quote``, ``quoteKinds`` and ``quoteMissing`` to the rows of the table ``name``."""
    if type(q) is not dict or name not in q:
        return
    qp = q[name]
    if type(qp) is not dict:
        _bad()
    counts = uvarints(_need(qp, "n", is_bytes))
    if len(counts) != nrows:
        _bad()
    total = sum(counts)
    values = deltas(_need(qp, "pos", is_bytes))
    if len(values) != total:
        _bad()
    starts, acc = [], 0
    for c in counts:
        starts.append(acc)
        acc += c
    for i, row in enumerate(rows):
        row["quote"] = [v - 1 for v in values[starts[i]:starts[i] + counts[i]]]
    used = set()

    def piece_ok(row, piece):
        if not is_uint(row) or not is_uint(piece) or row >= nrows or piece >= counts[row]:
            _bad()
        if values[starts[row] + piece] != 0 or (row, piece) in used:
            _bad()
        used.add((row, piece))

    kinds, missing = qp.get("kinds", []), qp.get("missing", [])
    if type(kinds) is not list or type(missing) is not list:
        _bad()
    for e in kinds:
        if type(e) is not list or len(e) != 3 or not is_str(e[2]):
            _bad()
        piece_ok(e[0], e[1])
        rows[e[0]].setdefault("quoteKinds", []).append([e[1], e[2]])
    for e in missing:
        if type(e) is not list or len(e) != 5 or not is_uint(e[2]) or not is_str(e[3]) or not is_uint(e[4]):
            _bad()
        piece_ok(e[0], e[1])
        rows[e[0]].setdefault("quoteMissing", []).append([e[1], e[2], e[3], e[4]])
    # every -1 is in exactly one of the two lists (each listed piece is a -1 and is listed once: see piece_ok)
    if sum(1 for v in values if v == 0) != len(used):
        _bad()


def _decode_book_helps(p: Segment, name: str, strings: list[str], book: int | None) -> dict:
    tab = p.table(name)
    if type(tab) is not dict:
        _bad()
    res = p.res_key(_need(tab, "res", is_uint))
    n, rows, ref_text = _common_rows(tab, strings)
    ranges = _ranges(tab.get("ref"), n)
    out_rows = []
    for i, row in enumerate(rows):
        first, last = ranges[i]
        text = ref_text.get(i)
        if text is None:
            text = canonical_ref(first, last, book)
            if text is None:
                _bad()
        full = {"id": row["id"], "ref": text, "from": first, "to": last}
        if "concept" in row:
            full["concept"] = row["concept"]
        full["cols"] = row["cols"]
        out_rows.append(full)
    return {"res": res, "rows": out_rows}


def _decode_book(p: Segment) -> dict:
    _header_needs(p, "lang", "book", "orig", "res", nonempty_res=True)
    for key in REQUIRED_TABLES["book"]:
        if key not in p.h["tables"]:
            _bad()
    strings = _strtab(p.t["strings"])
    texts_in = p.t["texts"]
    if type(texts_in) is not list:
        _bad()
    texts, nwords = [], []
    for tx in texts_in:
        out, w = _decode_book_text(p, tx, strings)
        texts.append(out)
        nwords.append(w)
    if p.has("align"):
        al = p.t["align"]
        if type(al) is not list or len(al) != len(texts):
            _bad()
        for i, entry in enumerate(al):
            words, missing = _decode_align(entry, nwords[i])
            if any(words) or missing:
                texts[i]["align"] = words
            if missing:
                texts[i]["alignMissing"] = missing
    out = {"texts": texts}
    book = BOOK_NUMBER.get(p.h["book"])
    helps = {}
    for name in ("notes", "questions", "links"):
        if p.has(name):
            helps[name] = _decode_book_helps(p, name, strings, book)
            out[name] = helps[name]
    if p.has("quotes"):
        q = p.t["quotes"]
        if type(q) is not dict:
            _bad()
        for name in ("notes", "links"):
            if name in helps:
                rows = helps[name]["rows"]
                _decode_quotes(q, name, len(rows), rows)
    return out


# ---------------------------------------------------------------------------------------------------------------
# orig
# ---------------------------------------------------------------------------------------------------------------


def _decode_orig(p: Segment) -> dict:
    _header_needs(p, "book", "orig")
    for key in REQUIRED_TABLES["orig"]:
        if key not in p.h["tables"]:
            _bad()
    words_in, text_in = p.t["words"], p.t["text"]
    if type(words_in) is not dict or type(text_in) is not dict:
        _bad()
    attrs_names = ("form", "lemma", "strong", "morph")
    tabs = {a: _strtab(words_in.get(a)) for a in attrs_names}
    cols_in = _need(words_in, "cols", lambda x: type(x) is dict)
    cols = {a: uvarints(cols_in.get(a)) for a in attrs_names}
    nwords = len(cols["form"])
    if any(len(c) != nwords for c in cols.values()):
        _bad()
    words = []
    for i in range(nwords):
        w = {}
        for a in attrs_names:
            x = cols[a][i]
            if x >= len(tabs[a]):
                _bad()
            w[a] = tabs[a][x]
        words.append(w)
    if "other" in words_in:
        other = words_in["other"]
        if type(other) is not list:
            _bad()
        seen = set()
        for e in other:
            if (type(e) is not list or len(e) != 2 or not is_uint(e[0]) or type(e[1]) is not dict
                    or not all(is_str(v) for v in e[1].values())):
                _bad()
            if e[0] >= nwords or e[0] in seen:
                _bad()
            seen.add(e[0])
            words[e[0]]["other"] = dict(e[1])
    seps = _strtab(text_in.get("seps"))
    tok = uvarints(_need(text_in, "tok", is_bytes))
    pieces, next_word = [], 0
    for x in tok:
        if x == 0:
            if next_word >= nwords:
                _bad()
            pieces.append([words[next_word]["form"], True])
            next_word += 1
        else:
            if x - 1 >= len(seps):
                _bad()
            pieces.append([seps[x - 1], False])
    if next_word != nwords:
        _bad()

    def arg_of(a):
        if a >= len(seps):
            _bad()
        return seps[a]

    events = _events(_need(text_in, "ev", is_bytes), len(pieces), arg_of)
    out = {"words": words, "pieces": pieces, "events": events}
    if "attrs" in text_in:
        attrs = _attrs(text_in["attrs"], len(events))
        if attrs:
            out["attrs"] = attrs
    if p.has("macula"):
        m = p.t["macula"]
        if type(m) is not dict or not is_str(m.get("release")):
            _bad()
        mo = {"release": m["release"]}
        for key in ("trees", "referents"):
            if key in m:
                mo[key] = jsonable(m[key])
        out["macula"] = mo
    return out


# ---------------------------------------------------------------------------------------------------------------
# art
# ---------------------------------------------------------------------------------------------------------------


def _decode_art(p: Segment) -> dict:
    _header_needs(p, "lang", "group", "res", nonempty_res=True)
    if "articles" not in p.h["tables"]:
        _bad()
    arts_in = p.t["articles"]
    if type(arts_in) is not list:
        _bad()
    out, ids = [], set()
    for a in arts_in:
        if type(a) is not dict:
            _bad()
        aid = _need(a, "id", is_str)
        if aid == "" or aid in ids:
            _bad()
        ids.add(aid)
        art = {"id": aid, "res": p.res_key(_need(a, "res", is_uint)), "title": _need(a, "title", is_str)}
        if _opt(a, "subtitle", is_str) is not None:
            art["subtitle"] = a["subtitle"]
        for key in ("related", "aliases"):
            if _opt(a, key, is_strlist) is not None:
                art[key] = a[key]
        secs_in = _need(a, "sections", lambda x: type(x) is list and len(x) > 0)
        sids, secs = set(), []
        for s in secs_in:
            if type(s) is not dict:
                _bad()
            sid = _need(s, "sid", is_str)
            if sid == "" or sid in sids:
                _bad()
            sids.add(sid)
            sec = {"sid": sid, "level": _need(s, "level", is_uint),
                   "role": _need(s, "role", lambda x: type(x) is str and x in ROLES),
                   "lang": _need(s, "lang", is_str), "md": _need(s, "md", is_str)}
            if _opt(s, "title", is_str) is not None:
                sec["title"] = s["title"]
            if _opt(s, "aliases", is_strlist) is not None:
                sec["aliases"] = s["aliases"]
            secs.append(sec)
        art["sections"] = secs
        out.append(art)
    return {"articles": out}


# ---------------------------------------------------------------------------------------------------------------
# lex
# ---------------------------------------------------------------------------------------------------------------


def _digits_value(digits: str) -> str:
    """The value of a string of ASCII digits as a digit string without leading zeros (no ``int()``: Python limits
    the digits it converts, and the text comes from the file)."""
    return digits.lstrip("0") or "0"


def _thousands(digits: str) -> str:
    """``n div 1000`` of the number written in ``digits``, as ``_digits_value``."""
    return _digits_value(digits[:-3])


def _decode_lex(p: Segment) -> dict:
    _header_needs(p, "lang", "group", "res", nonempty_res=True)
    group = _LEX_GROUP.fullmatch(p.h["group"])
    if not group:
        _bad()
    if "entries" not in p.h["tables"]:
        _bad()
    entries_in = p.t["entries"]
    if type(entries_in) is not list:
        _bad()
    out = []
    for e in entries_in:
        if type(e) is not dict:
            _bad()
        strong = _need(e, "strong", is_str)
        m = _STRONG.fullmatch(strong)
        if not m or m.group(1) != p.h["group"][0] or _thousands(m.group(2)) != _digits_value(p.h["group"][1:]):
            _bad()
        entry = {"res": p.res_key(_need(e, "res", is_uint)), "strong": strong, "lemma": _need(e, "lemma", is_str)}
        senses = []
        for s in _need(e, "senses", lambda x: type(x) is list):
            if type(s) is not dict:
                _bad()
            sense = {}
            for key in ("code", "definition", "domain", "domainCode", "comments", "etymology", "lang",
                        "definitionLang"):
                if _opt(s, key, is_str) is not None:
                    sense[key] = s[key]
            if _opt(s, "glosses", is_strlist) is not None:
                sense["glosses"] = s["glosses"]
            if "refs" in s:
                refs = s["refs"]
                if type(refs) is not list:
                    _bad()
                for r in refs:
                    if type(r) is not list or len(r) != 2 or not is_uint(r[0]) or not is_uint(r[1]) or r[0] > r[1]:
                        _bad()
                sense["refs"] = [list(r) for r in refs]
            senses.append(sense)
        entry["senses"] = senses
        for key in ("brief", "long", "source", "review"):
            if _opt(e, key, is_str) is not None:
                entry[key] = e[key]
        for key in ("pos", "notes"):
            if _opt(e, key, is_strlist) is not None:
                entry[key] = e[key]
        if _opt(e, "aramaic", is_bool) is not None:
            entry["aramaic"] = e["aramaic"]
        out.append(entry)
    return {"entries": out}


# ---------------------------------------------------------------------------------------------------------------
# obs
# ---------------------------------------------------------------------------------------------------------------


def _decode_obs_helps(p: Segment, name: str, strings: list[str]) -> dict:
    tab = p.table(name)
    if type(tab) is not dict:
        _bad()
    res = p.res_key(_need(tab, "res", is_uint))
    n, rows, ref_text = _common_rows(tab, strings)
    frames = uvarints(_need(tab, "frame", is_bytes))
    if len(frames) != n:
        _bad()
    seen = set()
    out = []
    for i, row in enumerate(rows):
        if row["id"] == "" or row["id"] in seen:
            _bad()
        seen.add(row["id"])
        fid = frames[i]
        text = ref_text.get(i)
        if text is None:
            story, frame = divmod(fid, 100)
            text = f"{story}:intro" if frame == 0 else f"{story}:{frame}"
        full = {"id": row["id"], "frame": text, "frameId": fid}
        if "concept" in row:
            full["concept"] = row["concept"]
        full["cols"] = row["cols"]
        out.append(full)
    return {"res": res, "rows": out}


def _decode_obs(p: Segment) -> dict:
    _header_needs(p, "lang", "res", nonempty_res=True)
    for key in REQUIRED_TABLES["obs"]:
        if key not in p.h["tables"]:
            _bad()
    strings = _strtab(p.t["strings"])
    stories_in = p.t["stories"]
    if type(stories_in) is not list:
        _bad()
    stories, numbers = [], set()
    for s in stories_in:
        if type(s) is not dict:
            _bad()
        n = _need(s, "n", is_uint)
        if n < 1 or n > 50 or n in numbers:
            _bad()
        numbers.add(n)
        story = {"res": p.res_key(_need(s, "res", is_uint)), "n": n, "title": _need(s, "title", is_str)}
        if _opt(s, "reference", is_str) is not None:
            story["reference"] = s["reference"]
        if "refs" in s:
            refs = s["refs"]
            if type(refs) is not list or not all(type(r) is list and len(r) == 2 and is_uint(r[0]) and is_uint(r[1])
                                                  for r in refs):
                _bad()
            story["refs"] = [list(r) for r in refs]
        frames, fnums = [], set()
        for f in _need(s, "frames", lambda x: type(x) is list and len(x) > 0):
            if type(f) is not dict:
                _bad()
            fn = _need(f, "n", is_uint)
            if fn > 99 or fn in fnums:
                _bad()
            fnums.add(fn)
            frame = {"n": fn, "text": _need(f, "text", is_str)}
            if _opt(f, "image", is_str) is not None:
                frame["image"] = f["image"]
            frames.append(frame)
        story["frames"] = frames
        stories.append(story)
    out = {"stories": stories}
    for name in ("notes", "questions", "links", "study-notes", "study-questions"):
        if p.has(name):
            out[name] = _decode_obs_helps(p, name, strings)
    return out


# ---------------------------------------------------------------------------------------------------------------
# catalog
# ---------------------------------------------------------------------------------------------------------------


def _hex32(x):
    if not is_bytes(x, 32):
        _bad()
    return x.hex()


def _decode_catalog(p: Segment) -> dict:
    if p.cls != "catalog":
        _bad()
    if p.h["v"] != 1:
        _bad()
    for key in REQUIRED_TABLES["catalog"]:
        if key not in p.h["tables"]:
            _bad()
    t = p.t
    a = t["about"]
    if type(a) is not dict:
        _bad()
    if _need(a, "format", is_str) != "3.0":
        _bad()
    about = {"format": "3.0", "catalog": _need(a, "catalog", is_str), "publisher": _need(a, "publisher", is_str),
             "origin": _need(a, "origin", lambda x: x in ("published", "local") and type(x) is str),
             "revision": _need(a, "revision", is_uint), "built": _need(a, "built", is_str),
             "builder": _need(a, "builder", is_str)}
    if "previous" in a:
        about["previous"] = _hex32(a["previous"])
    if _opt(a, "name", is_str) is not None:
        about["name"] = a["name"]
    if _opt(a, "direction", lambda x: type(x) is str and x in ("ltr", "rtl")) is not None:
        about["direction"] = a["direction"]
    if "lang" in p.h and p.h["lang"] != about["catalog"]:
        _bad()

    resources, keys = [], set()
    if type(t["resources"]) is not list:
        _bad()
    for r in t["resources"]:
        if type(r) is not dict:
            _bad()
        res = {k: _need(r, k, is_str) for k in ("key", "title", "subject", "release", "license")}
        if res["key"] in keys:
            _bad()
        keys.add(res["key"])
        books = _need(r, "books", lambda x: is_bytes(x, 9))
        res["books"] = books.hex()
        for k in ("rights", "attribution"):
            if _opt(r, k, is_str) is not None:
                res[k] = r[k]
        resources.append(res)

    segments, ids = [], set()
    if type(t["segments"]) is not list:
        _bad()
    for s in t["segments"]:
        if type(s) is not dict:
            _bad()
        seg = {"id": _hex32(s.get("id")), "class": _need(s, "class", lambda x: type(x) is str and x in CLASSES),
               "size": _need(s, "size", is_uint), "ulen": _need(s, "ulen", is_uint), "inputs": _hex32(s.get("inputs"))}
        if seg["id"] in ids:
            _bad()
        ids.add(seg["id"])
        if _opt(s, "book", lambda x: type(x) is str and _BOOK_CODE.fullmatch(x) is not None) is not None:
            seg["book"] = s["book"]
        if _opt(s, "part", lambda x: type(x) is str and (x == "core" or _BOOK_CODE.fullmatch(x) is not None)) \
                is not None:
            seg["part"] = s["part"]
        if _opt(s, "group", is_str) is not None:
            seg["group"] = s["group"]
        segments.append(seg)

    units, unit_ids = [], set()
    if type(t["units"]) is not list:
        _bad()
    for u in t["units"]:
        if type(u) is not dict:
            _bad()
        uid = _need(u, "id", is_str)
        if uid in unit_ids:
            _bad()
        unit_ids.add(uid)
        idx = _need(u, "segments", lambda x: type(x) is list and len(x) > 0 and all(is_uint(i) for i in x))
        if any(i >= len(segments) for i in idx):
            _bad()
        unit = {"id": uid, "segments": list(idx)}
        if _opt(u, "needs", is_strlist) is not None:
            unit["needs"] = u["needs"]
        units.append(unit)

    out = {"about": about, "resources": resources, "segments": segments, "units": units}
    if p.has("requires"):
        req = []
        if type(t["requires"]) is not list:
            _bad()
        for r in t["requires"]:
            if type(r) is not list or len(r) != 3 or not is_str(r[0]) or not is_uint(r[1]):
                _bad()
            req.append([r[0], r[1], _hex32(r[2])])
        out["requires"] = req
    if p.has("complements"):
        comps = []
        if type(t["complements"]) is not list:
            _bad()
        for c in t["complements"]:
            if type(c) is not dict:
                _bad()
            comp = {"kind": _need(c, "kind", is_str), "id": _hex32(c.get("id")), "size": _need(c, "size", is_uint),
                    "media": _need(c, "media", is_str), "version": _need(c, "version", is_str)}
            for k in ("lang", "for", "license"):
                if _opt(c, k, is_str) is not None:
                    comp[k] = c[k]
            comps.append(comp)
        out["complements"] = comps
    return out


_DECODERS = {"book": _decode_book, "orig": _decode_orig, "art": _decode_art, "lex": _decode_lex,
             "obs": _decode_obs, "catalog": _decode_catalog}


def decode_segment(p: Segment, as_class: str | None = None) -> dict:
    """Step 5: the tables of the class. Returns the reader output of a segment file.

    ``as_class`` forces the schema (a catalog of a transfer file is read against the tables of a catalog, whatever
    its own header says).
    """
    out = _DECODERS[as_class or p.cls](p)
    out["id"] = p.id
    out["h"] = jsonable(p.h)
    return out


def read_segment(data: bytes, expect_id: bytes | None = None) -> dict:
    return decode_segment(parse_segment(data, expect_id))


# ---------------------------------------------------------------------------------------------------------------
# The transfer file (transfer.md)
# ---------------------------------------------------------------------------------------------------------------


def _read_transfer(data: bytes) -> dict:
    _check_fixed(data, (2,))
    ilen = int.from_bytes(data[8:12], "big")
    if len(data) < 12 + ilen:
        _fail("E_TRUNCATED")
    try:
        index = _cbor_one(data[12:12 + ilen])
    except _TooDeep:
        _fail("E_LIMIT")
    except _Malformed:
        _fail("E_HEADER")
    if type(index) is not dict:
        _fail("E_HEADER")

    def hdr(ok: bool):
        if not ok:
            _fail("E_HEADER")

    hdr(_ints_in_range(index))
    hdr(index.get("mode") in ("full", "update") and type(index.get("mode")) is str)
    catalogs, entries = index.get("catalogs"), index.get("entries")
    hdr(type(catalogs) is list and len(catalogs) > 0 and all(is_bytes(c, 32) for c in catalogs)
        and len(set(catalogs)) == len(catalogs))
    hdr(type(entries) is list and len(entries) > 0 and all(type(e) is dict for e in entries))
    seen, total = set(), 0
    for e in entries:
        hdr(is_bytes(e.get("id"), 32) and e["id"] not in seen)
        seen.add(e["id"])
        hdr(type(e.get("kind")) is str and e["kind"] in ("segment", "complement"))
        hdr(is_uint(e.get("offset")) and is_uint(e.get("size")))
        hdr(e["offset"] == total)
        total += e["size"]
        hdr(total <= MAX_INT)
        if "class" in e:
            hdr(e["kind"] == "segment" and type(e["class"]) is str and e["class"] in CLASSES)
    position = {e["id"]: i for i, e in enumerate(entries)}
    for c in catalogs:
        i = position.get(c)
        hdr(i is not None and i < len(catalogs) and entries[i]["kind"] == "segment"
            and entries[i].get("class") == "catalog")
    if "base" in index:
        b = index["base"]
        hdr(type(b) is list and all(type(x) is list and len(x) == 2 and is_str(x[0]) and is_uint(x[1]) for x in b))
    for key in ("made", "by"):
        if key in index:
            hdr(is_str(index[key]))

    # step 4
    available = len(data) - 12 - ilen
    last_catalog = entries[len(catalogs) - 1]
    if available < last_catalog["offset"] + last_catalog["size"]:
        _fail("E_TRUNCATED")
    if available > total:
        _fail("E_TRAILING")

    # step 5
    base = 12 + ilen

    def entry_bytes(e):
        return data[base + e["offset"]:base + e["offset"] + e["size"]]

    parsed = {}
    for e in entries[:len(catalogs)]:
        parsed[e["id"]] = parse_segment(entry_bytes(e), e["id"], must_class="catalog")
    statuses = []
    for i, e in enumerate(entries):
        if e["offset"] + e["size"] > available:
            status = "missing"
        elif e["id"] in parsed:
            status = "ok"
        elif e["kind"] == "complement":
            status = "ok" if hashlib.sha256(entry_bytes(e)).digest() == e["id"] else "E_ID"
        else:
            try:
                parse_segment(entry_bytes(e), e["id"])
                status = "ok"
            except LP3Error as err:
                status = err.code
        statuses.append(status)
    # step 6
    catalog_outputs = [decode_segment(parsed[c], "catalog") for c in catalogs]

    index_out = {k: jsonable(v) for k, v in index.items() if k not in ("mode", "catalogs", "entries", "base",
                                                                         "made", "by")}
    index_out["mode"] = index["mode"]
    index_out["catalogs"] = [c.hex() for c in catalogs]
    index_out["entries"] = []
    for e in entries:
        entry = {"id": e["id"].hex(), "kind": e["kind"], "offset": e["offset"], "size": e["size"]}
        if "class" in e:
            entry["class"] = e["class"]
        index_out["entries"].append(entry)
    for key in ("base", "made", "by"):
        if key in index:
            index_out[key] = index[key]
    entries_out = []
    for e, status in zip(entries, statuses):
        o = {"id": e["id"].hex(), "kind": e["kind"], "status": status}
        if "class" in e:
            o["class"] = e["class"]
        entries_out.append(o)
    return {"index": index_out, "entries": entries_out, "catalogs": catalog_outputs}


# ---------------------------------------------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------------------------------------------


def read_file(data: bytes, expect: str | None = None) -> dict:
    """The reader output of a file: the object of tests/README.md, or ``{"error": code}``.

    ``expect`` is ``None`` (the kind byte says how to read the file), ``"segment"`` or ``"transfer"`` (any other
    kind is E_KIND).
    """
    try:
        if expect == "segment":
            return read_segment(data)
        if expect == "transfer":
            return _read_transfer(data)
        kind = _check_fixed(data, (1, 2))
        return read_segment(data) if kind == 1 else _read_transfer(data)
    except LP3Error as e:
        return {"error": e.code}


def compact_text(obj) -> str:
    """The canonical text of tests/README.md: no whitespace, keys sorted by code point, UTF-8 not escaped."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canonical_text(obj) -> str:
    """The canonical text indented by two spaces, as the ``*.expected.json`` files hold it (with a final newline).

    A rejected file is the one-line ``{"error": "<code>"}`` those files hold.
    """
    if isinstance(obj, dict) and list(obj) == ["error"]:
        return json.dumps(obj, ensure_ascii=False) + "\n"
    return json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        sys.stderr.write("usage: python lp3read.py <file>\n")
        return 2
    try:
        with open(argv[1], "rb") as f:
            data = f.read()
    except OSError as e:
        sys.stderr.write(f"lp3read: {e}\n")
        return 2
    try:
        out = read_file(data)
        text = canonical_text(out)
    except Exception as e:  # a bug of this reader, never a verdict on the file: exit 3, not 1
        sys.stderr.write(f"lp3read: internal error ({type(e).__name__}: {e}); this is a bug of the reader, "
                         "not a rejection of the file\n")
        return 3
    sys.stdout.buffer.write(text.encode("utf-8"))
    return 1 if "error" in out and list(out) == ["error"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
