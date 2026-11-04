"""Ed25519 (RFC 8032 section 7.1 vectors, strictness) and the four signature cases of tests/README.md."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import ed25519  # noqa: E402
from lp3read import canonical_text, read_file  # noqa: E402

TESTS = HERE.parent / "tests"

# RFC 8032 section 7.1, TEST 1 and TEST 2 (public values only)
VECTORS = [
    ("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "",
     "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
    ("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
     "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
]


@pytest.mark.parametrize("pk,msg,sig", VECTORS)
def test_rfc_vectors(pk, msg, sig):
    pk, msg, sig = bytes.fromhex(pk), bytes.fromhex(msg), bytes.fromhex(sig)
    assert ed25519.verify(pk, msg, sig)
    for i in (0, 31, 32, 63):
        bad = bytearray(sig)
        bad[i] ^= 1
        assert not ed25519.verify(pk, msg, bytes(bad))
    assert not ed25519.verify(pk, msg + b"x", sig)
    assert not ed25519.verify(pk, msg, sig[:63])


def test_s_not_below_l_is_rejected():
    pk, msg, sig = (bytes.fromhex(x) for x in VECTORS[0])
    s = int.from_bytes(sig[32:], "little") + ed25519.L      # the same signature to the group, S >= L
    assert s < 2**256
    assert not ed25519.verify(pk, msg, sig[:32] + s.to_bytes(32, "little"))


def test_non_canonical_encodings_are_rejected():
    pk, msg, sig = (bytes.fromhex(x) for x in VECTORS[0])
    # y = p + 1 (non canonical y = 1), as R
    assert not ed25519.verify(pk, msg, (ed25519.P + 1).to_bytes(32, "little") + sig[32:])
    # x = 0 with the sign bit set (y = 1), as the public key
    assert not ed25519.verify((1 | 1 << 255).to_bytes(32, "little"), msg, sig)


CASES = ["catalog-signed", "catalog-bad-sig", "catalog-unknown-key", "catalog-unsigned-published"]


@pytest.mark.parametrize("name", CASES)
def test_case(name):
    folder = TESTS / name
    data = (folder / "catalog.seg").read_bytes()
    keys = json.loads((folder / "catalog.keys.json").read_text("utf-8"))
    expected = (folder / "catalog.expected.json").read_bytes().decode("utf-8")
    assert canonical_text(read_file(data, trusted=keys)) == expected
    proc = subprocess.run([sys.executable, "-I", "-X", "utf8", str(HERE / "lp3read.py"), str(folder / "catalog.seg"),
                           "--keys", str(folder / "catalog.keys.json")], capture_output=True)
    assert proc.stdout == expected.encode("utf-8")
    assert proc.returncode == (1 if name != "catalog-signed" else 0)
    # --trusted with the raw key, the id computed
    args = []
    for hexkey in keys.values():
        args += ["--trusted", hexkey]
    proc = subprocess.run([sys.executable, "-I", "-X", "utf8", str(HERE / "lp3read.py"), str(folder / "catalog.seg"),
                           *args], capture_output=True)
    if name != "catalog-bad-sig" or True:
        assert proc.stdout == expected.encode("utf-8")


def test_no_keys_ignores_sig():
    signed = (TESTS / "catalog-signed" / "catalog.seg").read_bytes()
    out = read_file(signed)
    assert "sig" not in out and "error" not in out
    assert out == read_file((TESTS / "catalog-unsigned-published" / "catalog.seg").read_bytes())


def test_key_listed_under_the_wrong_id_is_not_trusted():
    folder = TESTS / "catalog-signed"
    data = (folder / "catalog.seg").read_bytes()
    (kid, hexkey), = json.loads((folder / "catalog.keys.json").read_text("utf-8")).items()
    assert hashlib.sha256(bytes.fromhex(hexkey)).hexdigest()[:16] == kid
    assert read_file(data, trusted={"0" * 16: hexkey}) == {"error": "E_SIGNATURE"}
