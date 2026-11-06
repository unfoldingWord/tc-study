# Public keys that sign catalogs

This folder holds the **public** keys a reader trusts for the catalogs of format 3 (`spec/catalog.md`, "Signatures").
It never holds a private key.

- One file per key, named by its key id: `<key id>.pub`, with the 64 hex digits of the raw 32-byte Ed25519 public key
  and a line feed. The key id is the first 16 hex digits of the sha256 of those 32 bytes (`keyId` in `src/sign.ts`).
  A reader is given them as `{ [key id]: raw key }` (`trustedKeys`).
- The private key of each environment (staging, later production) is made by Abel outside the repositories and is
  loaded as the secret `PACKS_V3_SIGNING_KEY` (PKCS#8 PEM) of the GitHub Environment that publishes. It is not in
  this repository, in a log or in a test: the tests make their own keys when they run.
- The public key of the staging environment is added here when Abel has made the key.
