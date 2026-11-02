"""Tests of lp3read, the independent reader of language pack format 3.

Run from ``packages/language-pack-v3``:  python -m pytest spec/reader-py -q

Every expected output below is written by hand from the specification (``tests/README.md``, "Reader output"); the
encoders (``uv``, ``dl``, ``column`` ...) are written from ``container.md``, "Column encodings", and the cddl files, like
``tests/container/make_examples.py``. The string tables of these files list strings in order of first use: a reader
does not depend on the order of a string table.
"""
from __future__ import annotations

import copy
import hashlib
import json
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import cbor2
import pytest

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import lp3read  # noqa: E402
from lp3read import LP3Error, canonical_text, compact_text, read_file  # noqa: E402

CONTAINER = HERE.parent / "tests" / "container"
MAGIC = bytes([0x89, 0x54, 0x4C, 0x50])
PREFIX = MAGIC + bytes([3, 0, 1, 0])
TRANSFER_PREFIX = MAGIC + bytes([3, 0, 2, 0])
RES_GLT = ["es-419_gl/es-419/glt", "v42"]
ORIG = ["unfoldingWord/el-x-koine/ugnt", "g987ab2025a"]


# ---------------------------------------------------------------------------------------------------------------
# Encoders (from container.md and cddl/)
# ---------------------------------------------------------------------------------------------------------------


def uv(values) -> bytes:
    out = bytearray()
    for n in values:
        while True:
            b = n & 0x7F
            n >>= 7
            if n:
                out.append(b | 0x80)
            else:
                out.append(b)
                break
    return bytes(out)


def zz(n: int) -> int:
    return 2 * n if n >= 0 else -2 * n - 1


def dl(values) -> bytes:
    """A ``deltas`` column."""
    prev, out = 0, []
    for v in values:
        out.append(zz(v - prev))
        prev = v
    return uv(out)


def bt(flags) -> bytes:
    """A ``bits`` column."""
    out = bytearray((len(flags) + 7) // 8)
    for i, f in enumerate(flags):
        if f:
            out[i // 8] |= 1 << (i % 8)
    return bytes(out)


def tx(strings) -> dict:
    enc = [s.encode("utf-8") for s in strings]
    return {"utf8": b"".join(enc), "len": uv(len(e) for e in enc)}


class Strings:
    """A string table filled in order of first use."""

    def __init__(self):
        self.items: list[str] = []
        self.index: dict[str, int] = {}

    def add(self, s: str) -> int:
        if s not in self.index:
            self.index[s] = len(self.items)
            self.items.append(s)
        return self.index[s]


def column(kind: str, rows: list, S: Strings | None = None) -> dict:
    """A column; ``None`` in ``rows`` is a row without value (then there is a ``has`` column)."""
    vals = [v for v in rows if v is not None]
    c = {}
    if len(vals) != len(rows):
        c["has"] = bt([v is not None for v in rows])
    if kind == "strings":
        c["strings"] = uv(S.add(v) for v in vals)
    elif kind == "texts":
        c["texts"] = tx(vals)
    elif kind == "flags":
        c["flags"] = bt(vals)
    else:
        c["uints"] = uv(vals)
    return c


def ev_col(S: Strings, events) -> bytes:
    """``events``: (absolute position, code, argument or None)."""
    out, last = [], 0
    for pos, code, arg in events:
        out += [pos - last, code, S.add(arg) if arg is not None else 0]
        last = pos
    return uv(out)


def deflate(body: bytes) -> bytes:
    c = zlib.compressobj(9, zlib.DEFLATED, -15, 9)
    return c.compress(body) + c.flush()


def inflate(comp: bytes) -> bytes:
    return zlib.decompress(comp, -15)


def enc(value) -> bytes:
    return cbor2.dumps(value, canonical=True)


class Built:
    def __init__(self, data, body, id_):
        self.data, self.body, self.id = data, body, id_


def assemble(header, comp: bytes, prefix: bytes = PREFIX, hlen: int | None = None) -> bytes:
    hb = header if isinstance(header, bytes) else enc(header)
    return prefix + struct.pack(">I", len(hb) if hlen is None else hlen) + hb + comp


def build(h: dict, t: dict, header_h=None, extra: dict | None = None, prefix: bytes = PREFIX) -> Built:
    body = enc({"h": h, "t": t})
    comp = deflate(body)
    digest = hashlib.sha256(body).digest()
    header = {"h": h if header_h is None else header_h, "codec": "deflate-raw", "clen": len(comp), "ulen": len(body),
              "id": digest}
    header.update(extra or {})
    return Built(assemble(header, comp, prefix), body, digest.hex())


def canon(obj) -> str:
    return compact_text(obj)


def ok(b: Built, expected: dict) -> None:
    """The reader's output equals ``expected`` (plus ``id``), compared as canonical text."""
    got = read_file(b.data)
    want = dict(expected)
    want["id"] = b.id
    assert canon(got) == canon(want)


def err(data: bytes, code: str, expect: str | None = None) -> None:
    assert read_file(data, expect) == {"error": code}


def header_h(h: dict) -> dict:
    """The ``h`` of the output: the logical header as the file has it."""
    return json.loads(json.dumps(h))


# ---------------------------------------------------------------------------------------------------------------
# 1. The container examples
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["minimal", "truncated", "bad-id"])
def test_container_examples(name):
    data = (CONTAINER / f"{name}.seg").read_bytes()
    # spec/.gitattributes keeps these files LF; a checkout made before it existed may still have CRLF.
    expected = (CONTAINER / f"{name}.expected.json").read_bytes().replace(b"\r\n", b"\n").decode("utf-8")
    assert canonical_text(read_file(data)) == expected
    # outputs are compared as the canonical text of the parsed value (tests/README.md)
    assert compact_text(read_file(data)) == compact_text(json.loads(expected))


def test_cli(tmp_path):
    for name, code in (("minimal", 0), ("truncated", 1), ("bad-id", 1)):
        proc = subprocess.run([sys.executable, "-X", "utf8", str(HERE / "lp3read.py"),
                               str(CONTAINER / f"{name}.seg")], capture_output=True)
        expected = (CONTAINER / f"{name}.expected.json").read_bytes().replace(b"\r\n", b"\n")
        assert proc.returncode == code
        assert proc.stdout == expected


# ---------------------------------------------------------------------------------------------------------------
# 2. Every error code, one defect each, from minimal.seg
# ---------------------------------------------------------------------------------------------------------------

MIN = (CONTAINER / "minimal.seg").read_bytes()
MIN_HLEN = int.from_bytes(MIN[8:12], "big")
MIN_HEADER = MIN[12:12 + MIN_HLEN]
MIN_COMP = MIN[12 + MIN_HLEN:]
MIN_HDR = cbor2.loads(MIN_HEADER)
MIN_BODY = inflate(MIN_COMP)
MIN_DOC = cbor2.loads(MIN_BODY)


def with_header(**changes) -> bytes:
    m = dict(MIN_HDR)
    m.update(changes)
    return assemble(m, MIN_COMP)


def min_expected(h=None, id_=None, tables_extra=None) -> dict:
    out = json.loads((CONTAINER / "minimal.expected.json").read_bytes().decode("utf-8"))
    if h is not None:
        out["h"] = h
    if id_ is not None:
        out["id"] = id_
    return out


def test_assemble_round_trip():
    assert assemble(MIN_HDR, MIN_COMP) == MIN
    assert enc(MIN_DOC) == MIN_BODY


def test_e_magic():
    d = bytearray(MIN)
    d[0] ^= 0xFF
    err(bytes(d), "E_MAGIC")


def test_e_version():
    d = bytearray(MIN)
    d[4] = 4
    err(bytes(d), "E_VERSION")


def test_e_kind():
    d = bytearray(MIN)
    d[6] = 2
    # Told to expect a segment, the reader refuses a transfer file.
    err(bytes(d), "E_KIND", expect="segment")
    # With no expectation the kind byte says how to read: kind 2 is a transfer file, whose "index" here is the
    # segment's header, which has no "mode".
    err(bytes(d), "E_HEADER")
    d[6] = 3
    err(bytes(d), "E_KIND")
    err(bytes(d), "E_KIND", expect="segment")


def test_e_kind_transfer_where_segment_expected_and_reverse():
    t = make_transfer_full()
    err(t.data, "E_KIND", expect="segment")
    err(MIN, "E_KIND", expect="transfer")


def test_e_truncated():
    err(MIN[:-1], "E_TRUNCATED")
    err(MIN[:-10], "E_TRUNCATED")
    err(MIN[:12 + MIN_HLEN], "E_TRUNCATED")          # the header only
    err(MIN[:12 + MIN_HLEN - 1], "E_TRUNCATED")      # cut inside the header


def test_e_trailing():
    err(MIN + b"\x00", "E_TRAILING")


def test_e_header_array():
    err(assemble(enc([1, 2, 3]), MIN_COMP), "E_HEADER")


@pytest.mark.parametrize("header", [
    b"",                                             # H = 0
    enc({}),                                         # a map with no keys
    enc(MIN_HDR) + b"\x00",                          # one map and one byte more
    enc(MIN_HDR)[:-3],                               # a cut map
    b"\xf6",                                         # null
    b"\xa1\x61h\xf6",                                # a null inside the header
    b"\xa2\x61h\xa0\x61h\xa0",                       # a repeated key
])
def test_e_header_shapes(header):
    err(assemble(header, MIN_COMP), "E_HEADER")


@pytest.mark.parametrize("key", ["h", "codec", "clen", "ulen", "id"])
def test_e_header_missing_key(key):
    m = dict(MIN_HDR)
    del m[key]
    err(assemble(m, MIN_COMP), "E_HEADER")


@pytest.mark.parametrize("changes", [
    {"h": [1]}, {"h": "x"}, {"codec": 7}, {"clen": -1}, {"clen": "1"}, {"clen": 1.5}, {"clen": True}, {"ulen": -5},
    {"ulen": None}, {"id": MIN_HDR["id"][:31]}, {"id": MIN_HDR["id"] + b"\x00"}, {"id": "x" * 32},
])
def test_e_header_wrong_types(changes):
    err(with_header(**changes), "E_HEADER")


def test_e_codec():
    err(with_header(codec="zstd"), "E_CODEC")
    err(with_header(codec="deflate"), "E_CODEC")


def test_e_inflate_garbage_after_the_stream():
    comp = MIN_COMP + b"\x01\x02\x03"
    err(assemble(dict(MIN_HDR, clen=len(comp)), comp), "E_INFLATE")


def test_e_inflate_cut_stream():
    comp = MIN_COMP[:-2]
    err(assemble(dict(MIN_HDR, clen=len(comp)), comp), "E_INFLATE")


@pytest.mark.parametrize("delta", [1, -1])
def test_e_inflate_wrong_ulen(delta):
    err(with_header(ulen=MIN_HDR["ulen"] + delta), "E_INFLATE")


def test_e_inflate_not_deflate():
    comp = b"\xff" * 20
    err(assemble(dict(MIN_HDR, clen=len(comp)), comp), "E_INFLATE")


def test_e_inflate_stream_larger_than_ulen():
    body = b"\x00" * 3_000_000
    comp = deflate(body)
    err(assemble(dict(MIN_HDR, clen=len(comp), ulen=12), comp), "E_INFLATE")


def test_e_id():
    err(with_header(id=bytes([MIN_HDR["id"][0] ^ 1]) + MIN_HDR["id"][1:]), "E_ID")
    err(with_header(id=bytes(32)), "E_ID")


def test_e_id_catalog_id_of_a_transfer_entry():
    # parse_segment takes the id the catalog gives and compares it too.
    with pytest.raises(LP3Error) as e:
        lp3read.parse_segment(MIN, expect_id=bytes(32))
    assert e.value.code == "E_ID"


def swap_body(body: bytes, header_changes=None) -> bytes:
    comp = deflate(body)
    header = dict(MIN_HDR, clen=len(comp), ulen=len(body), id=hashlib.sha256(body).digest())
    header.update(header_changes or {})
    return assemble(header, comp)


@pytest.mark.parametrize("body", [
    enc([1, 2]),                                     # not a map
    enc({"h": MIN_DOC["h"]}),                        # no t
    enc({"t": MIN_DOC["t"]}),                        # no h
    enc({"h": MIN_DOC["h"], "t": []}),               # t is not a map
    enc({"h": 5, "t": {}}),                          # h is not a map
    MIN_BODY + b"\x00",                              # a map and one byte more
    MIN_BODY[:-1],                                   # a cut map
    b"",                                             # nothing
    enc({"h": MIN_DOC["h"], "t": {"strings": [], "texts": [], "extra": 1}}),   # t lists a table h.tables does not
    enc({"h": dict(MIN_DOC["h"], v="1"), "t": MIN_DOC["t"]}),
    enc({"h": dict(MIN_DOC["h"], class_=1, **{"class": "nonsense"}), "t": MIN_DOC["t"]}),
    enc({"h": dict(MIN_DOC["h"], tables={"Strings": [1, True], "texts": [1, True]}), "t": MIN_DOC["t"]}),
    enc({"h": dict(MIN_DOC["h"], tables={"strings": [1, True], "texts": [1, 1]}), "t": MIN_DOC["t"]}),
    enc({"h": dict(MIN_DOC["h"], res=[["only-one"]]), "t": MIN_DOC["t"]}),
    enc({"h": dict(MIN_DOC["h"], orig="x"), "t": MIN_DOC["t"]}),
    enc({"h": dict(MIN_DOC["h"], lang=3), "t": MIN_DOC["t"]}),
    enc({"h": dict(MIN_DOC["h"], v=2 ** 60), "t": MIN_DOC["t"]}),
    b"\xa2\x61h\xa0\x61t\xf9\x3c\x00",               # a float
])
def test_e_body(body):
    err(swap_body(body), "E_BODY")


@pytest.mark.parametrize("bad", [None, cbor2.undefined, 1.5, cbor2.CBORTag(1, 0), cbor2.CBORTag(2, b"\x01"),
                                 cbor2.CBORSimpleValue(32), [1, None], {"a": 1.0}])
def test_e_body_no_float_tag_null_undefined(bad):
    # an optional table this reader does not know, holding the forbidden item: the body is still not valid
    h = json.loads(json.dumps(MIN_DOC["h"]))
    h["tables"]["future-x"] = [1, False]
    body = cbor2.dumps({"h": h, "t": dict(MIN_DOC["t"], **{"future-x": bad})}, canonical=True)
    err(swap_body(body), "E_BODY")


def test_e_body_integer_beyond_2_53():
    h = json.loads(json.dumps(MIN_DOC["h"]))
    h["tables"]["future-x"] = [1, False]
    for n in (2 ** 53, -(2 ** 53), 2 ** 64 - 1):
        err(build(h, dict(MIN_DOC["t"], **{"future-x": [n]})).data, "E_BODY")
    assert "error" not in read_file(build(h, dict(MIN_DOC["t"], **{"future-x": [2 ** 53 - 1, -(2 ** 53 - 1)]})).data)


def test_body_root_keys_beyond_h_and_t_are_ignored():
    # container.md, "Body": "Any other key of the body map is ignored and is not output".
    body = enc({"h": MIN_DOC["h"], "t": MIN_DOC["t"], "x": [1, 2]})
    expected = min_expected()
    expected["id"] = hashlib.sha256(body).hexdigest()
    assert canon(read_file(swap_body(body))) == canon(expected)


def test_e_hmismatch():
    other = dict(MIN_DOC["h"], lang="es-ES")
    # only the header's h differs; the body and the id are untouched
    err(with_header(h=other), "E_HMISMATCH")
    # a header h with a different type of value for the same number
    err(with_header(h=dict(MIN_DOC["h"], v=True)), "E_HMISMATCH")


def future_table_file(required: bool, table_name: str, value=None) -> Built:
    h = json.loads(json.dumps(MIN_DOC["h"]))
    h["tables"][table_name] = [1, required]
    t = dict(MIN_DOC["t"])
    t[table_name] = {"anything": [1, 2, 3]} if value is None else value
    return build(h, t)


def test_e_table_required_unknown():
    b = future_table_file(True, "future-y")
    err(b.data, "E_TABLE")


def test_unknown_optional_table_is_skipped():
    b = future_table_file(False, "future-x")
    expected = min_expected()
    expected["h"]["tables"]["future-x"] = [1, False]
    expected["id"] = b.id
    assert canon(read_file(b.data)) == canon(expected)


def test_known_table_with_unknown_version():
    h = json.loads(json.dumps(MIN_DOC["h"]))
    h["tables"]["texts"] = [2, True]                  # a required table at a version this reader does not know
    err(build(h, dict(MIN_DOC["t"])).data, "E_TABLE")


def test_class_without_known_tables_is_e_table():
    for cls in ("map", "xmap", "gen"):
        h = {"class": cls, "v": 1, "tables": {"future-x": [1, False]}, "lang": "es-419", "part": "core"}
        err(build(h, {"future-x": 1}).data, "E_TABLE")
        err(build({"class": cls, "v": 1, "tables": {}}, {}).data, "E_TABLE")


def test_e_limit_header_over_65536():
    header = dict(MIN_HDR, pad="x" * 70000)
    hb = enc(header)
    assert len(hb) > 65536
    err(assemble(hb, MIN_COMP), "E_LIMIT")


def test_e_limit_header_exactly_65536_is_allowed():
    pad = 65536 - len(enc(dict(MIN_HDR, pad="")))
    # a text of n bytes costs n plus its head: find the size that makes the header 65 536 bytes long
    for n in range(pad - 6, pad + 1):
        hb = enc(dict(MIN_HDR, pad="x" * n))
        if len(hb) == 65536:
            break
    assert len(hb) == 65536
    assert canon(read_file(assemble(hb, MIN_COMP))) == canon(min_expected())


def test_e_limit_h_field_before_truncation():
    err(PREFIX + struct.pack(">I", 65537), "E_LIMIT")
    err(PREFIX + struct.pack(">I", 65536), "E_TRUNCATED")
    err(PREFIX + struct.pack(">I", 2 ** 32 - 1), "E_LIMIT")


def test_e_limit_clen_ulen():
    err(with_header(clen=67108865), "E_LIMIT")
    err(with_header(ulen=67108865), "E_LIMIT")
    err(with_header(clen=2 ** 60), "E_LIMIT")
    # limits come before the file length is compared with 12 + H + clen
    err(assemble(dict(MIN_HDR, clen=67108865), b""), "E_LIMIT")


def nest(depth: int):
    v = 0
    for _ in range(depth):
        v = [v]
    return v


def test_e_limit_header_nesting():
    ok_header = dict(MIN_HDR, x=nest(63))            # the map is level 1: 63 arrays make 64 levels
    assert canon(read_file(assemble(ok_header, MIN_COMP))) == canon(min_expected())
    err(assemble(dict(MIN_HDR, x=nest(64)), MIN_COMP), "E_LIMIT")


def test_e_limit_body_nesting():
    def with_depth(d):
        h = json.loads(json.dumps(MIN_DOC["h"]))
        h["tables"]["future-x"] = [1, False]
        return build(h, dict(MIN_DOC["t"], **{"future-x": nest(d)}))
    # body (1) > t (2) > the table's arrays
    assert read_file(with_depth(62).data).get("error") is None
    err(with_depth(63).data, "E_LIMIT")


# ---- The order of checks (container.md) ----


def test_order_fixed_bytes():
    err(b"", "E_TRUNCATED")
    err(MAGIC[:3], "E_TRUNCATED")
    err(b"\x89TX", "E_MAGIC")
    err(b"\x00", "E_MAGIC")
    err(MAGIC + b"\x04", "E_VERSION")
    err(MAGIC + b"\x03\x09", "E_TRUNCATED")          # minor and reserved are not checked; the file ends before byte 12
    err(MAGIC + b"\x03\x00\x09", "E_KIND")           # the kind as soon as it is present
    err(MAGIC + b"\x04\x00\x09", "E_VERSION")        # the version comes first
    err(b"\x00" + MIN[1:6] + b"\x09" + MIN[7:], "E_MAGIC")
    err(MIN[:11], "E_TRUNCATED")
    # the minor version and the reserved byte are ignored
    d = bytearray(MIN)
    d[5], d[7] = 9, 0x55
    assert canon(read_file(bytes(d))) == canon(min_expected())


def test_order_limit_before_everything_after_the_header():
    err(PREFIX + struct.pack(">I", 70000) + b"junk", "E_LIMIT")
    # limit beats truncated and trailing
    err(assemble(dict(MIN_HDR, clen=67108865), MIN_COMP), "E_LIMIT")


def test_order_truncated_before_codec():
    d = assemble(dict(MIN_HDR, codec="zstd"), MIN_COMP)
    err(d[:-1], "E_TRUNCATED")
    err(d + b"\x00", "E_TRAILING")
    err(d, "E_CODEC")


def test_order_codec_inflate_id_body_hmismatch_table():
    junk = b"\xff" * 10
    h_other = dict(MIN_DOC["h"], lang="es-ES")
    # E_CODEC before E_INFLATE
    err(assemble(dict(MIN_HDR, codec="zstd", clen=10), junk), "E_CODEC")
    # E_INFLATE before E_ID
    err(assemble(dict(MIN_HDR, clen=10, id=bytes(32)), junk), "E_INFLATE")
    # E_ID before E_BODY
    body = enc([1])
    comp = deflate(body)
    err(assemble(dict(MIN_HDR, clen=len(comp), ulen=len(body), id=bytes(32)), comp), "E_ID")
    # E_BODY before E_HMISMATCH
    err(swap_body(body, {"h": h_other}), "E_BODY")
    # E_HMISMATCH before E_TABLE
    h = json.loads(json.dumps(MIN_DOC["h"]))
    h["tables"]["future-y"] = [1, True]
    b = build(h, dict(MIN_DOC["t"], **{"future-y": 1}), header_h=h_other)
    err(b.data, "E_HMISMATCH")
    # E_TABLE before the E_BODY of a table
    t = dict(MIN_DOC["t"], **{"future-y": 1})
    t["texts"] = "not a list"
    err(build(h, t).data, "E_TABLE")
    # and the E_BODY of the table when nothing else is wrong
    h2 = json.loads(json.dumps(MIN_DOC["h"]))
    err(build(h2, dict(MIN_DOC["t"], texts="not a list")).data, "E_BODY")


# ---------------------------------------------------------------------------------------------------------------
# 3. Classes
# ---------------------------------------------------------------------------------------------------------------

# ---- book: two texts, alignment ----


def book_align(skip_align: bool = False, all_empty_with_missing: bool = False):
    S = Strings()
    pieces0 = [("Pablo", 1), (" ", 0), ("siervo", 1), (" ", 0), ("de", 1), (" ", 0), ("Dios", 1)]
    ev0 = [(0, 0, "1"), (0, 2, "para:p"), (0, 1, "1"), (7, 3, None)]
    text0 = {"res": 0, "tok": uv(S.add(p) * 2 + w for p, w in pieces0), "ev": ev_col(S, ev0)}
    pieces1 = [("Siervo", 1), (" ", 0), ("de", 1)]
    ev1 = [(0, 0, "1"), (0, 2, "para:p"), (0, 1, "1"), (2, 2, "note:f"), (3, 3, None), (3, 3, None)]
    text1 = {"res": 1, "tok": uv(S.add(p) * 2 + w for p, w in pieces1), "ev": ev_col(S, ev1),
             "attrs": [[1, {}], [3, {"caller": "+"}]]}
    # word 0 -> [3]; word 1 -> none; word 2 -> 1, 0; word 3 -> 10, 11 (differences from the last position written
    # in the column: 3, then 1-3 = -2, 0-1 = -1, 10-0 = 10, 11-10 = 1)
    align0 = {"words": uv([1, 6, 0, 2, 3, 1, 2, 20, 2]), "missing": [[3, 56001001, "Ἰησοῦ", 1]]}
    align1 = {"words": uv([0, 0])}
    if all_empty_with_missing:
        align1 = {"words": uv([0, 0]), "missing": [[1, 56001002, "x", 2]]}
    h = {"class": "book", "v": 1,
         "tables": {"strings": [1, True], "texts": [1, True], "align": [2 if skip_align else 1, False]},
         "lang": "es-419", "book": "tit", "orig": ORIG,
         "res": [RES_GLT, ["es-419_gl/es-419/gst", "v43"]]}
    t = {"strings": S.items, "texts": [text0, text1], "align": [align0, align1]}
    if skip_align:
        t["align"] = {"from": "a later version"}
    expected = {
        "h": header_h(h),
        "texts": [
            {"res": "es-419_gl/es-419/glt",
             "pieces": [["Pablo", True], [" ", False], ["siervo", True], [" ", False], ["de", True], [" ", False],
                        ["Dios", True]],
             "events": [[0, "chapter", "1"], [0, "open", "para:p"], [0, "verse", "1"], [7, "close", ""]],
             "align": [[3], [], [1, 0], [10, 11]],
             "alignMissing": [[3, 56001001, "Ἰησοῦ", 1]]},
            {"res": "es-419_gl/es-419/gst",
             "pieces": [["Siervo", True], [" ", False], ["de", True]],
             "events": [[0, "chapter", "1"], [0, "open", "para:p"], [0, "verse", "1"], [2, "open", "note:f"],
                        [3, "close", ""], [3, "close", ""]],
             "attrs": [[1, {}], [3, {"caller": "+"}]]},
        ],
    }
    if skip_align:
        del expected["texts"][0]["align"]
        del expected["texts"][0]["alignMissing"]
    if all_empty_with_missing:
        expected["texts"][1]["align"] = [[], []]
        expected["texts"][1]["alignMissing"] = [[1, 56001002, "x", 2]]
    return build(h, t), expected, (h, t)


def test_book_two_texts_with_alignment():
    b, expected, _ = book_align()
    ok(b, expected)


def test_book_align_unknown_is_skipped_and_texts_stay():
    b, expected, _ = book_align(skip_align=True)
    ok(b, expected)
    assert "align" not in read_file(b.data)["texts"][0]


def test_book_align_all_empty_is_a_text_without_alignment_unless_missing():
    b, expected, _ = book_align(all_empty_with_missing=True)
    ok(b, expected)
    # the file has an align entry for text 1 with only k = 0: neither key
    assert "align" not in read_file(book_align()[0].data)["texts"][1]


# ---- book: notes, questions, links, quotes ----


def book_helps(skip: tuple = ()):
    S = Strings()
    h = {"class": "book", "v": 1,
         "tables": {"strings": [1, True], "texts": [1, True], "notes": [1, False], "questions": [1, False],
                    "links": [1, False], "quotes": [1, False]},
         "lang": "es-419", "book": "tit", "orig": ORIG,
         "res": [RES_GLT, ["es-419_gl/es-419/tn", "v7"], ["es-419_gl/es-419/tq", "v3"],
                 ["es-419_gl/es-419/twl", "v5"]]}
    text0 = {"res": 0, "tok": uv(S.add(p) * 2 + w for p, w in [("Pablo", 1), (", ", 0), ("siervo", 1)]),
             "ev": ev_col(S, [(0, 0, "1"), (0, 1, "1")])}

    note_ranges = [(56001001, 56001001), (56001001, 56001003), (56000000, 56000000)]
    notes = {
        "res": 1, "n": 3, "id": {"ascii4": b"a1b2e5f6c3d4"},
        "ref": {"from": dl([a for a, _ in note_ranges]), "span": uv([b - a for a, b in note_ranges])},
        "refText": [[1, "1:1,3"]],
        "concept": column("strings", ["ta:translate/figs-metaphor", "ta:translate/figs-you", None], S),
        "cols": {
            "isIntro": column("flags", [False, None, True]),   # a bit per row that has a value: 2 bits for 3 rows
            "note": column("texts", ["Hola\nmundo", "z", "Intro"]),
            "occurrence": column("uints", [None, 2, None]),
            "quote": column("strings", ["α", "… β Ἰησοῦ", None], S),
            "tags": column("strings", ["", "k", None], S),
        },
    }
    q_ranges = [(56001002, 56001004), (56002000, 56002000)]
    questions = {
        "res": 2, "n": 2, "id": {"strings": uv([S.add("q1"), S.add("q22")])},
        "ref": {"from": dl([a for a, _ in q_ranges]), "span": uv([b - a for a, b in q_ranges])},
        "cols": {"question": column("texts", ["¿Qué?", "Otra"]), "response": column("texts", ["R1", "R2"])},
    }
    l_ranges = [(56001001, 56001001), (56001012, 56002003)]
    links = {
        "res": 3, "n": 2, "id": {"ascii4": b"l1l2l3l4"},
        "ref": {"from": dl([a for a, _ in l_ranges]), "span": uv([b - a for a, b in l_ranges])},
        "concept": column("strings", ["tw:kt/grace", "tw:kt/faith"], S),
        "cols": {"occurrence": column("strings", ["1", "1"], S), "quote": column("strings", ["α β", "γ"], S)},
    }
    # positions + 1, as differences: notes rows [3], [-1, 5, -1], []; links rows [7, 8], [20]
    quotes = {
        "notes": {"n": uv([1, 3, 0]), "pos": dl([4, 0, 6, 0]),
                  "kinds": [[1, 0, "ellipsis"]], "missing": [[1, 2, 56001003, "Ἰησοῦ", 1]]},
        "links": {"n": uv([2, 1]), "pos": dl([8, 9, 21])},
    }
    t = {"strings": S.items, "texts": [text0], "notes": notes, "questions": questions, "links": links,
         "quotes": quotes}
    for name in skip:
        h["tables"][name] = [2, False]
        t[name] = {"a": "later version"}

    note_rows = [
        {"id": "a1b2", "ref": "1:1", "from": 56001001, "to": 56001001, "concept": "ta:translate/figs-metaphor",
         "cols": {"isIntro": False, "note": "Hola\nmundo", "quote": "α", "tags": ""}, "quote": [3]},
        {"id": "e5f6", "ref": "1:1,3", "from": 56001001, "to": 56001003, "concept": "ta:translate/figs-you",
         "cols": {"note": "z", "occurrence": "2", "quote": "… β Ἰησοῦ", "tags": "k"},
         "quote": [-1, 5, -1], "quoteKinds": [[0, "ellipsis"]], "quoteMissing": [[2, 56001003, "Ἰησοῦ", 1]]},
        {"id": "c3d4", "ref": "front:intro", "from": 56000000, "to": 56000000,
         "cols": {"isIntro": True, "note": "Intro"}, "quote": []},
    ]
    link_rows = [
        {"id": "l1l2", "ref": "1:1", "from": 56001001, "to": 56001001, "concept": "tw:kt/grace",
         "cols": {"occurrence": "1", "quote": "α β"}, "quote": [7, 8]},
        {"id": "l3l4", "ref": "1:12-2:3", "from": 56001012, "to": 56002003, "concept": "tw:kt/faith",
         "cols": {"occurrence": "1", "quote": "γ"}, "quote": [20]},
    ]
    question_rows = [
        {"id": "q1", "ref": "1:2-4", "from": 56001002, "to": 56001004, "cols": {"question": "¿Qué?", "response": "R1"}},
        {"id": "q22", "ref": "2:intro", "from": 56002000, "to": 56002000, "cols": {"question": "Otra", "response": "R2"}},
    ]
    expected = {
        "h": header_h(h),
        "texts": [{"res": "es-419_gl/es-419/glt", "pieces": [["Pablo", True], [", ", False], ["siervo", True]],
                   "events": [[0, "chapter", "1"], [0, "verse", "1"]]}],
        "notes": {"res": "es-419_gl/es-419/tn", "rows": note_rows},
        "questions": {"res": "es-419_gl/es-419/tq", "rows": question_rows},
        "links": {"res": "es-419_gl/es-419/twl", "rows": link_rows},
    }
    if "quotes" in skip:
        for rows in (note_rows, link_rows):
            for r in rows:
                for k in ("quote", "quoteKinds", "quoteMissing"):
                    r.pop(k, None)
    for name in ("notes", "questions", "links"):
        if name in skip:
            del expected[name]
    return build(h, t), expected, (h, t)


def test_book_notes_questions_links_with_quotes():
    b, expected, _ = book_helps()
    ok(b, expected)


@pytest.mark.parametrize("skip", [("quotes",), ("notes",), ("links",), ("questions",), ("notes", "quotes"),
                                  ("notes", "questions", "links", "quotes")])
def test_book_unknown_optional_tables_and_what_depends_on_them(skip):
    b, expected, _ = book_helps(skip)
    ok(b, expected)


def test_book_links_lose_quotes_when_links_is_unknown_but_notes_keep_theirs():
    b, expected, _ = book_helps(("links",))
    out = read_file(b.data)
    assert "links" not in out
    assert out["notes"]["rows"][1]["quote"] == [-1, 5, -1]


def test_quote_piece_without_position_that_is_in_neither_list_is_e_body():
    # tests/README.md, "Checks of the tables": a -1 position of a quote that is in neither list is E_BODY.
    for drop in (("kinds",), ("missing",), ("kinds", "missing")):
        b, expected, (h, t) = book_helps()
        for k in drop:
            del t["quotes"]["notes"][k]
        err(build(h, t).data, "E_BODY")
    # and a -1 that is in both lists is E_BODY too ("listed twice")
    b, expected, (h, t) = book_helps()
    t["quotes"]["notes"]["missing"].append([1, 0, 56001001, "x", 1])
    err(build(h, t).data, "E_BODY")
    # the file of the fixture has every -1 listed once
    ok(*book_helps()[:2])


def test_book_quotes_without_notes_or_links_are_ignored():
    # quotes depends on notes and/or links: with neither table, its entries have no rows to go to
    b, expected, (h, t) = book_helps()
    for name in ("notes", "questions", "links"):
        del h["tables"][name]
        del t[name]
        del expected[name]
    expected["h"] = header_h(h)
    ok(build(h, t), expected)


def test_book_with_no_text_and_notes():
    S = Strings()
    h = {"class": "book", "v": 1,
         "tables": {"strings": [1, True], "texts": [1, True], "notes": [1, False]},
         "lang": "es-419", "book": "tit", "orig": ORIG, "res": [["es-419_gl/es-419/tn", "v7"]]}
    notes = {"res": 0, "n": 1, "id": {"ascii4": b"a1b2"},
             "ref": {"from": dl([56001001]), "span": uv([0])},
             "cols": {"note": column("texts", ["x"])}}
    t = {"strings": S.items, "texts": [], "notes": notes}
    ok(build(h, t), {"h": header_h(h), "texts": [],
                     "notes": {"res": "es-419_gl/es-419/tn",
                               "rows": [{"id": "a1b2", "ref": "1:1", "from": 56001001, "to": 56001001,
                                         "cols": {"note": "x"}}]}})


def test_book_empty_helps_table_and_empty_column_rows():
    h = {"class": "book", "v": 1,
         "tables": {"strings": [1, True], "texts": [1, True], "notes": [1, False], "quotes": [1, False]},
         "lang": "es-419", "book": "tit", "orig": ORIG, "res": [["es-419_gl/es-419/tn", "v7"]]}
    notes = {"res": 0, "n": 0, "id": {"ascii4": b""}, "ref": {"from": b"", "span": b""}, "cols": {}}
    t = {"strings": [], "texts": [], "notes": notes, "quotes": {"notes": {"n": b"", "pos": b""}}}
    ok(build(h, t), {"h": header_h(h), "texts": [], "notes": {"res": "es-419_gl/es-419/tn", "rows": []}})


def test_book_row_cols_empty_when_no_column_has_the_row():
    h = {"class": "book", "v": 1, "tables": {"strings": [1, True], "texts": [1, True], "notes": [1, False]},
         "lang": "es-419", "book": "tit", "orig": ORIG, "res": [["es-419_gl/es-419/tn", "v7"]]}
    notes = {"res": 0, "n": 1, "id": {"ascii4": b"zzzz"}, "ref": {"from": dl([56001001]), "span": uv([0])},
             "cols": {"note": column("texts", [None])}}
    ok(build(h, {"strings": [], "texts": [], "notes": notes}),
       {"h": header_h(h), "texts": [],
        "notes": {"res": "es-419_gl/es-419/tn",
                  "rows": [{"id": "zzzz", "ref": "1:1", "from": 56001001, "to": 56001001, "cols": {}}]}})


# ---- book: E_BODY checks of the tables ----


def mutate(fn, fixture=book_helps):
    built = fixture()
    h, t = built[2]
    fn(h, t)
    return build(h, t).data


BOOK_MUTATIONS = {
    "tok not minimal": lambda h, t: t["texts"][0].update(tok=b"\x80\x00"),
    "tok cut short": lambda h, t: t["texts"][0].update(tok=b"\x80"),
    "tok number over 8 bytes": lambda h, t: t["texts"][0].update(tok=b"\xff" * 8 + b"\x01"),
    "tok number above 2^53-1": lambda h, t: t["texts"][0].update(tok=uv([2 ** 53])),
    "tok piece outside strings": lambda h, t: t["texts"][0].update(tok=uv([2 * 999])),
    "ev not a multiple of 3": lambda h, t: t["texts"][0].update(ev=uv([0, 0])),
    "ev code 4": lambda h, t: t["texts"][0].update(ev=uv([0, 4, 0])),
    "ev argument outside strings": lambda h, t: t["texts"][0].update(ev=uv([0, 0, 999])),
    "ev close with an argument": lambda h, t: t["texts"][0].update(ev=uv([0, 3, 1])),
    "ev beyond the pieces": lambda h, t: t["texts"][0].update(ev=uv([4, 3, 0])),
    "res outside h.res": lambda h, t: t["texts"][0].update(res=9),
    "attrs on a missing event": lambda h, t: t["texts"][0].update(attrs=[[2, {"a": "b"}]]),
    "attrs twice": lambda h, t: t["texts"][0].update(attrs=[[0, {"a": "b"}], [0, {}]]),
    "attrs value not text": lambda h, t: t["texts"][0].update(attrs=[[0, {"a": 1}]]),
    "texts not a list": lambda h, t: t.update(texts={}),
    "strings not text": lambda h, t: t.update(strings=[1]),
    "bits wrong length": lambda h, t: t["notes"]["cols"]["isIntro"].update(has=b"\x05\x00"),
    "bits unused bit set": lambda h, t: t["notes"]["cols"]["isIntro"].update(has=b"\x0d"),
    "texts lengths do not add up": lambda h, t: t["notes"]["cols"]["note"]["texts"].update(len=uv([1, 1, 1])),
    "texts not UTF-8": lambda h, t: t["notes"]["cols"]["note"].update(texts={"utf8": b"\xff\xfe\xfd", "len": uv([1, 1, 1])}),
    "texts string cut inside a character": lambda h, t: t["notes"]["cols"]["note"].update(
        texts={"utf8": "éa".encode(), "len": uv([1, 1, 1])}),
    "column with two kinds": lambda h, t: t["notes"]["cols"]["tags"].update(texts=tx(["", "k"])),
    "column with no kind": lambda h, t: t["notes"]["cols"].update(tags={"has": bt([True, True, False])}),
    "column with too many values": lambda h, t: t["notes"]["cols"]["tags"].update(strings=uv([0, 1, 2])),
    "column string outside strings": lambda h, t: t["notes"]["cols"]["tags"].update(strings=uv([0, 999])),
    "flags values not per row that has one": lambda h, t: t["notes"]["cols"]["isIntro"].update(flags=bt([0, 1, 1])),
    "concept is flags": lambda h, t: t["notes"].update(concept={"flags": bt([True, False, True])}),
    "ascii4 wrong length": lambda h, t: t["notes"].update(id={"ascii4": b"a1b2e5f6c3d"}),
    "ascii4 byte above 127": lambda h, t: t["notes"].update(id={"ascii4": b"a1b2e5f6c3\xc3\xa9"}),
    "id strings wrong count": lambda h, t: t["questions"].update(id={"strings": uv([0])}),
    "id with both forms": lambda h, t: t["links"].update(id={"ascii4": b"l1l2l3l4", "strings": uv([0, 1])}),
    "ref.from wrong count": lambda h, t: t["notes"]["ref"].update(**{"from": dl([1, 2])}),
    "ref.span wrong count": lambda h, t: t["notes"]["ref"].update(span=uv([0, 0])),
    "ref.from leaves the range": lambda h, t: t["notes"]["ref"].update(**{"from": dl([5, -4, 5])}),
    "refText row outside": lambda h, t: t["notes"].update(refText=[[3, "x"]]),
    "refText row twice": lambda h, t: t["notes"].update(refText=[[1, "x"], [1, "y"]]),
    "no canonical text (other book)": lambda h, t: t["links"].update(
        ref={"from": dl([56001001, 57001001]), "span": uv([0, 0])}),
    "no canonical text (verse of chapter 0)": lambda h, t: t["links"].update(
        ref={"from": dl([56000003, 56001001]), "span": uv([0, 0])}),
    "no canonical text (intro inside a range)": lambda h, t: t["links"].update(
        ref={"from": dl([56001000, 56001001]), "span": uv([5, 0])}),
    "quotes n wrong count": lambda h, t: t["quotes"]["notes"].update(n=uv([1, 3])),
    "quotes pos wrong count": lambda h, t: t["quotes"]["notes"].update(pos=dl([4, 0, 6])),
    "quotes position below 0": lambda h, t: t["quotes"]["notes"].update(pos=dl([4, -1, 6, 0])),
    "kinds piece outside": lambda h, t: t["quotes"]["notes"].update(kinds=[[1, 3, "ellipsis"]]),
    "kinds row outside": lambda h, t: t["quotes"]["notes"].update(kinds=[[7, 0, "ellipsis"]]),
    "kinds on a piece with a position": lambda h, t: t["quotes"]["notes"].update(kinds=[[1, 1, "ellipsis"]]),
    "kinds twice": lambda h, t: t["quotes"]["notes"].update(kinds=[[1, 0, "a"], [1, 0, "b"]]),
    "missing on a piece with a position": lambda h, t: t["quotes"]["notes"].update(
        missing=[[1, 1, 56001003, "x", 1]]),
    "piece in kinds and in missing": lambda h, t: t["quotes"]["notes"].update(
        kinds=[[1, 0, "ellipsis"]], missing=[[1, 0, 56001003, "x", 1]]),
    "header without lang": lambda h, t: (h.pop("lang"), None)[1],
    "header with an empty res": lambda h, t: h.update(res=[]),
    "header with a bad book code": lambda h, t: h.update(book="Titus"),
    "header with v 2": lambda h, t: h.update(v=2),
    "required table missing": lambda h, t: (h["tables"].pop("strings"), t.pop("strings"), None)[2],
}


@pytest.mark.parametrize("name", list(BOOK_MUTATIONS))
def test_book_tables_that_do_not_match_their_schema(name):
    err(mutate(BOOK_MUTATIONS[name]), "E_BODY")


def test_book_mutations_start_from_a_valid_file():
    b, expected, _ = book_helps()
    ok(b, expected)


ALIGN_MUTATIONS = {
    "align with a number of entries other than texts": lambda h, t: t.update(align=[t["align"][0]]),
    "words with numbers left over": lambda h, t: t["align"][1].update(words=uv([0, 0, 0])),
    "words short": lambda h, t: t["align"][0].update(words=uv([1, 6, 0, 2, 3, 1, 2, 20])),
    "k larger than the column": lambda h, t: t["align"][1].update(words=uv([5, 0])),
    "negative position": lambda h, t: t["align"][1].update(words=uv([1, zz(-1), 0])),
    "missing word outside the text": lambda h, t: t["align"][0].update(missing=[[4, 1, "x", 1]]),
    "align not a list": lambda h, t: t.update(align={}),
}


@pytest.mark.parametrize("name", list(ALIGN_MUTATIONS))
def test_book_align_that_does_not_match_its_schema(name):
    b, _, _ = book_align()
    doc = cbor2.loads(b.body)
    ALIGN_MUTATIONS[name](doc["h"], doc["t"])
    err(build(doc["h"], doc["t"]).data, "E_BODY")


# ---- orig ----


def orig_fixture(macula: str = "full"):
    forms = ["Παῦλος", "δοῦλος", "Θεοῦ"]
    words = {
        "form": forms, "lemma": ["Παῦλος", "δοῦλος", "Θεός"], "strong": ["G39720", "G14010", "G23160"],
        "morph": ["Gr,N,,,,,NMS,", ""],
        "cols": {"form": uv([0, 1, 2]), "lemma": uv([0, 1, 2]), "strong": uv([0, 1, 2]), "morph": uv([0, 0, 1])},
        "other": [[1, {"ketiv": "a", "qere": "b"}], [2, {}]],
    }
    seps = ["1", " ", "para:p"]
    # tok: 0 is the next word, n is seps[n - 1]; events: the argument is seps[arg] (no "- 1")
    text = {"seps": seps, "tok": uv([0, 2, 0, 2, 0]), "ev": uv([0, 0, 0, 0, 2, 2, 0, 1, 0, 5, 3, 0]),
            "attrs": [[1, {"x": "y"}]]}
    h = {"class": "orig", "v": 1, "tables": {"words": [1, True], "text": [1, True]}, "book": "tit",
         "orig": ["unfoldingWord/el-x-koine/ugnt", "g987ab2025a"]}
    t = {"words": words, "text": text}
    expected = {
        "h": header_h(h),
        "words": [
            {"form": "Παῦλος", "lemma": "Παῦλος", "strong": "G39720", "morph": "Gr,N,,,,,NMS,"},
            {"form": "δοῦλος", "lemma": "δοῦλος", "strong": "G14010", "morph": "Gr,N,,,,,NMS,",
             "other": {"ketiv": "a", "qere": "b"}},
            {"form": "Θεοῦ", "lemma": "Θεός", "strong": "G23160", "morph": "", "other": {}},
        ],
        "pieces": [["Παῦλος", True], [" ", False], ["δοῦλος", True], [" ", False], ["Θεοῦ", True]],
        "events": [[0, "chapter", "1"], [0, "open", "para:p"], [0, "verse", "1"], [5, "close", ""]],
        "attrs": [[1, {"x": "y"}]],
    }
    if macula != "none":
        h["tables"]["macula"] = [2 if macula == "unknown" else 1, False]
        expected["h"] = header_h(h)
        if macula == "unknown":
            t["macula"] = {"future": 1}
        else:
            t["macula"] = {"release": "v1.2", "trees": {"b": b"\x01\xff", "a": [1, True, "x", {"k": -3}]},
                           "referents": [b"", 7]}
            expected["macula"] = {"release": "v1.2", "trees": {"a": [1, True, "x", {"k": -3}], "b": "01ff"},
                                  "referents": ["", 7]}
    return build(h, t), expected, (h, t)


def test_orig_with_other_attributes_and_macula():
    b, expected, _ = orig_fixture()
    ok(b, expected)


def test_orig_without_macula():
    b, expected, _ = orig_fixture("none")
    ok(b, expected)
    assert "macula" not in read_file(b.data)


def test_orig_macula_unknown_is_skipped():
    b, expected, _ = orig_fixture("unknown")
    ok(b, expected)


def test_orig_macula_with_only_a_release():
    _, expected, (h, t) = orig_fixture()
    t["macula"] = {"release": "r"}
    expected["macula"] = {"release": "r"}
    ok(build(h, t), expected)


def test_orig_no_attrs_when_the_list_is_empty():
    _, expected, (h, t) = orig_fixture("none")
    t["text"]["attrs"] = []
    del expected["attrs"]
    ok(build(h, t), expected)


ORIG_MUTATIONS = {
    "cols of different lengths": lambda h, t: t["words"]["cols"].update(morph=uv([0, 0])),
    "number outside a word table": lambda h, t: t["words"]["cols"].update(form=uv([0, 1, 3])),
    "other word outside": lambda h, t: t["words"].update(other=[[3, {}]]),
    "other not text": lambda h, t: t["words"].update(other=[[0, {"a": 1}]]),
    "fewer word pieces than words": lambda h, t: t["text"].update(tok=uv([0, 2, 0])),
    "more word pieces than words": lambda h, t: t["text"].update(tok=uv([0, 0, 0, 0])),
    "separator outside seps": lambda h, t: t["text"].update(tok=uv([0, 9, 0, 2, 0])),
    "event argument outside seps": lambda h, t: t["text"].update(ev=uv([0, 0, 3])),
    "event beyond the pieces": lambda h, t: t["text"].update(ev=uv([6, 3, 0])),
    "attrs on a missing event": lambda h, t: t["text"].update(attrs=[[4, {}]]),
    "macula.release not text": lambda h, t: t["macula"].update(release=3),
    "macula without release": lambda h, t: t["macula"].pop("release"),
    "header without book": lambda h, t: h.pop("book"),
    "header without orig": lambda h, t: h.pop("orig"),
}


@pytest.mark.parametrize("name", list(ORIG_MUTATIONS))
def test_orig_tables_that_do_not_match_their_schema(name):
    _, _, (h, t) = orig_fixture()
    ORIG_MUTATIONS[name](h, t)
    err(build(h, t).data, "E_BODY")


def test_orig_macula_with_a_float_is_e_body():
    _, _, (h, t) = orig_fixture()
    err(build(h, dict(t, macula={"release": "r", "trees": 1.5})).data, "E_BODY")
    err(build(h, dict(t, macula={"release": "r", "referents": [None]})).data, "E_BODY")


# ---- art ----


def art_fixture():
    h = {"class": "art", "v": 1, "tables": {"articles": [1, True]}, "lang": "es-419", "group": "tw:kt",
         "res": [["es-419_gl/es-419/tw", "v1"], ["es-419_obt/es-419/tw", "v2"]]}
    articles = [
        {"id": "tw:kt/grace", "res": 0, "title": "Gracia", "aliases": ["tw:other/grace"],
         "sections": [
             {"sid": "intro", "level": 0, "role": "intro", "lang": "es-419", "md": "Texto <sup>1</sup>"},
             {"sid": "definition", "level": 2, "role": "definition", "title": "Definición", "lang": "es-419",
              "md": "Es el favor [[tw:kt/love]]", "aliases": ["def"]}]},
        {"id": "tw:kt/love", "res": 1, "title": "Amor", "subtitle": "¿Qué es?", "related": ["tw:kt/grace"],
         "sections": [{"sid": "s1", "level": 3, "role": "unknown", "lang": "en", "md": ""}]},
    ]
    expected = {
        "h": header_h(h),
        "articles": [
            {"id": "tw:kt/grace", "res": "es-419_gl/es-419/tw", "title": "Gracia", "aliases": ["tw:other/grace"],
             "sections": [
                 {"sid": "intro", "level": 0, "role": "intro", "lang": "es-419", "md": "Texto <sup>1</sup>"},
                 {"sid": "definition", "level": 2, "role": "definition", "title": "Definición", "lang": "es-419",
                  "md": "Es el favor [[tw:kt/love]]", "aliases": ["def"]}]},
            {"id": "tw:kt/love", "res": "es-419_obt/es-419/tw", "title": "Amor", "subtitle": "¿Qué es?",
             "related": ["tw:kt/grace"],
             "sections": [{"sid": "s1", "level": 3, "role": "unknown", "lang": "en", "md": ""}]},
        ],
    }
    return build(h, {"articles": articles}), expected, (h, {"articles": articles})


def test_art_group_with_sections():
    b, expected, _ = art_fixture()
    ok(b, expected)


def test_art_ignores_keys_the_schema_does_not_list():
    _, expected, (h, t) = art_fixture()
    t["articles"][0]["future"] = 1
    t["articles"][0]["sections"][0]["future"] = [1]
    ok(build(h, t), expected)


ART_MUTATIONS = {
    "empty article id": lambda h, t: t["articles"][0].update(id=""),
    "article without sections": lambda h, t: t["articles"][0].update(sections=[]),
    "role not in the list": lambda h, t: t["articles"][0]["sections"][0].update(role="summary"),
    "empty sid": lambda h, t: t["articles"][0]["sections"][0].update(sid=""),
    "sid twice": lambda h, t: t["articles"][0]["sections"][1].update(sid="intro"),
    "id twice": lambda h, t: t["articles"][1].update(id="tw:kt/grace"),
    "res outside": lambda h, t: t["articles"][1].update(res=2),
    "level not a number": lambda h, t: t["articles"][0]["sections"][0].update(level="0"),
    "md missing": lambda h, t: t["articles"][0]["sections"][0].pop("md"),
    "header without group": lambda h, t: h.pop("group"),
    "header with an empty res": lambda h, t: h.update(res=[]),
}


@pytest.mark.parametrize("name", list(ART_MUTATIONS))
def test_art_tables_that_do_not_match_their_schema(name):
    _, _, (h, t) = art_fixture()
    ART_MUTATIONS[name](h, t)
    err(build(h, t).data, "E_BODY")


# ---- lex ----


def lex_fixture():
    h = {"class": "lex", "v": 1, "tables": {"entries": [1, True]}, "lang": "es-419", "group": "G5",
         "res": [["es-419_gl/es-419/ugl", "v1"]]}
    entries = [
        {"res": 0, "strong": "G5485", "lemma": "χάρις", "brief": "favor", "long": "favor, gracia",
         "pos": ["noun"], "notes": ["n1", "n2"], "aramaic": False, "source": "en_uhl", "review": "pending",
         "senses": [{"code": "1", "definition": "d", "glosses": ["grace", "favor"], "domain": "Kindness",
                     "domainCode": "88.66", "comments": "c", "etymology": "e", "lang": "en", "definitionLang": "en",
                     "refs": [[56002011, 56002011], [60005005, 60005012]]}, {}]},
        {"res": 0, "strong": "G5486a", "lemma": "χαρίζομαι", "senses": []},
    ]
    expected = {
        "h": header_h(h),
        "entries": [
            {"res": "es-419_gl/es-419/ugl", "strong": "G5485", "lemma": "χάρις", "brief": "favor",
             "long": "favor, gracia", "pos": ["noun"], "notes": ["n1", "n2"], "aramaic": False, "source": "en_uhl",
             "review": "pending",
             "senses": [{"code": "1", "definition": "d", "glosses": ["grace", "favor"], "domain": "Kindness",
                         "domainCode": "88.66", "comments": "c", "etymology": "e", "lang": "en",
                         "definitionLang": "en", "refs": [[56002011, 56002011], [60005005, 60005012]]}, {}]},
            {"res": "es-419_gl/es-419/ugl", "strong": "G5486a", "lemma": "χαρίζομαι", "senses": []},
        ],
    }
    return build(h, {"entries": entries}), expected, (h, {"entries": entries})


def test_lex_group_with_senses_and_refs():
    b, expected, _ = lex_fixture()
    ok(b, expected)


def test_lex_huge_digit_strings_are_e_body_and_never_raise():
    # Python 3.11 refuses int() of more than 4300 digits: the reader must not convert text of the file
    for strong, group in (("G" + "5" * 5000, "G5"), ("G5" + "0" * 5000, "G5"), ("G5485", "G" + "5" * 5000),
                          ("G" + "9" * 5000, "G" + "9" * 4999)):
        _, _, (h, t) = lex_fixture()
        t["entries"][0]["strong"] = strong
        t["entries"][1]["strong"] = "G5486a"
        h["group"] = group
        err(build(h, t).data, "E_BODY")
    # a group and a Strong number with the same huge thousands are fine, and leading zeros do not count
    _, expected, (h, t) = lex_fixture()
    big = "1" * 5000
    h["group"] = "G" + big
    t["entries"] = [{"res": 0, "strong": "G" + big + "485", "lemma": "x", "senses": []}]
    out = read_file(build(h, t).data)
    assert "error" not in out and out["entries"][0]["strong"] == "G" + big + "485"
    _, expected, (h, t) = lex_fixture()
    h["group"] = "G0005"
    t["entries"] = [{"res": 0, "strong": "G05485", "lemma": "x", "senses": []}]
    assert "error" not in read_file(build(h, t).data)


def test_lex_aramaic_true_and_other_group_letter():
    _, expected, (h, t) = lex_fixture()
    t["entries"][1]["aramaic"] = True
    expected["entries"][1]["aramaic"] = True
    ok(build(h, t), expected)


LEX_MUTATIONS = {
    "strong not G or H and a number": lambda h, t: t["entries"][0].update(strong="X5485"),
    "strong without a number": lambda h, t: t["entries"][0].update(strong="G"),
    "strong of another group": lambda h, t: t["entries"][0].update(strong="G6000"),
    "strong of another letter": lambda h, t: t["entries"][0].update(strong="H5485"),
    "refs pair backwards": lambda h, t: t["entries"][0]["senses"][0].update(refs=[[56002011, 56002010]]),
    "refs pair of three": lambda h, t: t["entries"][0]["senses"][0].update(refs=[[1, 2, 3]]),
    "aramaic not a bool": lambda h, t: t["entries"][0].update(aramaic=0),
    "senses missing": lambda h, t: t["entries"][1].pop("senses"),
    "header group not [GH] digits": lambda h, t: h.update(group="tw:kt"),
    "header without lang": lambda h, t: h.pop("lang"),
}


@pytest.mark.parametrize("name", list(LEX_MUTATIONS))
def test_lex_tables_that_do_not_match_their_schema(name):
    _, _, (h, t) = lex_fixture()
    LEX_MUTATIONS[name](h, t)
    err(build(h, t).data, "E_BODY")


# ---- obs ----


def obs_fixture(skip: tuple = ()):
    S = Strings()
    h = {"class": "obs", "v": 1,
         "tables": {"strings": [1, True], "stories": [1, True], "notes": [1, False], "questions": [1, False]},
         "lang": "es-419", "res": [["es-419_gl/es-419/obs", "v1"], ["es-419_gl/es-419/obs-tn", "v2"]]}
    stories = [
        {"res": 0, "n": 1, "title": "La creación", "frames": [{"n": 1, "text": "x"}]},
        {"res": 0, "n": 10, "title": "Diez", "reference": "Una historia bíblica tomada de: Génesis 1-2",
         "refs": [[1001001, 1002025]],
         "frames": [{"n": 0, "text": "Title"}, {"n": 1, "text": "a", "image": "https://x/1.jpg"},
                    {"n": 3, "text": "b"}]},
    ]
    notes = {
        "res": 1, "n": 3, "id": {"ascii4": b"ab12cd34ef56"}, "frame": uv([1003, 1003, 1000]),
        "refText": [[1, "10:03"]],
        "concept": column("strings", ["ta:translate/figs-metaphor", None, None], S),
        "cols": {"isIntro": column("flags", [False, False, True]),
                 "note": column("texts", ["A figure.", "padded", "Intro"])},
    }
    questions = {"res": 1, "n": 1, "id": {"strings": uv([S.add("q-1")])}, "frame": uv([1]),
                 "cols": {"question": column("texts", ["¿Quién?"])}}
    t = {"strings": S.items, "stories": stories, "notes": notes, "questions": questions}
    for name in skip:
        h["tables"][name] = [2, False]
        t[name] = {"later": True}
    expected = {
        "h": header_h(h),
        "stories": [
            {"res": "es-419_gl/es-419/obs", "n": 1, "title": "La creación", "frames": [{"n": 1, "text": "x"}]},
            {"res": "es-419_gl/es-419/obs", "n": 10, "title": "Diez",
             "reference": "Una historia bíblica tomada de: Génesis 1-2", "refs": [[1001001, 1002025]],
             "frames": [{"n": 0, "text": "Title"}, {"n": 1, "text": "a", "image": "https://x/1.jpg"},
                        {"n": 3, "text": "b"}]},
        ],
        "notes": {"res": "es-419_gl/es-419/obs-tn", "rows": [
            {"id": "ab12", "frame": "10:3", "frameId": 1003, "concept": "ta:translate/figs-metaphor",
             "cols": {"isIntro": False, "note": "A figure."}},
            {"id": "cd34", "frame": "10:03", "frameId": 1003, "cols": {"isIntro": False, "note": "padded"}},
            {"id": "ef56", "frame": "10:intro", "frameId": 1000, "cols": {"isIntro": True, "note": "Intro"}},
        ]},
        "questions": {"res": "es-419_gl/es-419/obs-tn", "rows": [
            {"id": "q-1", "frame": "0:1", "frameId": 1, "cols": {"question": "¿Quién?"}}]},
    }
    for name in skip:
        del expected[name]
    return build(h, t), expected, (h, t)


def test_obs_story_frames_and_a_note_on_10_3():
    b, expected, _ = obs_fixture()
    ok(b, expected)
    rows = read_file(b.data)["notes"]["rows"]
    assert "ref" not in rows[0] and "from" not in rows[0] and "to" not in rows[0]


@pytest.mark.parametrize("skip", [("notes",), ("questions",), ("notes", "questions")])
def test_obs_unknown_help_tables_are_skipped(skip):
    b, expected, _ = obs_fixture(skip)
    ok(b, expected)


OBS_MUTATIONS = {
    "story number 0": lambda h, t: t["stories"][0].update(n=0),
    "story number 51": lambda h, t: t["stories"][0].update(n=51),
    "story number twice": lambda h, t: t["stories"][1].update(n=1),
    "story without a frame": lambda h, t: t["stories"][0].update(frames=[]),
    "frame 100": lambda h, t: t["stories"][0]["frames"][0].update(n=100),
    "frame twice": lambda h, t: t["stories"][1]["frames"][1].update(n=0),
    "empty id": lambda h, t: (t["strings"].append(""), t["notes"].update(
        id={"strings": uv([len(t["strings"]) - 1, 0, 0])}), None)[2],
    "id twice": lambda h, t: t["notes"].update(id={"ascii4": b"ab12ab12ef56"}),
    "id strings wrong count": lambda h, t: t["questions"].update(id={"strings": uv([0, 0])}),
    "concept is flags": lambda h, t: t["notes"].update(concept={"flags": bt([True, False, False])}),
    "frame column of another length": lambda h, t: t["notes"].update(frame=uv([1003, 1003])),
    "header without lang": lambda h, t: h.pop("lang"),
    "required stories missing": lambda h, t: (h["tables"].pop("stories"), t.pop("stories"), None)[2],
}


@pytest.mark.parametrize("name", list(OBS_MUTATIONS))
def test_obs_tables_that_do_not_match_their_schema(name):
    _, _, (h, t) = obs_fixture()
    OBS_MUTATIONS[name](h, t)
    err(build(h, t).data, "E_BODY")


# ---- catalog ----


def sha(label: str) -> bytes:
    return hashlib.sha256(label.encode()).digest()


def catalog_fixture(lang="es-419", with_sig=True, rev=4, tables_extra=None):
    tables = {"about": [1, True], "resources": [1, True], "segments": [1, True], "units": [1, True],
              "requires": [1, False], "complements": [1, False]}
    h = {"class": "catalog", "v": 1, "tables": tables}
    if lang:
        h["lang"] = lang
    titus = bytearray(9)
    titus[55 // 8] |= 1 << (55 % 8)
    t = {
        "about": {"format": "3.0", "catalog": lang or "common", "publisher": "unfoldingWord", "origin": "published",
                  "revision": rev, "previous": sha("previous"), "built": "2026-11-01T10:00:00Z",
                  "builder": "test 1", "name": "Español", "direction": "ltr"},
        "resources": [{"key": "es-419_gl/es-419/glt", "title": "GLT", "subject": "Aligned Bible", "release": "v42",
                       "license": "CC-BY-SA-4.0", "rights": "unfoldingWord", "attribution": "GLT by uW",
                       "books": bytes(titus)},
                      {"key": "es-419_gl/es-419/tn", "title": "tN", "subject": "TSV Translation Notes",
                       "release": "v7", "license": "CC-BY-SA-4.0", "books": bytes(9)}],
        "segments": [{"id": sha("s0"), "class": "book", "book": "tit", "size": 37713, "ulen": 70123,
                      "inputs": sha("i0")},
                     {"id": sha("s1"), "class": "art", "group": "tw:kt", "size": 100, "ulen": 200,
                      "inputs": sha("i1")},
                     {"id": sha("s2"), "class": "map", "part": "core", "size": 1, "ulen": 2, "inputs": sha("i2")}],
        "units": [{"id": "art:tw:kt", "segments": [1]},
                  {"id": "book:tit", "segments": [0], "needs": ["art:tw:kt", "orig:tit"]},
                  {"id": "map", "segments": [2]}],
        "requires": [["common", 7, sha("common")]],
        "complements": [{"kind": "classifier", "id": sha("c0"), "size": 1000, "media": "application/octet-stream",
                         "version": "1", "lang": "es-419", "for": "q1", "license": "MIT"},
                        {"kind": "vectors", "id": sha("c1"), "size": 5, "media": "application/x-npy",
                         "version": "2"}],
    }
    extra = {"sig": [{"key": "k1", "alg": "ed25519", "s": bytes(64)}]} if with_sig else None
    expected = {
        "h": header_h(h),
        "about": {"format": "3.0", "catalog": lang or "common", "publisher": "unfoldingWord", "origin": "published",
                  "revision": rev, "previous": sha("previous").hex(), "built": "2026-11-01T10:00:00Z",
                  "builder": "test 1", "name": "Español", "direction": "ltr"},
        "resources": [{"key": "es-419_gl/es-419/glt", "title": "GLT", "subject": "Aligned Bible", "release": "v42",
                       "license": "CC-BY-SA-4.0", "rights": "unfoldingWord", "attribution": "GLT by uW",
                       "books": "000000000000800000"},
                      {"key": "es-419_gl/es-419/tn", "title": "tN", "subject": "TSV Translation Notes",
                       "release": "v7", "license": "CC-BY-SA-4.0", "books": "000000000000000000"}],
        "segments": [{"id": sha("s0").hex(), "class": "book", "book": "tit", "size": 37713, "ulen": 70123,
                      "inputs": sha("i0").hex()},
                     {"id": sha("s1").hex(), "class": "art", "group": "tw:kt", "size": 100, "ulen": 200,
                      "inputs": sha("i1").hex()},
                     {"id": sha("s2").hex(), "class": "map", "part": "core", "size": 1, "ulen": 2,
                      "inputs": sha("i2").hex()}],
        "units": [{"id": "art:tw:kt", "segments": [1]},
                  {"id": "book:tit", "segments": [0], "needs": ["art:tw:kt", "orig:tit"]},
                  {"id": "map", "segments": [2]}],
        "requires": [["common", 7, sha("common").hex()]],
        "complements": [{"kind": "classifier", "id": sha("c0").hex(), "size": 1000,
                         "media": "application/octet-stream", "version": "1", "lang": "es-419", "for": "q1",
                         "license": "MIT"},
                        {"kind": "vectors", "id": sha("c1").hex(), "size": 5, "media": "application/x-npy",
                         "version": "2"}],
    }
    return build(h, t, extra=extra), expected, (h, t)


def test_catalog_with_units_requires_and_complements():
    b, expected, _ = catalog_fixture()
    ok(b, expected)
    assert "sig" not in read_file(b.data)


def test_catalog_common_has_no_lang():
    b, expected, _ = catalog_fixture(lang=None, with_sig=False)
    ok(b, expected)


@pytest.mark.parametrize("skip", [("requires",), ("complements",), ("requires", "complements")])
def test_catalog_unknown_optional_tables_are_skipped(skip):
    _, expected, (h, t) = catalog_fixture()
    for name in skip:
        h["tables"][name] = [2, False]
        t[name] = {"later": 1}
        del expected[name]
    expected["h"] = header_h(h)
    ok(build(h, t), expected)


def test_catalog_minimal_optional_keys_absent():
    _, expected, (h, t) = catalog_fixture()
    for name in ("requires", "complements"):
        del h["tables"][name]
        del t[name]
        del expected[name]
    for k in ("previous", "name", "direction"):
        del t["about"][k]
        del expected["about"][k]
    for r in t["resources"]:
        r.pop("rights", None)
        r.pop("attribution", None)
    for r in expected["resources"]:
        r.pop("rights", None)
        r.pop("attribution", None)
    expected["h"] = header_h(h)
    ok(build(h, t), expected)


CATALOG_MUTATIONS = {
    "format other than 3.0": lambda h, t: t["about"].update(format="3.1"),
    "origin other than published and local": lambda h, t: t["about"].update(origin="mirror"),
    "direction other than ltr and rtl": lambda h, t: t["about"].update(direction="up"),
    "previous of 31 bytes": lambda h, t: t["about"].update(previous=bytes(31)),
    "segment id of 33 bytes": lambda h, t: t["segments"][0].update(id=bytes(33)),
    "inputs of 8 bytes": lambda h, t: t["segments"][0].update(inputs=bytes(8)),
    "books of 8 bytes": lambda h, t: t["resources"][0].update(books=bytes(8)),
    "books of 18 bytes": lambda h, t: t["resources"][0].update(books=bytes(18)),
    "requires id of 31 bytes": lambda h, t: t["requires"][0].__setitem__(2, bytes(31)),
    "complement id of 31 bytes": lambda h, t: t["complements"][0].update(id=bytes(31)),
    "unit names a segment outside": lambda h, t: t["units"][0].update(segments=[3]),
    "unit with no segment": lambda h, t: t["units"][0].update(segments=[]),
    "segment twice": lambda h, t: t["segments"][1].update(id=sha("s0")),
    "unit twice": lambda h, t: t["units"][1].update(id="map"),
    "resource twice": lambda h, t: t["resources"][1].update(key="es-419_gl/es-419/glt"),
    "lang differs from about.catalog": lambda h, t: h.update(lang="es-ES"),
    "lang in the common catalog": lambda h, t: t["about"].update(catalog="common"),
    "segment class unknown": lambda h, t: t["segments"][0].update(**{"class": "zzz"}),
    "revision negative": lambda h, t: t["about"].update(revision=-1),
    "required table missing": lambda h, t: (h["tables"].pop("units"), t.pop("units"), None)[2],
    "units not a list": lambda h, t: t.update(units={}),
}


@pytest.mark.parametrize("name", list(CATALOG_MUTATIONS))
def test_catalog_tables_that_do_not_match_their_schema(name):
    _, _, (h, t) = catalog_fixture()
    CATALOG_MUTATIONS[name](h, t)
    err(build(h, t).data, "E_BODY")


# ---------------------------------------------------------------------------------------------------------------
# 4. Column encodings and the CBOR subset
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("n", [0, 1, 127, 128, 16383, 16384, 2 ** 31, 2 ** 32, 2 ** 40, 2 ** 52, 2 ** 53 - 1])
def test_uvarints_round_trip(n):
    assert lp3read.uvarints(uv([n])) == [n]
    assert lp3read.uvarints(uv([5, n, 7])) == [5, n, 7]


def test_uvarints_edges_exact():
    assert uv([2 ** 53 - 1]) == b"\xff\xff\xff\xff\xff\xff\xff\x0f"
    assert lp3read.uvarints(b"\xff\xff\xff\xff\xff\xff\xff\x0f") == [9007199254740991]
    assert lp3read.uvarints(b"\x80\x80\x80\x80\x10") == [2 ** 32]


@pytest.mark.parametrize("raw", [
    b"\x80\x00",                                     # 0 in two bytes
    b"\xff\x00",                                     # 127 in two bytes
    b"\x81\x80\x00",
    b"\x80",                                         # cut short
    b"\x01\x80",
    b"\xff\xff\xff\xff\xff\xff\xff\xff\x01",         # nine bytes
    b"\xff\xff\xff\xff\xff\xff\xff\x10",             # 2^53 (eight bytes, too big)
    b"\xff\xff\xff\xff\xff\xff\xff\x7f",             # 2^56 - 1
])
def test_uvarints_rejects(raw):
    with pytest.raises(LP3Error) as e:
        lp3read.uvarints(raw)
    assert e.value.code == "E_BODY"


@pytest.mark.parametrize("n", [0, -1, 1, -2, 2 ** 31, -(2 ** 31), 2 ** 40, -(2 ** 40), 2 ** 52 - 1, -(2 ** 52)])
def test_svarints_round_trip(n):
    assert lp3read.svarints(uv([zz(n)])) == [n]


def test_svarints_zigzag_table():
    assert lp3read.svarints(uv([0, 1, 2, 3, 4])) == [0, -1, 1, -2, 2]


def test_deltas():
    assert lp3read.deltas(dl([56001001, 56001001, 56000000, 2 ** 40])) == [56001001, 56001001, 56000000, 2 ** 40]
    with pytest.raises(LP3Error):
        lp3read.deltas(dl([5, -1]))                  # leaves 0 .. 2^53 - 1
    with pytest.raises(LP3Error):
        lp3read.deltas(uv([zz(2 ** 52 - 1), zz(2 ** 52 - 1), zz(2 ** 52 - 1)]))


def test_bits():
    assert lp3read.bits(b"\x05", 3) == [True, False, True]
    assert lp3read.bits(b"\xff\x01", 9) == [True] * 9
    assert lp3read.bits(b"", 0) == []
    for raw, n in ((b"\x08", 3), (b"", 1), (b"\x00\x00", 8)):
        with pytest.raises(LP3Error):
            lp3read.bits(raw, n)


def test_texts_column():
    assert lp3read.texts_column(tx(["", "α", "b\nc"])) == ["", "α", "b\nc"]
    assert lp3read.texts_column(tx([])) == []


def test_varints_in_a_file_large_numbers_in_ranges():
    # notes whose ranges lie at 2^40 and at the top of 0 .. 2^53 - 1 (with refText: they have no canonical text).
    # The differences of a deltas column go through zigzag, so they stay within +-2^52.
    h = {"class": "book", "v": 1, "tables": {"strings": [1, True], "texts": [1, True], "notes": [1, False]},
         "lang": "es-419", "book": "tit", "orig": ORIG, "res": [["es-419_gl/es-419/tn", "v7"]]}
    notes = {"res": 0, "n": 3, "id": {"ascii4": b"aaaabbbbcccc"},
             "ref": {"from": dl([2 ** 40, 2 ** 52 - 1, 2 ** 53 - 6]), "span": uv([5, 2 ** 31, 5])},
             "refText": [[0, "x"], [1, "y"], [2, "z"]], "cols": {}}
    out = read_file(build(h, {"strings": [], "texts": [], "notes": notes}).data)
    rows = out["notes"]["rows"]
    assert [(r["from"], r["to"]) for r in rows] == [(2 ** 40, 2 ** 40 + 5), (2 ** 52 - 1, 2 ** 52 - 1 + 2 ** 31),
                                                    (2 ** 53 - 6, 2 ** 53 - 1)]
    # a range that runs past 2^53 - 1 is rejected
    notes["ref"]["span"] = uv([5, 2 ** 31, 6])
    err(build(h, {"strings": [], "texts": [], "notes": notes}).data, "E_BODY")


def test_non_minimal_varint_in_a_file():
    err(mutate(lambda h, t: t["texts"][0].update(tok=b"\x80\x00")), "E_BODY")


@pytest.mark.parametrize("fixture", [book_align, book_helps, orig_fixture, art_fixture, lex_fixture, obs_fixture,
                                     catalog_fixture])
def test_unknown_required_table_is_e_table_in_every_class(fixture):
    _, _, (h, t) = fixture()
    h["tables"]["future-y"] = [1, True]
    t["future-y"] = 1
    err(build(h, t).data, "E_TABLE")


def test_table_version_unknown_optional_and_required():
    b, expected, _ = book_helps()
    doc = cbor2.loads(b.body)
    doc["h"]["tables"]["strings"] = [2, True]
    err(build(doc["h"], doc["t"]).data, "E_TABLE")
    # the schema says "strings" is required, whatever flag the header puts on it
    doc["h"]["tables"]["strings"] = [2, False]
    err(build(doc["h"], doc["t"]).data, "E_TABLE")


def test_cbor_decoder_agrees_with_cbor2():
    samples = [0, 1, 23, 24, 255, 256, 65535, 65536, 2 ** 32, 2 ** 53 - 1, -1, -24, -25, -(2 ** 40), "", "é", "a" * 300,
               b"", b"\x00" * 300, [], [1, [2, [3]]], {}, {"a": 1, "b": [True, False], "c": {"d": b"x"}},
               {"k" * 30: list(range(300))}, True, False, 2 ** 64 - 1, -(2 ** 64)]
    for s in samples:
        assert lp3read._cbor_one(enc(s)) == s
        assert type(lp3read._cbor_one(enc(s))) is type(s)


INDEFINITE = {
    "text": b"\x7f\x61\xc3\x61\xa9\xff",             # chunks that join into a valid "é"
    "text, empty": b"\x7f\xff",
    "bytes": b"\x5f\x41a\x41b\xff",
    "array": b"\x9f\x01\x02\xff",
    "map": b"\xbf\x61a\x01\xff",
    "array, empty": b"\x9f\xff",
}


def test_cbor_decoder_rejects():
    bad = [b"\xf6", b"\xf7", b"\xf9\x00\x00", b"\xfa\x00\x00\x00\x00", b"\xfb" + bytes(8), b"\xc0\x60", b"\xc2\x41\x01",
           b"\xf0", b"\xf8\x20", b"\xff", b"\x1c", b"\x18", b"\x62a", b"\x62\xc3\x28", b"\x82\x01", b"\xa1\x01\x02",
           b"\xa2\x61a\x01\x61a\x02", b"\x01\x01", b"\xa1\x01\x01", b"\xa1\x41a\x01"] + list(INDEFINITE.values())
    for raw in bad:
        with pytest.raises(lp3read._Malformed):
            lp3read._cbor_one(raw)
    with pytest.raises(lp3read._TooDeep):
        lp3read._cbor_one(b"\x81" * 65 + b"\x00")
    assert lp3read._cbor_one(b"\x81" * 63 + b"\x80") is not None


def test_cbor_decoder_accepts_other_forms_of_the_same_data():
    # container.md, "What a reader accepts": an integer not in its shortest form and unsorted keys are accepted
    assert lp3read._cbor_one(b"\x18\x05") == 5
    assert lp3read._cbor_one(b"\x19\x00\x05") == 5
    assert lp3read._cbor_one(b"\xa2\x61b\x01\x61a\x02") == {"b": 1, "a": 2}
    assert lp3read._cbor_one(b"\xf5") is True and lp3read._cbor_one(b"\xf4") is False


def with_extra_item(encoded_map: bytes, item: bytes) -> bytes:
    """A definite map with one more pair, ``"x"`` and the raw ``item`` (which may be indefinite)."""
    head = encoded_map[0]
    assert head & 0xE0 == 0xA0 and head & 0x1F < 23
    return bytes([head + 1]) + encoded_map[1:] + enc("x") + item


@pytest.mark.parametrize("name", list(INDEFINITE))
def test_indefinite_lengths_are_rejected_in_the_header_the_body_and_the_index(name):
    item = INDEFINITE[name]
    # header: E_HEADER
    err(assemble(with_extra_item(MIN_HEADER, item), MIN_COMP), "E_HEADER")
    # body, at the root and inside an unknown optional table: E_BODY
    err(swap_body(with_extra_item(MIN_BODY, item)), "E_BODY")
    h = json.loads(json.dumps(MIN_DOC["h"]))
    h["tables"]["future-x"] = [1, False]
    body = enc({"h": h, "t": dict(MIN_DOC["t"], **{"future-x": 0})})
    assert body[-1:] == b"\x00"
    raw = body[:-1] + item
    comp = deflate(raw)
    header = dict(MIN_HDR, h=h, clen=len(comp), ulen=len(raw), id=hashlib.sha256(raw).digest())
    err(assemble(header, comp), "E_BODY")
    # transfer index: E_HEADER
    cat, _, _ = catalog_fixture(with_sig=False)
    cid = bytes.fromhex(cat.id)
    index = enc({"mode": "full", "catalogs": [cid],
                 "entries": [{"id": cid, "kind": "segment", "class": "catalog", "offset": 0, "size": len(cat.data)}]})
    err(raw_transfer(with_extra_item(index, item), cat.data), "E_HEADER")


def test_indefinite_map_or_array_as_the_whole_header_or_body():
    inner = enc(MIN_HDR)[1:]
    err(assemble(b"\xbf" + inner + b"\xff", MIN_COMP), "E_HEADER")
    inner = enc(MIN_DOC)[1:]
    err(swap_body(b"\xbf" + inner + b"\xff"), "E_BODY")


def test_forbidden_items_in_the_header_are_e_header():
    for item in (b"\xf6", b"\xf7", b"\xf9\x3c\x00", b"\xc1\x00", b"\xf8\x20"):
        err(assemble(with_extra_item(MIN_HEADER, item), MIN_COMP), "E_HEADER")


def test_canonical_text():
    obj = {"b": "é\u0001\u001f\"\\\n\t\u007f\U0001d538", "a": [1, True, False], "\U0001d538": 1, "￿": 2}
    assert compact_text(obj) == ('{"a":[1,true,false],"b":"é\\u0001\\u001f\\"\\\\\\n\\t\u007f\U0001d538",'
                                 '"￿":2,"\U0001d538":1}')
    assert canonical_text({"error": "E_ID"}) == '{"error": "E_ID"}\n'
    assert canonical_text({"a": []}) == '{\n  "a": []\n}\n'


# ---------------------------------------------------------------------------------------------------------------
# 5. The transfer file
# ---------------------------------------------------------------------------------------------------------------


def transfer_bytes(entries, catalogs, mode="full", extra_index=None, prefix=TRANSFER_PREFIX, drop=()):
    """``entries``: list of (id, kind, class or None, payload)."""
    index_entries, offset = [], 0
    for id_, kind, cls, payload in entries:
        e = {"id": id_, "kind": kind, "offset": offset, "size": len(payload)}
        if cls is not None:
            e["class"] = cls
        index_entries.append(e)
        offset += len(payload)
    index = {"mode": mode, "catalogs": list(catalogs), "entries": index_entries, "made": "2026-11-01T10:00:00Z",
             "by": "test 1"}
    index.update(extra_index or {})
    for k in drop:
        index.pop(k, None)
    ib = enc(index)
    return prefix + struct.pack(">I", len(ib)) + ib + b"".join(p for *_, p in entries)


class Transfer:
    def __init__(self, data, parts, index_len):
        self.data, self.parts, self.index_len = data, parts, index_len


def orig_small() -> Built:
    return orig_fixture("none")[0]


def make_transfer_full(extra_index=None) -> Transfer:
    cat, _, _ = catalog_fixture(with_sig=False)
    minimal_id = bytes.fromhex(min_expected()["id"])
    orig = orig_small()
    comp_bytes = b"complement bytes"
    entries = [(bytes.fromhex(cat.id), "segment", "catalog", cat.data),
               (minimal_id, "segment", "book", MIN),
               (bytes.fromhex(orig.id), "segment", "orig", orig.data),
               (hashlib.sha256(comp_bytes).digest(), "complement", None, comp_bytes)]
    data = transfer_bytes(entries, [bytes.fromhex(cat.id)], extra_index=extra_index)
    t = Transfer(data, entries, 0)
    t.cat, t.orig = cat, orig
    t.index_len = int.from_bytes(data[8:12], "big")
    return t


def transfer_expected(t: Transfer, statuses: list, extra_index=None) -> dict:
    cat, cat_expected, _ = catalog_fixture(with_sig=False)
    entries_idx, entries_out, offset = [], [], 0
    for (id_, kind, cls, payload), status in zip(t.parts, statuses):
        e = {"id": id_.hex(), "kind": kind, "offset": offset, "size": len(payload)}
        o = {"id": id_.hex(), "kind": kind, "status": status}
        if cls is not None:
            e["class"] = cls
            o["class"] = cls
        entries_idx.append(e)
        entries_out.append(o)
        offset += len(payload)
    index = {"mode": "full", "catalogs": [cat.id], "entries": entries_idx, "made": "2026-11-01T10:00:00Z",
             "by": "test 1"}
    index.update(extra_index or {})
    return {"index": index, "entries": entries_out, "catalogs": [dict(cat_expected, id=cat.id)]}


def test_transfer_full():
    t = make_transfer_full()
    assert canon(read_file(t.data)) == canon(transfer_expected(t, ["ok"] * 4))
    assert canon(read_file(t.data, expect="transfer")) == canon(transfer_expected(t, ["ok"] * 4))


def test_transfer_cut_inside_an_entry_gives_missing():
    t = make_transfer_full()
    # inside the complement, the last entry
    out = read_file(t.data[:-5])
    assert canon(out) == canon(transfer_expected(t, ["ok", "ok", "ok", "missing"]))
    # inside the orig segment (the third)
    cut = len(t.data) - len(t.parts[3][3]) - 10
    assert canon(read_file(t.data[:cut])) == canon(transfer_expected(t, ["ok", "ok", "missing", "missing"]))
    # inside the book segment: case 10 of tests/README.md
    cut = 12 + t.index_len + len(t.parts[0][3]) + len(MIN) // 2
    assert canon(read_file(t.data[:cut])) == canon(transfer_expected(t, ["ok", "missing", "missing", "missing"]))
    # exactly at the end of the catalogs
    cut = 12 + t.index_len + len(t.parts[0][3])
    assert canon(read_file(t.data[:cut])) == canon(transfer_expected(t, ["ok", "missing", "missing", "missing"]))


def test_transfer_cut_inside_the_index_or_a_catalog_is_truncated():
    t = make_transfer_full()
    err(t.data[:12 + t.index_len - 1], "E_TRUNCATED")
    err(t.data[:12 + t.index_len], "E_TRUNCATED")
    err(t.data[:12 + t.index_len + len(t.parts[0][3]) - 1], "E_TRUNCATED")
    err(t.data[:11], "E_TRUNCATED")
    err(t.data[:5], "E_TRUNCATED")


def test_transfer_trailing():
    t = make_transfer_full()
    err(t.data + b"\x00", "E_TRAILING")


def test_transfer_fixed_bytes():
    t = make_transfer_full()
    d = bytearray(t.data)
    d[0] = 0
    err(bytes(d), "E_MAGIC")
    d = bytearray(t.data)
    d[4] = 4
    err(bytes(d), "E_VERSION")
    d = bytearray(t.data)
    d[6] = 9
    err(bytes(d), "E_KIND")


def test_transfer_entry_statuses():
    cat, _, _ = catalog_fixture(with_sig=False)
    minimal_id = bytes.fromhex(min_expected()["id"])
    good_orig = orig_small()
    bad_inflate = MIN[:-2]                                # cut: the entry is whole in the file, its stream is not
    # a map segment with only an optional table: E_TABLE all the same
    map_seg = build({"class": "map", "v": 1, "tables": {"future-x": [1, False]}, "lang": "es-419", "part": "core"},
                    {"future-x": 1})
    kind_two = make_transfer_full().data
    wrong_complement = b"abc"
    entries = [(bytes.fromhex(cat.id), "segment", "catalog", cat.data),
               (minimal_id, "segment", "book", MIN),
               (bytes(32), "segment", "book", MIN),                                  # E_ID: not the id given
               (bytes.fromhex(good_orig.id), "segment", "book", good_orig.data),    # the class of the entry lies
               (bytes.fromhex("11" * 32), "segment", "orig", bad_inflate),           # E_TRUNCATED as a file
               (bytes.fromhex(map_seg.id), "segment", "map", map_seg.data),
               (bytes.fromhex("22" * 32), "segment", "book", kind_two),              # E_KIND
               (bytes.fromhex("33" * 32), "segment", "book", b"\x89TLP"),            # too short
               (bytes.fromhex("44" * 32), "complement", None, wrong_complement),     # E_ID
               (hashlib.sha256(b"x").digest(), "complement", None, b"x")]
    data = transfer_bytes(entries, [bytes.fromhex(cat.id)])
    out = read_file(data)
    assert [e["status"] for e in out["entries"]] == ["ok", "ok", "E_ID", "ok", "E_TRUNCATED", "E_TABLE", "E_KIND",
                                                     "E_TRUNCATED", "E_ID", "ok"]
    # case 10's trailing check is against the entries, not their statuses
    assert out["catalogs"][0]["id"] == cat.id


def test_transfer_bad_inflate_status():
    cat, _, _ = catalog_fixture(with_sig=False)
    comp = MIN_COMP[:-2]
    broken = assemble(dict(MIN_HDR, clen=len(comp)), comp)
    entries = [(bytes.fromhex(cat.id), "segment", "catalog", cat.data), (bytes.fromhex("11" * 32), "segment", "book", broken)]
    out = read_file(transfer_bytes(entries, [bytes.fromhex(cat.id)]))
    assert out["entries"][1]["status"] == "E_INFLATE"


def test_transfer_catalog_error_rejects_the_file():
    cat, _, (h, t) = catalog_fixture(with_sig=False)
    comp = MIN_COMP[:-2]
    # the catalog's id as the index gives it is not its id
    entries = [(bytes(32), "segment", "catalog", cat.data)]
    err(transfer_bytes(entries, [bytes(32)]), "E_ID")
    # a catalog that is not a valid segment
    entries = [(bytes.fromhex("11" * 32), "segment", "catalog", b"\x89TLP\x03\x00\x01\x00\x00\x00\x00\x01\x01")]
    err(transfer_bytes(entries, [bytes.fromhex("11" * 32)]), "E_HEADER")
    # a catalog of another class: not the tables of a catalog
    err(transfer_bytes([(bytes.fromhex(MIN_HDR["id"].hex()), "segment", "catalog", MIN)], [MIN_HDR["id"]]), "E_BODY")
    # tables of a catalog that do not match catalog.cddl: E_BODY, after the entries are checked
    h["tables"]["about"] = [1, True]
    t["about"]["format"] = "2.0"
    bad_cat = build(h, t)
    ok_cat = catalog_fixture(with_sig=False, lang="es-419")[0]
    assert comp
    err(transfer_bytes([(bytes.fromhex(bad_cat.id), "segment", "catalog", bad_cat.data)],
                       [bytes.fromhex(bad_cat.id)]), "E_BODY")
    # two catalogs: a container defect of the second comes before the table defect of the first
    second = (bytes.fromhex("55" * 32), "segment", "catalog", ok_cat.data)
    err(transfer_bytes([(bytes.fromhex(bad_cat.id), "segment", "catalog", bad_cat.data), second],
                       [bytes.fromhex(bad_cat.id), bytes.fromhex("55" * 32)]), "E_ID")


def test_transfer_catalog_class_is_checked_with_the_shape_of_the_body():
    # transfer.md step 5: a catalog entry whose own class is not "catalog" is E_BODY, after E_ID and before E_HMISMATCH
    # and E_TABLE.
    other = dict(MIN_DOC["h"], lang="es-ES")
    mismatched = build(json.loads(json.dumps(MIN_DOC["h"])), dict(MIN_DOC["t"]), header_h=other)
    required_unknown = future_table_file(True, "future-y")
    map_seg = build({"class": "map", "v": 1, "tables": {"future-y": [1, True]}, "lang": "es-419", "part": "core"},
                    {"future-y": 1})
    for seg in (mismatched, required_unknown, map_seg):
        sid = bytes.fromhex(seg.id)
        # as a catalog entry: E_BODY for the class
        err(transfer_bytes([(sid, "segment", "catalog", seg.data)], [sid]), "E_BODY")
        # E_ID comes first
        err(transfer_bytes([(bytes(32), "segment", "catalog", seg.data)], [bytes(32)]), "E_ID")
    # the same files as other entries only get their status
    cat, _, _ = catalog_fixture(with_sig=False)
    entries = [(bytes.fromhex(cat.id), "segment", "catalog", cat.data)] + [
        (bytes.fromhex(seg.id), "segment", "book", seg.data) for seg in (mismatched, required_unknown, map_seg)]
    out = read_file(transfer_bytes(entries, [bytes.fromhex(cat.id)]))
    assert [e["status"] for e in out["entries"]] == ["ok", "E_HMISMATCH", "E_TABLE", "E_TABLE"]
    # a catalog entry that does not say its class in the index is E_HEADER, whatever the file is
    sid = bytes.fromhex(cat.id)
    err(transfer_bytes([(sid, "segment", None, cat.data)], [sid]), "E_HEADER")


def test_transfer_two_catalogs_output_in_the_order_of_catalogs():
    c1, e1, _ = catalog_fixture(with_sig=False)
    c2, e2, _ = catalog_fixture(lang=None, with_sig=False)
    entries = [(bytes.fromhex(c1.id), "segment", "catalog", c1.data), (bytes.fromhex(c2.id), "segment", "catalog", c2.data)]
    out = read_file(transfer_bytes(entries, [bytes.fromhex(c2.id), bytes.fromhex(c1.id)]))
    assert [c["id"] for c in out["catalogs"]] == [c2.id, c1.id]
    assert out["index"]["catalogs"] == [c2.id, c1.id]


def test_transfer_index_keys_kept_and_entry_keys_dropped():
    cat, _, _ = catalog_fixture(with_sig=False)
    cid = bytes.fromhex(cat.id)
    base = [["es-419", 3]]
    index_extra = {"future": {"b": b"\x01\x02", "a": [1, True, "x"]}, "base": base}
    ib = enc({"mode": "update", "catalogs": [cid],
              "entries": [{"id": cid, "kind": "segment", "class": "catalog", "offset": 0, "size": len(cat.data),
                           "extra": "dropped", "z": [1]}], **index_extra})
    data = TRANSFER_PREFIX + struct.pack(">I", len(ib)) + ib + cat.data
    out = read_file(data)
    assert out["index"] == {"mode": "update", "catalogs": [cat.id], "base": base,
                            "entries": [{"id": cat.id, "kind": "segment", "class": "catalog", "offset": 0,
                                         "size": len(cat.data)}],
                            "future": {"a": [1, True, "x"], "b": "0102"}}
    assert "made" not in out["index"] and "by" not in out["index"]


def raw_transfer(index, payloads=b""):
    ib = index if isinstance(index, bytes) else enc(index)
    return TRANSFER_PREFIX + struct.pack(">I", len(ib)) + ib + payloads


def test_transfer_index_defects():
    cat, _, _ = catalog_fixture(with_sig=False)
    cid = bytes.fromhex(cat.id)
    entry = {"id": cid, "kind": "segment", "class": "catalog", "offset": 0, "size": len(cat.data)}
    good = {"mode": "full", "catalogs": [cid], "entries": [entry]}
    assert "error" not in read_file(raw_transfer(good, cat.data))

    other = {"id": bytes.fromhex("77" * 32), "kind": "complement", "offset": len(cat.data), "size": 1}
    cases = {
        "not a map": enc([1]),
        "cut": enc(good)[:-2],
        "bytes after": enc(good) + b"\x00",
        "mode": dict(good, mode="partial"),
        "no mode": {k: v for k, v in good.items() if k != "mode"},
        "catalogs empty": dict(good, catalogs=[]),
        "catalogs id short": dict(good, catalogs=[cid[:31]]),
        "catalogs repeated": dict(good, catalogs=[cid, cid]),
        "catalog not an entry": dict(good, catalogs=[bytes.fromhex("88" * 32)]),
        "entries empty": dict(good, entries=[]),
        "entry not a map": dict(good, entries=[1]),
        "entry id short": dict(good, entries=[dict(entry, id=cid[:31])]),
        "entry id twice": dict(good, entries=[entry, dict(other, id=cid)]),
        "entry kind": dict(good, entries=[dict(entry, kind="file")]),
        "entry offset negative": dict(good, entries=[dict(entry, offset=-1)]),
        "entry size not a number": dict(good, entries=[dict(entry, size="9")]),
        "entry offset is not the sum": dict(good, entries=[entry, dict(other, offset=len(cat.data) + 1)]),
        "first offset not 0": dict(good, entries=[dict(entry, offset=1)]),
        "complement with a class": dict(good, entries=[entry, dict(other, **{"class": "book"})]),
        "class not a class name": dict(good, entries=[dict(entry, **{"class": "zip"})]),
        "catalog is a complement": dict(good, entries=[dict(entry, kind="complement")]),
        "catalog with another class": dict(good, entries=[dict(entry, **{"class": "book"})]),
        "catalog without a class": dict(good, entries=[{k: v for k, v in entry.items() if k != "class"}]),
        "catalog among the entries but not first": dict(good, catalogs=[cid], entries=[other, dict(entry, offset=1)]),
        "sum beyond 2^53-1": dict(good, entries=[dict(entry, size=2 ** 53 - 1), dict(other, offset=2 ** 53 - 1)]),
        "base not pairs": dict(good, base=[["a"]]),
        "base revision negative": dict(good, base=[["a", -1]]),
        "made not text": dict(good, made=3),
        "by not text": dict(good, by=b"x"),
        "float in an unlisted key": enc(good)[:-1] + b"\x00",   # replaced below
    }
    del cases["float in an unlisted key"]
    for name, index in cases.items():
        assert read_file(raw_transfer(index, cat.data)) == {"error": "E_HEADER"}, name


def test_transfer_index_limits():
    cat, _, _ = catalog_fixture(with_sig=False)
    cid = bytes.fromhex(cat.id)
    good = {"mode": "full", "catalogs": [cid],
            "entries": [{"id": cid, "kind": "segment", "class": "catalog", "offset": 0, "size": len(cat.data)}]}
    # no limit on I in 3.0: an index over 65 536 bytes is fine
    out = read_file(raw_transfer(dict(good, by="x" * 70000), cat.data))
    assert "error" not in out and len(out["index"]["by"]) == 70000
    # nesting in the index: 64 levels are allowed, more are E_LIMIT
    assert "error" not in read_file(raw_transfer(dict(good, x=nest(63)), cat.data))
    assert read_file(raw_transfer(dict(good, x=nest(64)), cat.data)) == {"error": "E_LIMIT"}


def test_transfer_index_i_beyond_the_file():
    err(TRANSFER_PREFIX + struct.pack(">I", 2 ** 32 - 1), "E_TRUNCATED")


def test_transfer_file_read_as_segment_cli(tmp_path):
    t = make_transfer_full()
    p = tmp_path / "t.tcpack"
    p.write_bytes(t.data)
    proc = subprocess.run([sys.executable, "-X", "utf8", str(HERE / "lp3read.py"), str(p)], capture_output=True)
    assert proc.returncode == 0
    assert json.loads(proc.stdout.decode("utf-8")) == json.loads(compact_text(transfer_expected(t, ["ok"] * 4)))


# ---------------------------------------------------------------------------------------------------------------
# 6. Robustness: read_file returns an output or an error object, whatever the input
# ---------------------------------------------------------------------------------------------------------------

ERROR_CODES = {"E_MAGIC", "E_VERSION", "E_KIND", "E_TRUNCATED", "E_TRAILING", "E_HEADER", "E_CODEC", "E_INFLATE",
               "E_ID", "E_BODY", "E_HMISMATCH", "E_TABLE", "E_LIMIT"}

JUNK = [0, -1, 1, 255, 2 ** 31, 2 ** 53, 2 ** 64 - 1, -(2 ** 63), "", "x", "x" * 1000, "9" * 5000, "G" + "9" * 5000,
        "G5485", "é", b"", b"\x00", b"\x80", b"\xff" * 9, b"\x80" * 100, bytes(range(256)), [], {}, [[]],
        {"a": "b"}, [1, 2, 3], True, False, 1.5, None]


def _nodes(doc):
    out, stack = [], [doc]
    while stack:
        n = stack.pop()
        if isinstance(n, dict):
            for k, v in n.items():
                out.append((n, k))
                stack.append(v)
        elif isinstance(n, list):
            for i, v in enumerate(n):
                out.append((n, i))
                stack.append(v)
    return out


def _mutate(rng, doc) -> None:
    container, key = rng.choice(_nodes(doc))
    v = container[key]
    op = rng.randrange(7)
    if op <= 1:
        container[key] = copy.deepcopy(rng.choice(JUNK))
    elif op == 2 and isinstance(v, bytes) and v:
        b = bytearray(v)
        if rng.random() < 0.5:
            b[rng.randrange(len(b))] = rng.randrange(256)
        else:
            del b[rng.randrange(len(b)):]
        container[key] = bytes(b)
    elif op == 3 and isinstance(container, dict):
        del container[key]
    elif op == 4 and isinstance(container, list):
        if rng.random() < 0.5:
            del container[key]
        else:
            container.insert(key, v)
    elif op == 5 and type(v) is int:
        container[key] = v + rng.choice([-2, -1, 1, 2, 2 ** 20, 2 ** 40])
    elif op == 6 and isinstance(v, str):
        container[key] = rng.choice([v + "x", v + "é", v + "9" * 10, v + ":", v[:-1], v + "9" * 5000,
                                     v[:1] + "9" * 5000, v[:2] + "0" * 5000 + v[2:]])
    else:
        container[key] = copy.deepcopy(rng.choice(JUNK))


def structural_fuzz(n: int, seed: int) -> dict:
    """Mutates the decoded CBOR of valid files of every class (types, huge integers, long strings and digit strings,
    wrong lengths), re-encodes them with a consistent header and reads them. Returns how many gave each result."""
    import random
    rng = random.Random(seed)
    bodies = [book_align()[0].body, book_helps()[0].body, orig_fixture()[0].body, art_fixture()[0].body,
              lex_fixture()[0].body, obs_fixture()[0].body, catalog_fixture()[0].body, MIN_BODY]
    results: dict[str, int] = {}
    for i in range(n):
        doc = cbor2.loads(bodies[i % len(bodies)])
        for _ in range(rng.choice([1, 1, 2, 3])):
            _mutate(rng, doc)
        try:
            body = cbor2.dumps(doc)
        except (ValueError, OverflowError, TypeError):
            continue
        c = zlib.compressobj(1, zlib.DEFLATED, -15)
        comp = c.compress(body) + c.flush()
        hh = doc.get("h") if isinstance(doc, dict) else None
        header = {"h": hh if isinstance(hh, dict) else {}, "codec": "deflate-raw", "clen": len(comp),
                  "ulen": len(body), "id": hashlib.sha256(body).digest()}
        out = read_file(assemble(header, comp))
        assert isinstance(out, dict)
        key = out["error"] if list(out) == ["error"] else "ok"
        assert key == "ok" or key in ERROR_CODES, out
        results[key] = results.get(key, 0) + 1
    return results


def test_structural_fuzz_never_raises():
    results = structural_fuzz(2000, seed=20261101)
    assert sum(results.values()) > 1900
    assert results.get("E_BODY", 0) > 100 and results.get("ok", 0) > 10


def test_read_file_never_raises_on_odd_bytes():
    import random
    rng = random.Random(7)
    for data in (b"", b"\x00", MAGIC, PREFIX, PREFIX + b"\xff" * 4, TRANSFER_PREFIX + b"\xff" * 4,
                 TRANSFER_PREFIX + b"\x00\x00\x00\x01\xa0"):
        for expect in (None, "segment", "transfer"):
            out = read_file(data, expect)
            assert list(out) == ["error"] and out["error"] in ERROR_CODES
    for _ in range(200):
        data = PREFIX + bytes(rng.randrange(256) for _ in range(rng.randrange(60)))
        assert "error" in read_file(data)


def test_cli_unexpected_exception_is_not_exit_1(monkeypatch, capsys, tmp_path):
    p = tmp_path / "x.seg"
    p.write_bytes(MIN)

    def boom(data, expect=None):
        raise RuntimeError("bug")

    monkeypatch.setattr(lp3read, "read_file", boom)
    assert lp3read.main(["lp3read.py", str(p)]) == 3
    captured = capsys.readouterr()
    assert captured.out == "" and "internal error" in captured.err and "RuntimeError" in captured.err
    assert lp3read.main(["lp3read.py", str(tmp_path / "missing")]) == 2
