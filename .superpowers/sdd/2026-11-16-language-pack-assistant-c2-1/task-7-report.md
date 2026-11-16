# Task 7 report: slow cards
Fix (client only, `query/renderings.ts`): per-original index key->positions and per-text index position->word ordinals (+ piece of each ordinal, chapter:verse by binary search), in WeakMaps keyed by the model object the reader caches. A call visits only the aligned words. No limit/"more" note: answers identical.
Equivalence: `renderings.equiv.test.ts` (old impl kept as `renderings.legacy.ts`) over every key of the Titus fixture + position queries; also run on the real en packs (G5485, G3056, H2617a, G26, H430, G3962 identical).
Times (en packs, desktop, SQL index, ms) before -> after. Scripts in lp3-c2-cache/c21/t7/ (t7-time.ts, t7-cold.ts, t7-equiv.ts).
- renderings G5485 warm: 617-1202 -> 6-8; H2617a warm: 1185-1487 -> 5-18; G26 warm: ~100 -> 2.
- Searches warm 20-60 (the-kingdom-of-God 110-220): not changed; already < 300 ms warm, index work is in SQLite. Cold search 170-650.
- Cold first call: G5485 11.3 s -> 7.5 s. It is dominated by reading+verifying segments (2.8 s) and decoding books (3.1 s) of the whole bible, plus ~0.9 s building the indexes on the first call. Not algorithmic in renderings; a prewarm (reader.book/orig for all books at startup) would move it out of the card. Left as is.
Tests: client `bun test` 344 pass, 1 fail: transfer.test.ts "a cut file" spec fixture (fails alone; not touched by this change, looks pre-existing, not investigated). tsc clean for client, assistant, language-pack-mcp. No assistant file edited.

## Fix round 1
1. Memory: heapUsed barely moves (it is noisy between runs, 850-1060 MB). With the first version (JS arrays), RSS grew ~100 MB per key call but includes garbage. After CSR typed arrays: arrayBuffers 27.4 -> 27.7 MB after G5485, 28.0 MB after 20 common keys (all en books). Indexes are well under 1 MB of buffers; the string-keyed Map per original is small.
2. Equivalence test now covers stale book, not installed (none installed, and installed-but-hidden), alt key (no xmap, G3972). 4 tests pass.
3. Legacy moved to test/renderingsLegacy.ts; `as TextLike` replaced by BookModel['texts'][number].
4. transfer "a cut file" on b84101dd: NOT confirmed. A temp worktree has no node_modules and `bun install` fails (better-sqlite3 gyp), so the test cannot run there. The failure is in a spec fixture compare (missing id differs), independent of renderings. Leftover empty-ish folder lp3-c2-cache/c21/t7/wt-b84 (deregistered; path too long for git to delete) can be removed by hand.
Tests: client 347 pass, 1 fail (that one); tsc client/assistant/mcp clean.

## Correction (final fix wave, R42): memory with heapUsed after Bun.gc(true)

en reader (`loadPacks('en')`, staging), 20 renderings calls over common keys, three fresh processes each; heapUsed after `Bun.gc(true)` minus before.
Indexed: 995.6, 925.5, 954.0 MB (median 954 MB). Same calls with the scan (`test/renderingsLegacy`): 947.1, 974.7, 905.3 MB (median 947 MB).
Almost all of it is the books and originals the calls load into the reader's caches (about 950 MB for en); the index's own share is
the difference of the medians, about +7 MB, inside the 30 MB noise of the runs. So the earlier "<1 MB arrayBuffers" was true of the typed arrays but did not
count the key maps; the index costs a few MB, under the 20 MB threshold, and the key maps were not changed to CSR. The 950 MB is the cost of loading all en books and is not new.
Scripts and logs: `wt/lp3-c2-cache/c21/ffix/` (`mem.ts`, `mem-legacy.ts`).
