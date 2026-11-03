"""Tests of the ``aligned`` class and the ``optional`` units of the catalog, written from cddl/aligned.cddl,
tests/README.md ("aligned", "Checks of the tables") and catalog.md. Same encoders as test_lp3read.py."""
from __future__ import annotations

import copy

import pytest

import lp3read
from lp3read import read_file, read_segment
from test_lp3read import build, catalog_fixture, err, header_h, ok, tx, uv


def make(keys, strongs, data, group="a-b", res=None, h_extra=None, drop=None):
    tables = {"keys": [1, True], "strongs": [1, True], "data": [1, True]}
    h = {"class": "aligned", "v": 1, "tables": tables, "lang": "es-419", "group": group,
         "res": res if res is not None else [["es-419_gl/es-419/glt", "v1"], ["es-419_gl/es-419/gst", "v1"]]}
    h.update(h_extra or {})
    for k in drop or ():
        h.pop(k, None)
    t = {"keys": tx(keys), "strongs": strongs, "data": uv(data)}
    return build(h, t), h


def seg(keys, strongs, data, group="a"):
    return make(keys, strongs, data, group=group)[0].data


def ent(keys, group="a-z", strongs=("G1",)):
    return make(keys, list(strongs), [1, 0, 1, 1, 1, 1] * len(keys), group=group)[0].data


def test_reads_entries():
    # aa: G10 in Titus (56) 1 verse 2 occurrences. ab: G10 in Genesis (1,1) and Titus (delta 55) (2,3); G20 in Genesis
    data = [1, 0, 1, 56, 1, 2, 2, 0, 2, 1, 1, 1, 55, 2, 3, 1, 1, 1, 1, 1]
    b, h = make(["aa", "ab"], ["G10", "G20"], data)
    ok(b, {"h": header_h(h), "entries": {
        "aa": {"G10": {"tit": [1, 2]}},
        "ab": {"G10": {"gen": [1, 1], "tit": [2, 3]}, "G20": {"gen": [1, 1]}}}})


def test_empty_segment_and_unicode_keys():
    b, h = make([], [], [], group="other")
    ok(b, {"h": header_h(h), "entries": {}})
    b, h = make(["¿qué", "Ἰησοῦς"], ["H1"], [1, 0, 1, 1, 1, 1, 1, 0, 1, 66, 1, 1], group="other")
    ok(b, {"h": header_h(h), "entries": {"¿qué": {"H1": {"gen": [1, 1]}}, "Ἰησοῦς": {"H1": {"rev": [1, 1]}}}})


def test_unknown_table_and_header_key_ignored():
    h = {"class": "aligned", "v": 1, "lang": "en", "group": "a", "res": [["r", "v"]],
         "tables": {"keys": [1, True], "strongs": [1, True], "data": [1, True], "x": [1, False]}, "future": 1}
    b = build(h, {"keys": tx(["a"]), "strongs": ["G1"], "data": uv([1, 0, 1, 1, 1, 1]), "x": {}})
    assert read_file(b.data)["entries"] == {"a": {"G1": {"gen": [1, 1]}}}


@pytest.mark.parametrize("group", ["A", "aaaaaaa", "d-b", "a-ab-c", "the ", "a-b ", "", "-a", " a", "a1", "Other",
                                   "other ", "ab-a", "a-a ", "a-b "])
def test_bad_group(group):
    b, _ = make([], [], [], group=group)
    err(b.data, "E_BODY")


@pytest.mark.parametrize("group", ["a-ab", "b-b", "ar-b", "the", "the -thf", "a", "a b", "other", "a-and ha", "a-a"])
def test_good_group(group):
    b, _ = make([], [], [], group=group)
    assert read_file(b.data)["entries"] == {}


@pytest.mark.parametrize("drop", ["lang", "group", "res"])
def test_header_needs(drop):
    b, _ = make([], [], [], drop=[drop])
    err(b.data, "E_BODY")


def test_empty_res():
    b, _ = make([], [], [], res=[])
    err(b.data, "E_BODY")


def test_keys_order_repeat_empty():
    assert "error" not in read_file(ent(["a", "b"]))
    err(ent(["b", "a"]), "E_BODY")
    err(ent(["a", "a"]), "E_BODY")
    err(ent(["", "a"]), "E_BODY")
    err(ent([""], group="other"), "E_BODY")


def test_code_point_order_not_utf16():
    # U+FF5E (BMP) sorts before U+10000 (astral) by code point; UTF-16 would put the astral first
    assert "error" not in read_file(ent(["～", "\U00010000"], group="other"))
    err(ent(["\U00010000", "～"], group="other"), "E_BODY")


def test_range_membership():
    assert "error" not in read_file(ent(["as"], group="ar-b"))
    assert "error" not in read_file(ent(["t"], group="t-td"))
    err(ent(["t"], group="ta-tz"), "E_BODY")
    err(ent(["a"], group="b-c"), "E_BODY")           # before P
    err(ent(["c"], group="a-b"), "E_BODY")           # after Q
    assert "error" not in read_file(ent(["bz"], group="a-b"))   # key[:1] = "b" <= "b"


def test_lone_prefix_is_p_p():
    assert "error" not in read_file(ent(["the", "thex"], group="the"))
    err(ent(["thf"], group="the"), "E_BODY")
    err(ent(["th"], group="the"), "E_BODY")          # before P


def test_range_with_space_prefix():
    assert "error" not in read_file(ent(["the a", "the z"], group="the -thf"))
    err(ent(["the"], group="the -thf"), "E_BODY")    # "the" < "the "
    assert "error" not in read_file(ent(["a'x"], group="a-b"))


def test_other_is_unchecked_alone_and_catalog_aware():
    data = ent(["as", "zz"], group="other")
    assert "error" not in read_file(data)
    assert read_segment(data, aligned_ranges=[("n", "o")])["entries"]
    with pytest.raises(lp3read.LP3Error) as e:
        read_segment(data, aligned_ranges=[("a", "am"), ("ar", "b")])     # "as" lies in ar-b
    assert e.value.code == "E_BODY"
    assert read_segment(ent(["zz"], group="other"), aligned_ranges=[("a", "am"), ("ar", "b")])


def test_ranges_from_catalog_output():
    b, expected, (h, t) = catalog_fixture()
    t = copy.deepcopy(t)
    for uid in ["aligned:a-am", "aligned:ar-b", "aligned:other", "aligned:the"]:
        t["units"].append({"id": uid, "segments": [0], "optional": True})
    out = read_file(build(h, t).data)
    assert [u.get("optional") for u in out["units"]] == [None, None, None, True, True, True, True]
    assert lp3read.aligned_ranges_of_catalog(out) == [("a", "am"), ("ar", "b"), ("the", "the")]


def test_strong_repeated_in_entry():
    err(seg(["a"], ["G1"], [2, 0, 1, 1, 1, 1, 0, 1, 2, 1, 1]), "E_BODY")           # the same index twice
    err(seg(["a"], ["G1", "G2"], [2, 0, 1, 1, 1, 1, 0, 1, 2, 1, 1]), "E_BODY")
    assert "error" not in read_file(seg(["a"], ["G1", "G2"], [2, 0, 1, 1, 1, 1, 1, 1, 2, 1, 1]))


def test_strongs_text_twice():
    err(seg(["a"], ["G1", "G1"], [1, 0, 1, 1, 1, 1]), "E_BODY")


def test_entry_without_strong_key_and_key_without_book():
    err(seg(["a"], ["G1"], [0]), "E_BODY")
    err(seg(["a"], ["G1"], [1, 0, 0]), "E_BODY")


def test_strong_index_outside():
    err(seg(["a"], ["G1"], [1, 1, 1, 1, 1, 1]), "E_BODY")


@pytest.mark.parametrize("data", [
    [1, 0, 1, 1, 1, 1, 0],          # left over
    [1, 0, 1, 1, 1],                # cut short
    [],                             # no entry for the key
    [1, 0, 2, 1, 1, 1, 0, 1, 1],    # second book with delta 0
    [1, 0, 1, 0, 1, 1],             # first book 0
    [1, 0, 1, 67, 1, 1],            # book beyond 66
    [1, 0, 2, 60, 1, 1, 7, 1, 1],   # running sum 67
    [1, 0, 1, 1, 0, 0],             # verses 0
    [1, 0, 1, 1, 3, 2],             # verses above occurrences
])
def test_data_defects(data):
    err(seg(["a"], ["G1"], data), "E_BODY")


def test_book_66_and_edges():
    out = read_file(seg(["a"], ["G1"], [1, 0, 2, 1, 2, 2, 65, 1, 1]))
    assert out["entries"] == {"a": {"G1": {"gen": [2, 2], "rev": [1, 1]}}}


def test_bad_tables():
    h = {"class": "aligned", "v": 1, "lang": "es", "group": "a", "res": [["r", "v"]],
         "tables": {"keys": [1, True], "strongs": [1, True], "data": [1, True]}}
    err(build(h, {"keys": tx([]), "strongs": [1], "data": b""}).data, "E_BODY")
    err(build(h, {"keys": {"utf8": b"", "len": b""}, "strongs": [], "data": 5}).data, "E_BODY")
    err(build(h, {"keys": tx([]), "strongs": [], "data": b"\x80"}).data, "E_BODY")
    h2 = copy.deepcopy(h)
    h2["tables"]["data"] = [2, True]                  # a version this reader does not know, required
    err(build(h2, {"keys": tx([]), "strongs": [], "data": b""}).data, "E_TABLE")
    h3 = copy.deepcopy(h)
    del h3["tables"]["data"]                          # a required table of the schema missing
    err(build(h3, {"keys": tx([]), "strongs": []}).data, "E_BODY")


def test_header_v():
    b, _ = make([], [], [], group="a", h_extra={"v": 2})
    err(b.data, "E_BODY")


def cat_with(unit):
    b, expected, (h, t) = catalog_fixture()
    t = copy.deepcopy(t)
    t["units"].append(unit)
    return build(h, t).data


def test_catalog_optional_rules():
    out = read_file(cat_with({"id": "aligned:a-am", "segments": [0], "optional": True}))
    assert out["units"][-1] == {"id": "aligned:a-am", "segments": [0], "optional": True}
    assert "error" not in read_file(cat_with({"id": "aligned:the -thf", "segments": [0], "optional": True}))
    err(cat_with({"id": "aligned:a-am", "segments": [0], "optional": False}), "E_BODY")
    err(cat_with({"id": "aligned:a-am", "segments": [0], "optional": 1}), "E_BODY")
    err(cat_with({"id": "aligned:a-am", "segments": [0], "optional": "true"}), "E_BODY")
    err(cat_with({"id": "aligned:a-am", "segments": [0]}), "E_BODY")
    err(cat_with({"id": "aligned:other", "segments": [0]}), "E_BODY")
    for bad_id in ("aligned:A", "aligned:ab-a", "aligned:", "aligned:d-b", "aligned:a-b-c", "aligned:the ", "aligned:a-b "):
        err(cat_with({"id": bad_id, "segments": [0], "optional": True}), "E_BODY")
    err(cat_with({"id": "lex:G5", "segments": [0], "optional": True}), "E_BODY")
    err(cat_with({"id": "obs", "segments": [0], "optional": False}), "E_BODY")
