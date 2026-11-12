

/**
 * The Ed25519 public keys trusted for format 3 catalogs: the `*.pub` files of `packages/language-pack-v3/keys/`, read
 * when the app is built (`trustedKeysV3` in scripts/vite-trusted-keys-v3.mjs). The key id is the file name. Nothing
 * is copied into source and nothing is fetched. The map is always passed as `trustedKeys`, even if empty: an empty map
 * still demands signatures, so a build without keys trusts nothing.
 */
export function trustedKeys(): Record<string, Uint8Array> {
  const keys = typeof __TC_V3_KEYS__ === 'undefined' ? {} : __TC_V3_KEYS__
  const out: Record<string, Uint8Array> = {}
  for (const [id, text] of Object.entries(keys)) {
    if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`key ${id}.pub is not 64 hex characters`)
    out[id] = Uint8Array.from(text.match(/../g)!, (h) => parseInt(h, 16))
  }
  return out
}
