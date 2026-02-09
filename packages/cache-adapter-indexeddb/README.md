# @bt-synergy/cache-adapter-indexeddb

IndexedDB storage adapter for resource cache (web browsers). API-compatible with `CacheStorageAdapter` from `@bt-synergy/resource-cache`.

## Book-organized resources (scripture, TN, TQ)

To avoid IndexedDB per-entry size limits on mobile, **book-organized** cache keys are stored as:

- One **manifest** at the logical key (e.g. `scripture:owner/lang/id:gen`) with metadata only.
- One **record per chapter** at `{key}:{chapterNum}` (e.g. `scripture:owner/lang/id:gen:1`, `...:gen:2`).

Loaders and the app still use the same `get(key)` / `set(key, entry)` and the same keys; the adapter splits on write and reassembles on read. TA, TW, and other non–book-organized keys are stored as single records.

See `docs/STORAGE_ANALYSIS_LARGE_ENTRIES.md` for the full design.
