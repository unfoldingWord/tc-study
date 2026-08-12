# `@bt-synergy/scripture-loader`

Loads Door43 scripture (USFM) into `ProcessedScripture` for catalog-manager / tc-study.

## `USE_USJ_PIPELINE` (P1/P2)

Dual-path processing after USFM fetch. **Default off** — legacy `@bt-synergy/usfm-processor` (byte-stable).

| Enable via | Example |
|------------|---------|
| Env | `USE_USJ_PIPELINE=1` or `VITE_USE_USJ_PIPELINE=1` |
| Loader option | `new ScriptureLoader({ …, useUsjPipeline: true })` |

When **on**: USFM string → `@bt-synergy/usj-processor` (`USJProcessor`) → `ProcessedScripture` for callers.

### P2 storage (flag on)

| | Legacy (`scripture:…`) | USJ SoT (`scripture-usj:…`) |
|--|------------------------|-----------------------------|
| Flag **off** | Read + write ProcessedScripture | Unused |
| Flag **on** | Dual-read fallback (upgrade open) | Prefer read; write on process |

- Content `processingVersion`: `2.0.0-usj` (+ embedded `@usfm-tools/parser` / `usj-core` versions).
- Mismatched versions are refused (deleted) and reprocessed on next fetch.
- Chapter / `:alignments` chunks via `@bt-synergy/cache-adapter-indexeddb`.
- App still consumes **ProcessedScripture only** (no UsfmReadonlyView).

### Clear cache after toggling

IndexedDB DB: `tc-study-cache` / store `cache-entries`.

DevTools → Application → IndexedDB → delete keys starting with `scripture:` and/or `scripture-usj:`,  
or wipe the DB, then reload so books re-fetch and reprocess.

```js
// Console helper
;(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('tc-study-cache')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const keys = await new Promise((res, rej) => {
    const tx = db.transaction('cache-entries', 'readonly')
    const req = tx.objectStore('cache-entries').getAllKeys()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  const del = keys.filter((k) => /^scripture(-usj)?:/.test(String(k)))
  await new Promise((res, rej) => {
    const tx = db.transaction('cache-entries', 'readwrite')
    const store = tx.objectStore('cache-entries')
    for (const k of del) store.delete(k)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
  db.close()
  console.log('deleted', del.length, 'scripture keys')
})()
```

### tc-study

```bash
# from apps/tc-study (or monorepo with filter)
VITE_USE_USJ_PIPELINE=1 bun run dev -- --port 8080 --host
```

Requires sibling `usfm-ast` built + `node packages/usj-processor/scripts/link-usfm-tools.cjs`  
(Vite aliases `@usfm-tools/*` in `apps/tc-study/vite.config.js`).

Worker download path reads the same Vite env via `workerLoaderRegistry`.

**Default-on:** not recommended yet — keep flag off until studio UI matrix + publishable `@usfm-tools/*` are green.

## Tests

```bash
bun test packages/scripture-loader
bun test packages/usj-processor
```
