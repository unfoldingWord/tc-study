"""Independent answers of the fixed queries (README.md of this folder).

Usage: python -I -X utf8 answers.py <sample dir> <queries dir> [<sources dir>]

The kind `topic` is computed from the SOURCE files of part B (the TIPNR text and the English OBS stories in
`<sources dir>`, else the environment variable LP3_SOURCES) and from the sample's originals and links; it is
skipped when there is no sources dir. The rules are those of ids.md and counts.md, written here again from the
specification, not read from the builders.

Stdlib only. It reads the raw parts of the phase 0 sample (`mapa.json` and `muestra.json`, each part a gzip of JSON
lines), builds the counts as counts.md says, answers every `<name>.json` of the queries dir whose kind it knows
(strong, usage, book, keyterms) and writes `expected` into it. It reads no builder and no reader of the format.

Counting rules (counts.md, ids.md):
  * a count is occurrences / links / notes; verses are distinct verse ids;
  * a row covers every verse of its range: both ends, and the verses the original has between them;
  * an introduction covers verse 0 of its chapter (chapter 0 for the book's);
  * a row whose reference cannot be read covers no verse and still counts.
Facts of the sample's raw rows that the rules need:
  * the English tN rows keep an introduction as a note with `isIntro` and the reference `C:1`; in chapter 1 the first
    `isIntro` note is the book's introduction (`front:intro`), any other is the chapter's (`C:intro`);
  * the tWL rows of Psalms say `N:front` for a psalm's title, which is `N:intro`.
"""
import gzip
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

BOOKS = ("gen exo lev num deu jos jdg rut 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam ezk dan "
         "hos jol amo oba jon mic nam hab zep hag zec mal mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti "
         "2ti tit phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev").split()
NUM = {b: i + 1 for i, b in enumerate(BOOKS)}
UHB, UGNT = "unfoldingWord/hbo/uhb", "unfoldingWord/el-x-koine/ugnt"
TWL, TN = "unfoldingWord/en/twl", "unfoldingWord/en/tn"
UNITS = {"strong": "occurrences", "links": "links", "notes": "notes"}


def vid(book, chapter, verse):
    return NUM[book] * 1_000_000 + chapter * 1000 + verse


# ---- the sample -------------------------------------------------------------------------------------------------

class Sample:
    def __init__(self, folder):
        self.folder = Path(folder)
        self.parts, seen = [], set()
        for name in ("muestra.json", "mapa.json"):
            for p in json.loads((self.folder / name).read_text(encoding="utf-8-sig")):
                if (p["lang"], p["sha256"]) not in seen:
                    seen.add((p["lang"], p["sha256"]))
                    self.parts.append(p)

    def rows(self, part):
        data = gzip.decompress((self.folder / "parts" / f"{part['sha256']}.part.gz").read_bytes())
        for line in data.split(b"\n"):
            if line:
                yield json.loads(line)

    def select(self, lang, resource, kind):
        return sorted((p for p in self.parts if p["lang"] == lang and p["resource"] == resource and p["kind"] == kind
                       and p.get("book") in NUM), key=lambda p: NUM[p["book"]])


def first_number(s):
    m = re.search(r"\d+", str(s))
    return int(m.group(0)) if m else 0


def key_of(strong):
    return strong.split(":")[-1]


class Original:
    """Words (verse id, text, strong key) in document order, and the verse ids the book has."""

    def __init__(self, sample, part):
        self.book = part["book"]
        self.words = []
        self.verses = set()
        head = f"scripture-usj:{part['resource']}:{self.book}:"
        chapters = []
        for r in sample.rows(part):
            k = r["key"]
            if r["layer"] == "sot" and k.startswith(head) and k[len(head):].isdigit():
                chapters.append((int(k[len(head):]), r))
        for _, r in sorted(chapters, key=lambda x: x[0]):
            self.walk(r["value"]["content"]["usj"]["content"], [0, 0])

    def walk(self, nodes, cv):
        for n in nodes:
            if not isinstance(n, dict):
                continue
            t = n.get("type")
            if t == "chapter":
                cv[0], cv[1] = int(n["number"]), 0
            elif t == "verse":
                cv[1] = first_number(n["number"])
                self.verses.add(vid(self.book, cv[0], cv[1]))
            elif t == "char" and n.get("marker") == "w":
                text = "".join(x for x in n.get("content", []) if isinstance(x, str))
                self.words.append((vid(self.book, cv[0], cv[1]), text, key_of(n["strong"]) if n.get("strong") else None))
                continue
            if isinstance(n.get("content"), list):
                self.walk(n["content"], cv)


# ---- references -------------------------------------------------------------------------------------------------

def read_reference(book, ref, verses):
    """The verse ids a reference text covers; None when it cannot be read (it still counts)."""
    ref = (ref or "").strip()
    if ref == "front:intro":
        return [vid(book, 0, 0)]
    m = re.fullmatch(r"(\d+):(?:intro|front)", ref)
    if m:
        return [vid(book, int(m.group(1)), 0)]
    out = []
    chapter = None
    for i, piece in enumerate(ref.split(",")):
        m = re.fullmatch(r"(?:(\d+):)?(\d+)(?:-(?:(\d+):)?(\d+))?", piece.strip())
        if not m:
            return None
        c1 = int(m.group(1)) if m.group(1) else chapter
        if c1 is None:
            return None
        chapter = c1
        a = vid(book, c1, int(m.group(2)))
        if m.group(4) is None:
            out.append(a)
            continue
        c2 = int(m.group(3)) if m.group(3) else c1
        b = vid(book, c2, int(m.group(4)))
        if b < a:
            return None
        out.append(a)
        out.append(b)
        out.extend(v for v in verses if a < v < b)
    return out


class Counts:
    """table: key -> book -> [count, set of verse ids]."""

    def __init__(self):
        self.data = defaultdict(lambda: defaultdict(lambda: [0, set()]))

    def add(self, key, book, verses):
        e = self.data[key][book]
        e[0] += 1
        e[1].update(verses or [])


def tw_id(link):
    m = re.search(r"bible/(kt|names|other)/([^/\s\]]+)", link.get("articlePath") or link.get("twLink") or "")
    return f"tw:{m.group(1)}/{m.group(2)}".lower() if m else None


def ta_id(ref):
    m = re.search(r"rc://[^/]*/ta/man/([A-Za-z]+)/([A-Za-z0-9-]+)", ref or "")
    return f"ta:{m.group(1)}/{m.group(2)}".lower() if m else None


# ---- loading ------------------------------------------------------------------------------------------------------

def load(sample):
    world = {"coverage": {}, "tables": {"strong": Counts(), "links": Counts(), "notes": Counts()}, "originals": {},
             "links": [], "partial": {}, "unreadable": defaultdict(int), "odd": []}
    for res in (UHB, UGNT):
        parts = sample.select("originals", res, "original")
        world["coverage"][res] = {p["book"] for p in parts}
        for p in parts:
            o = Original(sample, p)
            world["originals"][p["book"]] = o
            for v, _text, s in o.words:
                if s:
                    world["tables"]["strong"].add(s, p["book"], [v])
    for res, table in ((TWL, "links"), (TN, "notes")):
        parts = sample.select("en", res, "book")
        world["coverage"][res] = {p["book"] for p in parts}
        for p in parts:
            b = p["book"]
            vs = world["originals"][b].verses if b in world["originals"] else set()
            for r in sample.rows(p):
                if r["layer"] != "sot":
                    continue
                if table == "links" and r["key"] == f"twl:{res}:{b}":
                    for link in r["value"].get("links") or []:
                        cid = tw_id(link)
                        if cid:
                            ids = read_reference(b, link.get("reference"), vs)
                            if ids is None:
                                world["unreadable"][table] += 1
                            world["tables"]["links"].add(cid, b, ids)
                            world["links"].append((cid, b, link))
                elif table == "notes" and re.fullmatch(re.escape(f"tn:{res}:{b}:") + r"\d+", r["key"]):
                    ch = int(r["key"].rsplit(":", 1)[1])
                    first_intro = True
                    for note in r["value"]["content"].get("notes") or []:
                        if note.get("isIntro"):
                            book_intro = ch == 1 and first_intro
                            first_intro = False
                            ids = [vid(b, 0, 0) if book_intro else vid(b, ch, 0)]
                        else:
                            ids = read_reference(b, note.get("reference"), vs)
                            if ids is None:
                                world["unreadable"][table] += 1
                        cid = ta_id(note.get("supportReference"))
                        if cid:
                            world["tables"]["notes"].add(cid, b, ids)
    return world


# ---- cells and answers --------------------------------------------------------------------------------------------

def cell(world, table, source, key, book):
    cov = world["coverage"].get(source, set())
    row = world["tables"][table].data.get(key, {}).get(book)
    if book in world["partial"].get(source, set()):
        n, vs = row if row else (0, ())
        return {"state": "partial", "count": n, "verses": len(vs)}
    if book not in cov:
        return {"state": "none"}
    if row is None:
        return {"state": "zero", "count": 0, "verses": 0}
    return {"state": "count", "count": row[0], "verses": len(row[1])}


def strong_source(book):
    return UHB if NUM[book] <= 39 else UGNT


def answer_strong(world, q):
    t = world["tables"]["strong"].data
    key = q["key"]
    for k in (key, key + "0" if re.fullmatch(r"G\d{4}", key) else None):
        if k and k in t:
            key = k
            break
    return {"kind": "strong", "key": key, "unit": "occurrences",
            "books": {b: cell(world, "strong", strong_source(b), key, b) for b in BOOKS}}


SOURCE_TABLE = {TWL: "links", TN: "notes"}


def answer_usage(world, q):
    s = q["source"]
    out = {"kind": "usage", "concept": q["concept"], "source": s}
    if s not in SOURCE_TABLE:
        out["books"] = {b: {"state": "none"} for b in BOOKS}
        return out
    table = SOURCE_TABLE[s]
    out["unit"] = UNITS[table]
    out["books"] = {b: cell(world, table, s, q["concept"], b) for b in BOOKS}
    return out


def answer_book(world, q):
    b = q["book"]
    cov = {s: ("whole" if b in books else "none") for s, books in world["coverage"].items()}
    tables = {}
    for t, counts in world["tables"].items():
        tables[t] = {"unit": UNITS[t], "keys": sum(1 for rows in counts.data.values() if b in rows)}
    return {"kind": "book", "book": b, "coverage": cov, "tables": tables}


def fold(text):
    return unicodedata.normalize("NFC", text.replace("/", "").replace("\u2060", ""))


def loose(text):
    t = unicodedata.normalize("NFD", fold(text))
    return "".join(c for c in t if not unicodedata.category(c).startswith("M")).replace("\u05be", "")


def link_strongs(world):
    """concept -> sorted Strong keys of the original words its English links quote."""
    by_verse = {}
    for b, o in world["originals"].items():
        d = defaultdict(list)
        for v, text, s in o.words:
            d[v].append((text, s))
        by_verse[b] = d
    found = defaultdict(set)
    missed = []
    for cid, b, link in world["links"]:
        if not cid.startswith("tw:"):
            continue
        ref = (link.get("reference") or "").strip()
        m = re.match(r"(\d+):(\d+|front|intro)", ref)
        if not m or b not in by_verse:
            missed.append((b, ref))
            continue
        v = vid(b, int(m.group(1)), 0 if m.group(2) in ("front", "intro") else int(m.group(2)))
        words = by_verse[b].get(v, [])
        occ = int(link.get("occurrence") or 1)
        hit = []
        for piece in (link.get("origWords") or "").split("&"):
            quote = [w for w in re.split(r"[\s\u05be]+", piece.strip()) if w and w != "\u05c0"]
            run = None
            for norm in (fold, loose):
                q = [norm(w) for w in quote]
                starts = [i for i in range(len(words) - len(q) + 1)
                          if q and all(norm(words[i + j][0]) == q[j] for j in range(len(q)))]
                if starts and occ == -1:
                    run = [(i, len(q)) for i in starts]
                elif starts and 1 <= occ <= len(starts):
                    run = [(starts[occ - 1], len(q))]
                if run:
                    break
            if run is None:
                hit = None
                break
            hit += run
        if not hit:
            missed.append((b, ref, link.get("origWords")))
            continue
        for i, n in hit:
            for _t, s in words[i:i + n]:
                if s:
                    found[cid].add(s)
    return {k: sorted(v) for k, v in found.items()}, missed


def answer_keyterms(world, q, strongs):
    b = q["book"]
    present = {k for k, rows in world["tables"]["strong"].data.items() if b in rows}
    cands = []
    for cid, keys in strongs.items():
        if not cid.startswith("tw:kt/"):
            continue
        matched = sorted(present & set(keys))
        if matched:
            cands.append({"concept": cid, "strongs": keys, "matched": matched})
    cands.sort(key=lambda c: (-len(c["matched"]), c["concept"]))
    return {"kind": "keyterms", "book": b, "candidates": cands}


# ---- topics (ids.md, xtopics.cddl) ------------------------------------------------------------------------------------

TIPNR_KEY, OBS_KEY, BUILDER_KEY = "STEPBible/STEPBible-Data/TIPNR", "unfoldingWord/en/obs", "builder"
# The one event the builder owns (ids.md "Ids of events"): Exodus 7:14 to 12:36.
BUILDER_EVENTS = {"ev:plagues-of-egypt": ("Plagues of Egypt", vid("exo", 7, 14), vid("exo", 12, 36))}
OBS_NAMES = dict(pair.split(":") for pair in (
    "genesis:gen|exodus:exo|leviticus:lev|numbers:num|deuteronomy:deu|joshua:jos|judges:jdg|ruth:rut|1 samuel:1sa|2 samuel:2sa|"
    "1 kings:1ki|2 kings:2ki|1 chronicles:1ch|2 chronicles:2ch|ezra:ezr|nehemiah:neh|esther:est|job:job|psalm:psa|psalms:psa|"
    "proverbs:pro|ecclesiastes:ecc|song of solomon:sng|isaiah:isa|jeremiah:jer|lamentations:lam|ezekiel:ezk|daniel:dan|"
    "hosea:hos|joel:jol|amos:amo|obadiah:oba|jonah:jon|micah:mic|nahum:nam|habakkuk:hab|zephaniah:zep|haggai:hag|"
    "zechariah:zec|malachi:mal|matthew:mat|mark:mrk|luke:luk|john:jhn|acts:act|romans:rom|1 corinthians:1co|2 corinthians:2co|"
    "galatians:gal|ephesians:eph|philippians:php|colossians:col|1 thessalonians:1th|2 thessalonians:2th|1 timothy:1ti|"
    "2 timothy:2ti|titus:tit|philemon:phm|hebrews:heb|james:jas|1 peter:1pe|2 peter:2pe|1 john:1jn|2 john:2jn|3 john:3jn|"
    "jude:jud|revelation:rev").split("|"))


def slug(text):
    return re.sub(r"[^a-z0-9-]", "", text.lower().replace(" ", "-").replace("'", "-"))


def read_tipnr(path):
    """People and places of the TIPNR text: id, kind, unique name, uStrong, dStrongs and the verses of all its name lines."""
    drafts, kind, cur = [], None, None
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.startswith("$"):
            title = re.sub(r"^\$=*\s*", "", line).split("\t")[0].strip()
            kind = "per" if title.startswith("PERSON") else "lug" if title in ("PLACE", "PLACE+PERSON") else None
            cur = None
            continue
        if kind is None or not line:
            continue
        cols = line.split("\t")
        if cols[0].startswith("–"):  # an en dash: a name line of the record above
            if cur is None or cols[0].strip() == "– Total" or len(cols) < 3:
                continue
            d = cols[2].split("«")[0].strip()
            if d:
                cur["dstrongs"].append(d)
            for ref in re.split(r"[;,]", cols[4] if len(cols) > 4 else ""):
                m = re.fullmatch(r"([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)[a-z]?", ref.strip())
                if m and m.group(1).lower() in NUM:
                    cur["verses"].add(vid(m.group(1).lower(), int(m.group(2)), int(m.group(3))))
            continue
        if len(cols) < 8 or not re.fullmatch(r"[^\s*@][^@\t]*@[1-3]?[A-Za-z]+\.\d+\.\d+[^=\t]*=[HG]\d{4}\w*", cols[0]):
            continue
        unique, _, ustrong = cols[0].rpartition("=")
        first = re.search(r"@([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)", unique)
        cur = {"kind": kind, "unique": unique.strip(), "ustrong": ustrong.strip(), "slug": slug(unique.split("@")[0]),
               "suffix": f"{first.group(1).lower()}-{first.group(2)}-{first.group(3)}" if first else "",
               "dstrongs": [], "verses": set()}
        drafts.append(cur)
    shared = defaultdict(int)
    for d in drafts:
        shared[(d["kind"], d["slug"])] += 1
    used = defaultdict(int)
    for d in drafts:
        tail = f"{d['slug']}-{d['suffix']}" if shared[(d["kind"], d["slug"])] > 1 and d["suffix"] else d["slug"]
        pid = f"{d['kind']}:{tail}"
        used[pid] += 1
        d["id"] = pid if used[pid] == 1 else f"{pid}-{used[pid]}"
    return drafts


def read_obs(folder, originals):
    """story number -> [(first verse id, last verse id)] from the closing line `_A Bible story from: ..._`."""
    def last_verse(book, chapter):
        o = originals.get(book)
        return max((v % 1000 for v in o.verses if v // 1000 % 1000 == chapter), default=None) if o else None
    out = {}
    for f in sorted(Path(folder).glob("[0-9][0-9].md")):
        m = re.search(r"^_A Bible story from:\s*(.+?)_\s*$", f.read_text(encoding="utf-8"), re.M)
        if not m:
            continue
        book, ranges = None, []
        for piece in re.split(r"[;,]", m.group(1)):
            piece = piece.strip()
            wb = re.fullmatch(r"((?:[1-3] )?[A-Za-z][A-Za-z ]*?)\s+(\d.*)", piece)
            if wb:
                book = OBS_NAMES.get(wb.group(1).lower())
                piece = wb.group(2)
            p = re.fullmatch(r"(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?", piece)
            if not book or not p:
                continue
            c1, v1, c2, v2 = (int(g) if g else None for g in p.groups())
            if v1 is None and v2 is not None:  # "3-4:22"
                rng = (vid(book, c1, 1), vid(book, c2, v2))
            elif v1 is None:  # whole chapters "3", "5-10"
                last = last_verse(book, c2 or c1)
                if last is None:
                    continue
                rng = (vid(book, c1, 1), vid(book, c2 or c1, last))
            elif c2 is None:
                rng = (vid(book, c1, v1), vid(book, c1, v1))
            elif v2 is None:  # "3:1-6"
                rng = (vid(book, c1, v1), vid(book, c1, c2))
            else:
                rng = (vid(book, c1, v1), vid(book, c2, v2))
            if rng[0] <= rng[1]:
                ranges.append(rng)
        if ranges:
            out[int(f.stem)] = ranges
    return out


def dbase(key):
    m = re.match(r"([HG])(\d+)", key.split(":")[-1])
    if not m:
        return None
    # Greek: the first four digits, leading zeros kept (G00110 is G0011); Hebrew: the number, padded to four digits
    if m.group(1) == "G":
        return "G" + m.group(2).zfill(4)[:4]
    return "H" + re.sub(r"^0+(?=\d{4})", "", m.group(2)).zfill(4)


def topic_cell(book, covered, rows):
    if book not in covered:
        return {"state": "none"}
    if rows.get(book):
        return {"state": "count", "count": len(rows[book]), "verses": len(rows[book])}
    return {"state": "zero", "count": 0, "verses": 0}


def answer_topic(world, tipnr, obs, q):
    tid = q["id"]
    originals = world["originals"]
    rows = defaultdict(set)  # book -> verse ids
    covered = set()
    rec = next((d for d in tipnr if d["id"] == tid), None)
    if rec:
        covered = {BOOKS[v // 1_000_000 - 1] for d in tipnr for v in d["verses"]} & set(originals)
        for v in rec["verses"]:
            if BOOKS[v // 1_000_000 - 1] in originals:
                rows[BOOKS[v // 1_000_000 - 1]].add(v)
        shown = {"kind": "person" if rec["kind"] == "per" else "place", "source": TIPNR_KEY, "ref": rec["unique"],
                 "title": rec["unique"].split("@")[0].strip(), "ustrong": rec["ustrong"]}
    elif tid in BUILDER_EVENTS:
        title, a, z = BUILDER_EVENTS[tid]
        for b, o in originals.items():
            for v in o.verses:
                if a <= v <= z and v % 1000 != 0:
                    rows[b].add(v)
        covered = set(rows)
        shown = {"kind": "event", "source": BUILDER_KEY, "ref": tid, "title": title}
    else:
        return {"kind": "topic", "id": tid, "installed": True, "found": False}
    verses = sorted(v for vs in rows.values() for v in vs)
    stories = [f"obs:{n}" for n, rs in sorted(obs.items()) if any(a <= v <= z for a, z in rs for v in verses)]
    relations = []
    if tid in BUILDER_EVENTS:
        # occurs-in: from each story whose ranges overlap the event's range (confidence 60); the event is the `to` end
        _, ea, ez = BUILDER_EVENTS[tid]
        for n, rs in sorted(obs.items()):
            if any(a <= ez and ea <= z for a, z in rs):
                relations.append({"from": f"obs:{n}", "to": tid, "type": "occurs-in", "source": OBS_KEY, "confidence": 60})
    types = q.get("types")
    if rec and (types is None or "same-as" in types):
        links = world["tables"]["links"].data
        for cid in sorted(c for c in world["tw_strongs"] if c.startswith("tw:names/")):
            tw_verses = {v for cell_ in links[cid].values() for v in cell_[1]} if cid in links else set()
            bases = {dbase(k) for k in world["tw_strongs"][cid]}
            cands = [d for d in tipnr if bases & {dbase(x) for x in d["dstrongs"]}]
            found = [d for d in cands if d["verses"] & tw_verses]
            if len(found) == 1 and found[0]["id"] == tid:
                relations.append({"from": cid, "to": tid, "type": "same-as", "source": TIPNR_KEY, "confidence": 70})
    return {"kind": "topic", "id": tid, "installed": True, "found": True, "topic": shown, "unit": "verses",
            "books": {b: topic_cell(b, covered, rows) for b in BOOKS}, "verses": verses, "stories": stories,
            "relations": relations, "names": []}


def totals(counts, key):
    rows = counts.data.get(key, {})
    return sum(r[0] for r in rows.values()), sum(len(r[1]) for r in rows.values()), len(rows)


def expect(label, got, want):
    if got != want:
        raise AssertionError(f"{label}: got {got!r}, phase 0 says {want!r}")


def checks(world, strongs, missed):
    T = world["tables"]
    out = []
    n, v, b = totals(T["strong"], "G54850")
    out.append(f"G5485: {n} occurrences in {v} verses of {b} books")
    expect("G5485", (n, v, b), (156, 148, 23))
    n, v, b = totals(T["links"], "tw:names/abraham")
    gen = T["links"].data["tw:names/abraham"].get("gen", [0, ()])[0]
    out.append(f"tw:names/abraham: {n} links in {v} verses of {b} books (gen {gen})")
    expect("abraham", (n, v, b, gen), (291, 259, 21, 190))
    met = T["notes"].data["ta:translate/figs-metaphor"]
    psa, tit = met.get("psa", [0, ()]), met.get("tit", [0, ()])
    out.append(f"figs-metaphor: psa {psa[0]} notes in {len(psa[1])} verses, tit {tit[0]} in {len(tit[1])}")
    expect("metaphor psa/tit", (psa[0], len(psa[1]), tit[0], len(tit[1])), (1175, 949, 22, 21))
    none = [x for x in ("num 1ch 2ch ecc isa jer ezk".split()) if x not in world["coverage"][TN]]
    out.append(f"figs-metaphor none in tN: {' '.join(none)}")
    expect("tN without source", none, "num 1ch 2ch ecc isa jer ezk".split())
    expect("figs-metaphor in tN books", [x for x in "num 1ch 2ch ecc isa jer ezk".split() if x in met], [])
    out.append("isa coverage: " + ", ".join(f"{s.rsplit('/', 1)[-1]}={'whole' if 'isa' in cv else 'none'}"
                                           for s, cv in world["coverage"].items()))
    expect("isa coverage", {s.rsplit("/", 1)[-1]: "isa" in cv for s, cv in world["coverage"].items()},
           {"uhb": True, "ugnt": False, "twl": False, "tn": False})
    kt = sorted(((k, r["rut"][0]) for k, r in T["links"].data.items() if "rut" in r and k.startswith("tw:kt/")),
                key=lambda kv: (-kv[1], kv[0]))
    out.append(f"rut tw:kt links: {len(kt)} concepts: " + ", ".join(f"{k[6:]} {n}" for k, n in kt[:6]))
    expect("rut key terms", (len(kt), [(k[6:], n) for k, n in kt[:4]]),
           (22, [("redeem", 23), ("yahweh", 18), ("good", 6), ("bless", 5)]))
    out.append(f"unreadable references (counted, no verse): {dict(world['unreadable'])}")
    nl = sum(1 for c, *_ in world["links"] if c.startswith("tw:"))
    out.append(f"quotes not found in the original: {len(missed)} of {nl} tw links; "
               f"concepts with strongs: {len(strongs)}")
    expect("links without a found quote", (len(missed), nl), (57, 85764))
    return out


def main():
    sample = Sample(sys.argv[1])
    qdir = Path(sys.argv[2])
    world = load(sample)
    strongs, missed = link_strongs(world)
    world["tw_strongs"] = strongs
    sources = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("LP3_SOURCES")
    tipnr = obs = None
    if sources:
        tipnr = read_tipnr(next((Path(sources) / "tipnr").glob("*.txt")))
        obs = read_obs(Path(sources) / "en_obs" / "obs-repo" / "content", world["originals"])
    for f in sorted(qdir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        q = doc["query"]
        kind = q["kind"]
        if kind == "strong":
            doc["expected"] = answer_strong(world, q)
        elif kind == "usage":
            doc["expected"] = answer_usage(world, q)
        elif kind == "book":
            doc["expected"] = answer_book(world, q)
        elif kind == "keyterms":
            doc["expected"] = answer_keyterms(world, q, strongs)
        elif kind == "topic" and tipnr is not None:
            doc["expected"] = answer_topic(world, tipnr, obs, q)
        else:
            print(f"{f.name}: kind {kind} not computed")
            continue
        f.write_text(json.dumps(doc, sort_keys=True, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        print(f"wrote {f.name}")
    print("\n".join(checks(world, strongs, missed)))
    for m in missed[:5]:
        print("  missed:", m)


if __name__ == "__main__":
    main()
