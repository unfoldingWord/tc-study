"""Writes the container examples of container.md and what a reader must get from each.

Usage: python make_examples.py   (needs cbor2; writes next to this file)

minimal.seg     a valid book segment: Titus 1:1, "Pablo, siervo de Dios", one text, no helps
truncated.seg   minimal.seg without its last 10 bytes          -> E_TRUNCATED
bad-id.seg      minimal.seg with the first byte of its id flipped -> E_ID
*.expected.json what a reader outputs for each (tests/README.md, "Reader output")

This is a tiny encoder for one example, kept apart from the builder on purpose: if the builder and this script
disagree on these bytes, one of them misreads the specification.
"""
import hashlib
import json
import struct
import zlib
from collections import Counter
from pathlib import Path

import cbor2

HERE = Path(__file__).parent
MAGIC = bytes([0x89, 0x54, 0x4C, 0x50])


def uvarints(values):
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


def string_table(uses):
    """Most used first, ties by code point (container.md)."""
    return [s for s, _ in sorted(Counter(uses).items(), key=lambda kv: (-kv[1], kv[0]))]


def minimal_body():
    pieces = [('Pablo', True), (', ', False), ('siervo', True), (' ', False), ('de', True), (' ', False), ('Dios', True)]
    events = [(0, 0, '1'), (0, 2, 'para:p'), (0, 1, '1'), (7, 3, None)]   # chapter 1, open para:p, verse 1, close
    strings = string_table([p for p, _ in pieces] + [a for _, _, a in events if a is not None])
    index = {s: i for i, s in enumerate(strings)}
    tok = uvarints(index[p] * 2 + (1 if w else 0) for p, w in pieces)
    ev, last = [], 0
    for pos, code, arg in events:
        ev += [pos - last, code, index[arg] if arg is not None else 0]
        last = pos
    h = {
        'class': 'book', 'v': 1,
        'tables': {'strings': [1, True], 'texts': [1, True]},
        'lang': 'es-419', 'book': 'tit',
        'orig': ['unfoldingWord/el-x-koine/ugnt', 'g987ab2025a'],
        'res': [['es-419_gl/es-419/glt', 'v42']],
    }
    t = {'strings': strings, 'texts': [{'res': 0, 'tok': tok, 'ev': uvarints(ev)}]}
    return h, t, pieces, events


def segment_file(h, t):
    body = cbor2.dumps({'h': h, 't': t}, canonical=True)
    c = zlib.compressobj(9, zlib.DEFLATED, -15, 9)
    compressed = c.compress(body) + c.flush()
    header = cbor2.dumps({'h': h, 'codec': 'deflate-raw', 'clen': len(compressed), 'ulen': len(body),
                          'id': hashlib.sha256(body).digest()}, canonical=True)
    return MAGIC + bytes([3, 0, 1, 0]) + struct.pack('>I', len(header)) + header + compressed, body, header


def main():
    h, t, pieces, events = minimal_body()
    data, body, header = segment_file(h, t)
    (HERE / 'minimal.seg').write_bytes(data)
    names = {0: 'chapter', 1: 'verse', 2: 'open', 3: 'close'}
    expected = {
        'id': hashlib.sha256(body).hexdigest(),
        'h': h,
        'texts': [{
            'res': 'es-419_gl/es-419/glt',
            'pieces': [[p, w] for p, w in pieces],
            'events': [[pos, names[code], arg or ''] for pos, code, arg in events],
        }],
    }
    (HERE / 'minimal.expected.json').write_text(json.dumps(expected, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')

    (HERE / 'truncated.seg').write_bytes(data[:-10])
    (HERE / 'truncated.expected.json').write_text(json.dumps({'error': 'E_TRUNCATED'}) + '\n', encoding='utf-8')

    # Flip the first byte of the id inside the header: the header stays a valid CBOR map of the same length.
    id_at = data.index(hashlib.sha256(body).digest())
    bad = bytearray(data)
    bad[id_at] ^= 0xFF
    (HERE / 'bad-id.seg').write_bytes(bytes(bad))
    (HERE / 'bad-id.expected.json').write_text(json.dumps({'error': 'E_ID'}) + '\n', encoding='utf-8')

    print(f'minimal.seg: {len(data)} bytes (header {len(header)}, body {len(body)} -> {len(data) - 12 - len(header)} compressed)')
    print(f'id {hashlib.sha256(body).hexdigest()}')


if __name__ == '__main__':
    main()
