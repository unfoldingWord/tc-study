# Serving format 3 over HTTP

Status: **contract fixed for phase 3** (2026-11-03). The packs Worker of translation-helps-mcp serves it next to format 2.0; the
client library (C1) and its fake server follow it. A change to anything below is a spec change with its own commit.

Format 3 needs only two kinds of download: a **catalog** (the one segment that changes in place) and a **segment** (immutable,
named by its id). Everything else a device needs (which segments make a unit, which units a book needs, which revision it has)
is inside the catalog.

## URLs

The base is the packs Worker's origin, for example `https://<worker host>`. Paths are case-sensitive.

| Path | Answers |
| --- | --- |
| `GET /v3/packs/{lang}/catalog` | the language catalog of `{lang}` (a catalog segment whose `about.catalog` is the language tag) |
| `GET /v3/packs/common/catalog` | the common catalog (`about.catalog` is `"common"`) |
| `GET /v3/packs/seg/{id}` | the segment file whose id is `{id}` |

- `{lang}` is a BCP 47 tag. The Worker lowercases it and applies the same aliases as `/v2/packs` (today `es` → `es-419`),
  then checks it against `^[a-z]{2,3}(-[a-z0-9]{1,8})*$`. The answer for an alias is the catalog of the tag it maps to.
- `common` is reserved: no language is called `common` (a language tag has 2 or 3 letters before the first `-`).
- The path `/v3/packs/seg/catalog` is the catalog of the language `seg` (Segeju), not a segment: a path whose first element is `seg` is a segment only when the second is 64 lowercase hex.
- `{id}` is the segment's id (`container.md`: the sha256 of the **uncompressed body**, not of the file) in 64 lowercase hex
  digits. Uppercase hex is a bad path (400), not an alias.
- A trailing slash, a query string other than one the Worker ignores, a third path element, or any other path under `/v3/packs/`
  is a bad path (400).
- The segment route is shared by every language and by the common catalog: the same id is the same bytes.

## Answers

Methods: `GET`, `HEAD` and `OPTIONS` (204, CORS only). Anything else is 405 with `Allow: GET, HEAD, OPTIONS`.

**200, a catalog**

- Body: the catalog segment file, exactly as published (magic, header, deflate-raw body). The Worker does not decode it.
- `Content-Type: application/octet-stream`
- `Cache-Control: no-cache, no-transform` (revalidate on every use)
- `ETag`: a strong tag, quoted. It changes when the published catalog changes.
- `If-None-Match` with the current tag (one tag, a list, a `W/` tag or `*`) → **304** with `ETag`, `Cache-Control` and the CORS
  headers, no body.
- No `Range` on a catalog: a `Range` header is ignored and the answer is 200 with the whole file.

**200 or 206, a segment**

- Body: the segment file as published.
- `Content-Type: application/octet-stream`
- `Cache-Control: public, max-age=31536000, immutable, no-transform`
- `ETag`, and `If-None-Match` → 304 as for a catalog.
- `Accept-Ranges: bytes`. One `Range: bytes=a-b`, `bytes=a-` or `bytes=-n` gives **206** with `Content-Range` and
  `Content-Length`; any other `Range` form is ignored (200). A range that cannot be satisfied (including `bytes=-0`) gives
  **416** with `Content-Range: bytes */<size>`.
- No `Content-Encoding`: the bytes on the wire are the file bytes. A client checks a segment by reading its header and hashing its
  decompressed body (`container.md`), and a catalog entry's `size` equals the file's length.

**HEAD** gives the headers of the GET it stands for, with no body.

**CORS**, on every answer including errors and 304:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range, If-None-Match
Access-Control-Expose-Headers: ETag, Content-Range, Content-Length, Accept-Ranges, Retry-After
```

## Errors

Every error body is JSON (`Content-Type: application/json`), with `Cache-Control: no-store` and the CORS headers.

| Status | Body | When |
| --- | --- | --- |
| 400 | `{"error":"bad pack path"}` | the path is not one of the three forms |
| 404 | `{"error":"catalog not found"}` | no catalog is published for that language (or no common catalog) |
| 404 | `{"error":"segment not found"}` | no segment with that id |
| 404 | `{"state":"unavailable","reason":"v3-off"}` | format 3 is switched off on this Worker (`PACKS_V3` is not `on`) |
| 405 | `{"error":"method not allowed"}` | a method other than GET, HEAD, OPTIONS |
| 416 | `{"error":"range not satisfiable"}` | see above |
| 429 | `{"error":{"code":"RATE_LIMITED","message":"…","retryable":true}}` and `Retry-After: <seconds>` (the Worker's shared rate-limit answer) | too many requests from one address; segments have their own, larger budget |
| 503 | `{"error":"packs are not configured"}` | the Worker has no packs bucket |
| 500 | `{"error":"internal error"}` | anything else |

In phase 3 a missing catalog does **not** start a build: format 3 is built in the same run as the language's format 2.0 parts,
so asking for `/v2/packs/…` is what starts one. A client that gets `catalog not found` tells the person the language has no
format 3 pack yet; it does not poll.

A client must treat any other 4xx or 5xx as "not available now" and keep what it has installed.

## Order a client follows

Not part of the Worker's contract, written here so the fake server and the Worker are tested the same way:

1. `GET` the language catalog (with `If-None-Match` when one is installed). A 304 means nothing changed. Read it
   (`container.md`) and, when the app has trusted keys, check its `sig` (`catalog.md`, "Signatures"): a catalog that fails
   with `E_SIGNATURE` is not installed.
2. Read its `requires`; `GET` the common catalog when its id differs from the installed one, and check its `sig` the
   same way. Signing a catalog again changes its file bytes and its ETag but not its id.
3. `GET` each segment the chosen units name, verify it, and activate a unit only when it and its `needs` are complete
   (`catalog.md`).

A catalog's `about.revision` only grows; a client does not install a lower revision of the same publisher and catalog without
the person's confirmation (`catalog.md`).

## Storage behind the Worker (for publishers)

The packs bucket (R2) holds format 3 under its own prefix, so the format 2.0 cleanup never sees it:

| Key | Content | Written |
| --- | --- | --- |
| `v3/seg/{id}.seg` | a segment file | before any catalog that names it; never rewritten |
| `v3/catalog/{lang}.seg` | the language catalog | last, after every segment it and the common catalog name exists, and after the registry |
| `v3/catalog/common.seg` | the common catalog | only by the run of the map language (`en`), before that language's catalog |
| `v3/registry/{lang}.json` | the section registry of the language's builds (`ids.md`) | after the segments and before any catalog (a catalog that is visible always has its registry); never served |

Uploads use `Cache-Control: public, max-age=31536000, immutable` for segments and `no-cache` for catalogs; the Worker sets its own
headers anyway. Nothing else is written under `v3/`. Source files the builders read (TIPNR, Theographic, OBS) are never uploaded
(`fuentes.md`). Segments no catalog names are not deleted in phase 3.
