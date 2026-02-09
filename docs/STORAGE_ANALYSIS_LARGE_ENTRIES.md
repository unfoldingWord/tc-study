# Storage Analysis: Large JSON Objects and Splitting Strategies

**Purpose:** Plan how we store large content (e.g. full books like Genesis) and how we could split storage into more tables or smaller entries to avoid IndexedDB per-entry size limits on mobile.

**Scope:** Adaptable storage system used by tc-study (cache, catalog, package storage). No code changes in this doc—planning only.

---

## 1. Current Architecture Overview

### 1.1 Storage Layers

| Layer | Package / Adapter | IndexedDB DB Name | Store Name | Role |
|-------|-------------------|-------------------|------------|------|
| **Content cache** | `@bt-synergy/cache-adapter-indexeddb` | `tc-study-cache` | `cache-entries` | Persist loaded resource content (scripture, TN, TQ, TA, etc.) |
| **Catalog** | `IndexedDBCatalogAdapter` (app) | `tc-study-catalog` | `catalog-entries` | Resource metadata only (no content) |
| **Packages** | `@bt-synergy/package-storage` → `IndexedDBPackageStorage` | `resource-packages` | `packages` | Workspace/collection packages (config, not content) |

Content that can be “big” is only in the **content cache**. Catalog and package storage hold small records.

### 1.2 How Content Reaches the Cache

- **CatalogManager** exposes `cacheAdapter` (and `catalogAdapter`) to the app and to loaders.
- **Loaders** (ScriptureLoader, TranslationNotesLoader, TranslationQuestionsLoader, TranslationAcademyLoader, etc.) receive `cacheAdapter` and call `get(key)` / `set(key, data)`.
- In tc-study, `cacheAdapter` is an **IndexedDBCacheAdapter** instance (from `@bt-synergy/cache-adapter-indexeddb`).
- The adapter implements **CacheStorageAdapter** (resource-cache): `get(key)` returns `CacheEntry | null`, `set(key, entry: CacheEntry)`.
- **CacheEntry** shape: `{ content: any, metadata?: object, cachedAt?: string, expiresAt?: string, ... }`.
- Each IndexedDB record is stored as: **`{ key: string, entry: CacheEntry }`** in a single object store. The **value** of one record is the whole `{ key, entry }`; the “big” part is `entry.content`.

So: **one logical cache key = one IndexedDB record = one put()**. There is no splitting today; a large `entry.content` (e.g. full ProcessedScripture for Genesis) is one value and can hit browser/device limits (e.g. “serialized value too large” on some mobile browsers).

---

## 2. Where Big JSON Objects Are Stored

### 2.1 Cache Key Patterns and Value Sizes (Approximate)

| Source | Key Pattern | What’s in `entry.content` | Typical size | Risk |
|--------|-------------|----------------------------|--------------|------|
| **ScriptureLoader** | `scripture:{resourceKey}:{bookId}` | ProcessedScripture (all chapters, verses, tokens) for **one book** | 100 KB – **2 MB+** (e.g. Genesis) | **High** |
| **TranslationNotesLoader** | `tn:{resourceKey}:{bookCode}` | ProcessedNotes for one book | Tens to low hundreds of KB | Medium (large books) |
| **TranslationQuestionsLoader** | `tq:{resourceKey}:{bookCode}` | ProcessedQuestions for one book | Similar to TN | Medium |
| **TranslationAcademyLoader** | `{resourceKey}/{entryId}` | One article / entry | Small | Low |
| **ResourceCompletenessChecker** | `resource:{resourceKey}` | Metadata only (downloaded ingredients, completion flags) | Small | Low |
| **Background download worker** | Same keys as loaders | Same as above (writes via same cache adapter) | Same as above | Same |

So the only **very large** values in the current design are:

- **Scripture:** one entry per **book** (e.g. `scripture:owner/lang/id:gen`). The whole book (50 chapters for Genesis, with tokens, alignments, etc.) is one `content` blob.
- TN/TQ per **book** can be large for big books but are usually smaller than scripture.

### 2.2 Flow Summary

- **Read path:** Loader calls `cacheAdapter.get(cacheKey)`. Adapter does one `store.get(key)` and returns `result.entry`.
- **Write path:** Loader calls `cacheAdapter.set(cacheKey, { content, ... })`. Adapter does one `store.put({ key, entry })`.
- **Single record size** = size of the serialized `{ key, entry }` when IndexedDB does its structured clone. For Genesis, that’s dominated by `entry.content` (ProcessedScripture).

No other tables or stores are used for these blobs; it’s a single key-value store per database.

---

## 3. Current Table / Store Layout

- **tc-study-cache**  
  - One object store: **cache-entries** (keyPath: `key`).  
  - One record per cache key; record = `{ key, entry }`.  
  - All resource types (scripture, tn, tq, ta, resource metadata) share this store.

- **tc-study-catalog**  
  - One object store: **catalog-entries** (keyPath: `key`).  
  - One record per resource key; record = `{ key, metadata }`.  
  - Metadata only; no large content.

- **resource-packages**  
  - One object store: **packages** (keyPath: `id`).  
  - One record per package.  
  - Package config/spec, not scripture content; sizes are modest.

So today we have **one content store** that mixes small and (potentially) very large entries. There is no separation by size or by “logical table” (e.g. scripture vs TN).

---

## 4. Why Mobile Fails on Big Books

- IndexedDB allows large **total** storage per origin but may limit the **size of a single value** per `put()` (e.g. some mobile WebKit/Safari or older Chrome).
- When the app opens Genesis, ScriptureLoader fetches and processes the book, then calls `cacheAdapter.set('scripture:...:gen', { content: processedScripture, ... })`.
- That one `put()` can exceed the per-value limit → “IndexedDB entry too large” (or similar).
- No splitting or chunking is done today, so the only fix without a design change would be adapter-level chunking (same key, value split across multiple physical records). The user asked to explore **splitting into more tables or entries** instead of only chunking, so the rest of this doc focuses on that.

---

## 5. Options for Splitting Storage (Planning Only)

### 5.1 Option A: Store Scripture by Chapter (More, Smaller Entries)

**Idea:** Change the **granularity** of scripture cache keys from “per book” to “per chapter”.

- **Key pattern:** e.g. `scripture:{resourceKey}:{bookId}:{chapter}` (e.g. `scripture:owner/lang/id:gen:1`, `...:gen:2`, …).
- **Value:** One chapter’s worth of processed data (e.g. one element of `ProcessedScripture.chapters` plus shared metadata or a slim book-level record).
- **Pros:**  
  - Each entry is much smaller; well below typical per-value limits.  
  - Only load/cache chapters that are actually viewed (and optionally adjacent).  
  - Aligns with “view one chapter at a time” UX.
- **Cons:**  
  - ScriptureLoader (and any consumer) must **assemble** a book from N chapter entries when a full-book view or API is needed.  
  - Need a clear contract: what is stored per chapter (e.g. chapter index, verses, tokens) and what is stored once per book (e.g. book metadata, TOC).  
  - Background “download full book” would write N entries instead of 1; list/iterator by prefix would be required.
- **Tables/stores:**  
  - Could stay in the same `cache-entries` store (just more, smaller keys).  
  - Or introduce a dedicated store, e.g. `scripture-chapters`, to separate schema/usage from other content (see Option C).

**Design decisions to pin down:**  
- Exact key format and whether we keep a separate “book index” key (e.g. list of chapter numbers) for fast “is book X fully cached?”.  
- Where assembly happens: inside ScriptureLoader only, or a small “scripture cache service” used by loader and background download.

---

### 5.2 Option B: Separate Object Stores by Resource Type (Same Keys, Different Tables)

**Idea:** Keep current key semantics and value shapes, but split **which object store** holds the record.

- **Stores:** e.g. `cache-scripture`, `cache-notes`, `cache-questions`, `cache-academy`, `cache-meta` (for `resource:{resourceKey}` and similar).
- **Pros:**  
  - Clear separation by type; easier to reason about and to apply type-specific policies (e.g. evict TN before scripture).  
  - Can add type-specific indexes or future optimizations per store.
- **Cons:**  
  - Does **not** by itself reduce per-entry size; a full-book scripture entry in `cache-scripture` would still be one large value and could still fail on mobile.  
  - So this is useful for **organization and policy**, not for solving “entry too large” unless combined with smaller entries (e.g. Option A for scripture).

**Best use:** Combine with Option A (e.g. store `scripture-chapters` in a dedicated store) or with Option D (separate “large blob” store).

---

### 5.3 Option C: Dedicated “Large Content” Store with Chunked or Split Values

**Idea:** Introduce a store (or table) intended only for content that may be large, and define a convention for splitting one logical entry into multiple records.

- **Store name:** e.g. `cache-content-chunked` (or `cache-large`).
- **Convention:**  
  - One “manifest” record per logical key: e.g. `key = scripture:owner/lang/id:gen`, value = `{ chunkCount, metadata, ... }` (no big blob).  
  - N “chunk” records: e.g. `key = scripture:owner/lang/id:gen#0`, `...#1`, … with value = one part of the serialized content (string or buffer).  
- **Adapter:** A thin layer (or the existing adapter) detects “content size &gt; threshold” and uses this store + convention; small entries stay in the current store.
- **Pros:**  
  - Keeps existing key semantics; loaders still ask for `scripture:...:gen`.  
  - Single place to implement “split/merge” logic and size policy.
- **Cons:**  
  - More complex get/set (read/write multiple records, reassemble/split).  
  - Migration: existing “one big record” keys would need to be read once and re-saved in chunked form (or we only chunk new writes and support both layouts for a while).

**Design decisions:**  
- Chunk size (e.g. 500 KB), and whether chunks are string (JSON substring) or binary.  
- Whether to use the same DB and a new store, or a separate DB for “chunked content.”

---

### 5.4 Option D: Store by “Logical Table” + Granular Keys (Scripture = Chapters; TN/TQ = Book or Chapter)

**Idea:** Redesign key granularity per resource type so that no single key ever holds a multi‑MB value.

- **Scripture:** Same as Option A — store by chapter; key e.g. `scripture:{resourceKey}:{bookId}:{chapter}`.  
- **TN / TQ:** Today already per-book. If a single book’s notes/questions ever get large, we could later split to per-chapter (e.g. `tn:{resourceKey}:{bookCode}:{chapter}`) and assemble in the loader.  
- **TA:** Per-entry; already small; no change.  
- **Completeness / meta:** Keep as today (`resource:{resourceKey}`); small.

So “more tables or entries” here means **more entries** (finer keys), and optionally **more stores** (e.g. one store per type) for clarity.

- **Pros:**  
  - Avoids large values at the source; no need for chunking inside a single value.  
  - Aligns with how scripture is consumed (chapter by chapter).  
- **Cons:**  
  - Loaders and background download must be updated to write/read multiple keys and, for scripture, to assemble a “book” from chapters when needed.  
  - Need a consistent contract for “book-level” metadata (e.g. where it lives: first chapter record, or a separate `scripture:...:gen:meta` key).

---

### 5.5 Option E: Hybrid (Recommended Direction for Planning)

- **Short term (minimal change):**  
  - In **cache-adapter-indexeddb**, add a **chunking path** for any single `set()` whose serialized size exceeds a threshold (e.g. 800 KB): store one manifest + N chunks under derived keys (e.g. `key`, `key::chunk:0`, …).  
  - On `get()`, if manifest indicates chunked, read chunks and reassemble.  
  - No loader or key-structure change; only the adapter hides chunking.  
  - Solves “entry too large” on mobile without touching scripture/TN key design.

- **Medium term (structural):**  
  - **Scripture:** Move to **per-chapter** keys in the loader and background download (Option A + D). Store chapters in a dedicated store `scripture-chapters` (Option B) with keys like `scripture:{resourceKey}:{bookId}:{chapter}`.  
  - **TN/TQ:** Keep per-book unless we see large-book issues; then consider per-chapter.  
  - **Catalog and package storage:** Unchanged (already small).

- **Long term:**  
  - Consider a small “content schema” version in cache metadata so we can migrate old “whole-book” scripture entries to chapter entries over time (e.g. on first access after an app update).

---

### 5.6 Option F: Transparent Chapter Splitting Inside the Adapter (Recommended)

**Idea:** Keep the **public interface unchanged**. Loaders still call `get(key)` / `set(key, entry)` with the same keys (e.g. `scripture:owner/lang/id:gen`) and the same value shapes (full ProcessedScripture). Inside the **cache adapter only**, we store scripture by chapter and reassemble on read.

- **Callers:** No changes. ScriptureLoader and the background worker keep using `cacheAdapter.set('scripture:...:gen', { content: processedScripture, ... })` and `cacheAdapter.get('scripture:...:gen')` and receive the full book.
- **Adapter on `set(key, entry)`:**  
  - If the key matches the scripture pattern (e.g. `scripture:...`) and `entry.content` looks like ProcessedScripture (e.g. `entry.content.chapters` is an array), then:  
    - Write a **small manifest** at the original key: e.g. `{ key, entry: { content: { metadata }, metadata: { _chunked: true }, ... } }` (book-level metadata only; no `chapters` array).  
    - For each chapter, write a record with key `{baseKey}:{chapterNumber}` (e.g. `scripture:owner/lang/id:gen:1`, `...:gen:2`) and value = that chapter’s data (e.g. `entry.content.chapters[i]` plus any shared fields needed).  
  - Otherwise, store as today: one `put({ key, entry })`.
- **Adapter on `get(key)`:**  
  - Try reading the key as a single record.  
  - If the result has a “chunked” marker (e.g. `entry.metadata._chunked` or `entry.content._chunked`), then:  
    - Use an IndexedDB key range (e.g. `lowerBound(key + ':')`, `upperBound(key + ':\uffff')`) to read all chapter records.  
    - Sort by chapter number, merge with the manifest’s metadata into one `ProcessedScripture` (metadata + chapters array), and return the same shape the loader expects.  
  - If the single record exists and is not chunked (legacy whole-book entry), return it as today.  
  - If not found, return null.
- **Backward compatibility:** Old caches have one big record per book. The adapter continues to support that: a single record without `_chunked` is returned unchanged. Optionally, on the next **write** of that key we can re-save in chapter form (migrate on write).

**Pros:**  
- **No breaking changes:** Interfaces and methods stay the same; the app and all loaders/workers are unchanged.  
- **Small entries:** Each chapter is one IndexedDB record; avoids per-value size limits on mobile.  
- **Single place of change:** All logic lives in the cache adapter; no updates to ScriptureLoader, CatalogManager, or background download.  
- **Same store:** Can keep using `cache-entries`; chapter keys are just more keys (e.g. `scripture:...:gen:1`, `...:gen:2`).  
- **Future-proof:** Same pattern can be applied later to TN/TQ inside the adapter if we detect a similar structure and large size.

**Cons:**  
- Adapter must know scripture key pattern and ProcessedScripture shape (key prefix + `content.chapters`).  
- `get()` for a full book does multiple reads (1 manifest + N chapter records); still fast with one transaction and key range.  
- Export/iterate-by-prefix logic (if any) must either ignore chapter sub-keys or treat them as part of the same logical resource (e.g. when listing “all cached scripture keys,” collapse `...:gen`, `...:gen:1`, … into one book).

**Design details to pin down:**  
- Exact key format for chapters: `{baseKey}:{chapterNumber}` (e.g. `scripture:owner/lang/id:gen:1`) so key-range get is simple.  
- Manifest shape: store only what’s needed to reassemble (e.g. `content.metadata`, `timestamp`, `resourceKey`, `bookId`) and a chunked flag; no duplicate of chapter data.  
- Whether to apply the same strategy to TN/TQ when their payload is large (e.g. detect `tn:...` and a per-chapter or per-section structure).

This is the preferred approach when the goal is to **keep interfaces and methods unchanged** while storing data by chapter under the hood.

---

## 6. Summary Table

| Option | What changes | Reduces single-entry size? | New tables/stores? | Loader/caller changes |
|--------|----------------|-----------------------------|---------------------|------------------------|
| A – Scripture by chapter | Key = per chapter; value = one chapter | Yes | Optional | Yes (assemble book from chapters) |
| B – Stores by type | Same keys, different stores | No | Yes | Adapter only (routing by key prefix) |
| C – Chunked large store | One logical key → manifest + chunks | Yes (each chunk small) | Yes (one “chunked” store) | Adapter only |
| D – Granular keys everywhere | Finer keys (chapter or similar) | Yes | Optional | Yes (per type) |
| E – Hybrid | Adapter chunking now; scripture-by-chapter later | Yes | Optional (e.g. scripture-chapters) | Adapter now; loaders later |
| **F – Transparent chapter splitting in adapter** | **Adapter stores by chapter; get/set API unchanged** | **Yes** | **No (same store, more keys)** | **None** |

---

## 7. Recommended Next Steps (Planning)

1. **Confirm target:** We want to avoid “IndexedDB entry too large” on mobile when opening large books (e.g. Genesis), and we prefer **splitting into more tables or entries** (e.g. by chapter) without breaking the app.
2. **Preferred approach (Option F):** Implement **transparent chapter splitting inside the cache adapter** so that:
   - **Interfaces and methods stay the same:** Loaders and the background worker keep using the same `get(key)` / `set(key, entry)` and the same keys (e.g. `scripture:owner/lang/id:gen`).
   - **Inside the adapter:** For scripture keys and ProcessedScripture-shaped content, store one small manifest at the logical key and one record per chapter at `{key}:{chapterNum}`; on `get()`, detect chunked storage and reassemble before returning. No new tables; same `cache-entries` store with more, smaller keys.
3. **Document contracts:**  
   - In the adapter (or this doc): scripture key pattern, manifest shape, chapter key format (`{baseKey}:{chapterNumber}`), and how to detect “chunked” vs legacy single-record.  
   - How export/iterate-by-prefix treats chapter sub-keys (e.g. collapse to one logical book per resource+book).
4. **Leave catalog and package storage as-is** unless we later need to store large metadata; current usage is small.

---

## 8. Implementation (Option F)

**Option F** has been implemented in `@bt-synergy/cache-adapter-indexeddb`:

- **Book-organized keys** (`scripture:`, `tn:`, `tq:`) are stored as one small manifest at the logical key plus one record per chapter at `{key}:{chapterNum}` (e.g. `scripture:owner/lang/id:gen:1`, `...:gen:2`). TA, TW, and other keys are stored as single records.
- **Public API unchanged:** loaders and the background worker still use `get(key)` / `set(key, entry)` with the same keys and value shapes; the adapter splits on `set()` and reassembles on `get()`.
- **Backward compatibility:** a single legacy record (no chunked marker) is returned as-is.
- **`keys()`** returns logical keys only (chapter sub-keys are collapsed to the base key).
- **`delete(key)`** removes the manifest and all chapter records for that key.
- Logic lives in `bookChunkedStorage.ts`; no changes to ScriptureLoader, TN/TQ loaders, or the background download worker.
