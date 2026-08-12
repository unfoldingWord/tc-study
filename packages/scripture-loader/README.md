# `@bt-synergy/scripture-loader`

Loads Door43 scripture (USFM) into `ProcessedScripture` for catalog-manager / tc-study.

## Process path: USJ replaces usfm-js

**Default on** — `@bt-synergy/usj-processor` (`@usfm-tools/parser` → USJ → temporary `ProcessedScripture` projection).

Legacy `@bt-synergy/usfm-processor` (usfm-js) is **opt-out only** and loaded via dynamic import so the default path does not eagerly construct it.

| Control | Example |
|---------|---------|
| Default | USJ on |
| Opt out (rollback) | `USE_USJ_PIPELINE=0` or `VITE_USE_USJ_PIPELINE=0` |
| Loader option | `new ScriptureLoader({ …, useUsjPipeline: false })` |

When **on** (default): USFM string → `@bt-synergy/usj-processor` → `ProcessedScripture` for callers.

`ProcessedScripture` is a **temporary projection DTO** (TokenRenderer / CombinedHelps). Sunset when those consumers migrate; CombinedHelps / semantic-ID identity remains the hard part.

### Storage (USJ default)

| | Legacy (`scripture:…`) | USJ SoT (`scripture-usj:…`) |
|--|------------------------|-----------------------------|
| Flag **off** (rollback) | Read + write ProcessedScripture | Unused |
| Flag **on** (default) | Dual-read fallback (upgrade open) | Prefer read; write on process |

- Content `processingVersion`: `2.0.0-usj` (+ embedded `@usfm-tools/parser` / `usj-core` versions).
- Mismatched versions are refused (deleted) and reprocessed on next fetch.
- Chapter / `:alignments` chunks via `@bt-synergy/cache-adapter-indexeddb`.
- App still consumes **ProcessedScripture only** (no UsfmReadonlyView yet).

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
# default = USJ path
bun run dev -- --port 8080 --host

# legacy usfm-js rollback
VITE_USE_USJ_PIPELINE=0 bun run dev -- --port 8080 --host
```

Requires sibling `usfm-ast` built + `node packages/usj-processor/scripts/link-usfm-tools.cjs`  
(Vite aliases `@usfm-tools/*` in `apps/tc-study/vite.config.js`).

Worker download path reads the same Vite env via `workerLoaderRegistry`.

## Tests

```bash
bun test packages/scripture-loader
bun test packages/usj-processor
```
