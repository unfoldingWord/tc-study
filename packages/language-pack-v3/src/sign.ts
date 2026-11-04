/**
 * Signatures of the catalog (`spec/catalog.md`, "Signatures"): the key id, signing a catalog file and checking its `sig`.
 *
 * The signature is Ed25519 over the catalog's 32-byte id. `sig` lives in the file header, outside the body, so signing changes
 * the header (and `H`) and nothing that the id is the hash of. Uses WebCrypto (`crypto.subtle`: Bun, browsers, Workers) and no Node
 * module; no key is read or kept here.
 */
import { FIXED_BYTES, MAGIC, readHeader, readSegment } from './codec/container'
import { encodeDeterministic } from './codec/cbor'
import { FormatError } from './codec/errors'
import { sha256, toHex } from './codec/sha256'
import { type CborMap, hasOwn, hexToBytes, isMap } from './codec/values'
import { CATALOG_TABLES, catalogView } from './read/catalog'

type Header = Record<string, unknown>

/** The id of a key: the first 16 hex digits (lowercase) of the sha256 of its 32-byte raw public key. */
export function keyId(publicKey: Uint8Array): string {
  return toHex(sha256(publicKey)).slice(0, 16)
}

function base64urlToBytes(text: string): Uint8Array {
  const plain = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** The raw public key of a PKCS#8 Ed25519 private key. */
export async function publicKeyOf(privateKeyPkcs8: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('pkcs8', copy(privateKeyPkcs8), { name: 'Ed25519' }, true, ['sign'])
  const jwk = await crypto.subtle.exportKey('jwk', key)
  if (typeof jwk.x !== 'string') throw new Error('the private key gives no public key')
  return base64urlToBytes(jwk.x)
}

/** A `S` that is a standalone ArrayBuffer-backed copy, as WebCrypto types want. */
const copy = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes)

/**
 * The catalog file with one more signature in its header: Ed25519 by `privateKeyPkcs8` over the catalog's id. The body, and so the
 * id, are those of `catalogFile`; the header and `H` change. Signatures already in the file are kept. Throws {@link FormatError} when the file is
 * not a whole, valid catalog, and `Error` when it is a `local` catalog (never signed).
 */
export async function signCatalog(catalogFile: Uint8Array, privateKeyPkcs8: Uint8Array): Promise<Uint8Array> {
  const { seg, id } = await readSegment(catalogFile, { known: CATALOG_TABLES, expectedClass: 'catalog' })
  if (catalogView(seg).about.origin !== 'published') throw new Error('a local catalog is never signed')
  const { header, headerEnd } = readHeader(catalogFile)
  const key = await crypto.subtle.importKey('pkcs8', copy(privateKeyPkcs8), { name: 'Ed25519' }, true, ['sign'])
  const idBytes = hexToBytes(id)
  const s = new Uint8Array(await crypto.subtle.sign('Ed25519', key, copy(idBytes)))
  const mine = { key: keyId(await publicKeyOf(privateKeyPkcs8)), alg: 'ed25519', s }
  const before = Array.isArray(header.sig) ? header.sig.filter((item) => isMap(item) && !(item.key === mine.key)) : []
  const encoded = encodeDeterministic({ ...header, sig: [...before, mine] } as unknown as CborMap)
  const out = new Uint8Array(FIXED_BYTES + encoded.length + (catalogFile.length - headerEnd))
  out.set(catalogFile.subarray(0, FIXED_BYTES), 0)
  new DataView(out.buffer).setUint32(8, encoded.length)
  out.set(encoded, FIXED_BYTES)
  out.set(catalogFile.subarray(headerEnd), FIXED_BYTES + encoded.length)
  if (MAGIC.some((b, i) => out[i] !== b)) throw new Error('unreachable: the magic number changed')
  return out
}

const FIELD_P = 2n ** 255n - 19n

/**
 * The canonical-encoding rule of `catalog.md` for a point (`R` or `A`), checked here and not left to WebCrypto, which accepts some
 * encodings the spec rejects: `y >= p`, or `x = 0` (`y` is 1 or p - 1) with the sign bit set.
 */
function canonicalPoint(bytes: Uint8Array): boolean {
  let y = 0n
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i])
  const sign = (bytes[31] & 0x80) !== 0
  if (y >= FIELD_P) return false
  return !(sign && (y === 1n || y === FIELD_P - 1n))
}

const reject = (why: string): never => {
  throw new FormatError('E_SIGNATURE', `the catalog's signature is not accepted: ${why}`)
}

/**
 * The rule of `catalog.md` on a header: `id` is the catalog's verified id (32 bytes). Gives the first verifying signature of a
 * trusted key, or throws `E_SIGNATURE` when `sig` is missing or malformed, no element names a trusted key, or an element of a
 * trusted key does not verify. Does not look at `origin`: the caller decides which catalogs it checks.
 */
export async function checkSignatures(header: Header, id: Uint8Array, trusted: Record<string, Uint8Array>): Promise<{ key: string; valid: true }> {
  const sig = header.sig
  if (!Array.isArray(sig) || sig.length === 0) return reject('sig is missing or is not a list')
  const entries = sig.map((item) => {
    if (!isMap(item) || typeof item.key !== 'string' || item.alg !== 'ed25519' || !(item.s instanceof Uint8Array) || item.s.length !== 64) {
      return reject('an element of sig is malformed')
    }
    return { key: item.key, s: item.s }
  })
  let first: string | undefined
  for (const { key, s } of entries) {
    const publicKey = hasOwn(trusted, key) ? trusted[key] : undefined
    // A key listed under an id that is not its own is not trusted.
    if (publicKey === undefined || publicKey.length !== 32 || keyId(publicKey) !== key) continue
    let ok = false
    try {
      if (!canonicalPoint(publicKey) || !canonicalPoint(s.subarray(0, 32))) throw new Error('not canonical')
      const imported = await crypto.subtle.importKey('raw', copy(publicKey), { name: 'Ed25519' }, false, ['verify'])
      ok = await crypto.subtle.verify('Ed25519', imported, copy(s), copy(id))
    } catch {
      ok = false
    }
    if (!ok) return reject(`the signature of ${key} does not verify`)
    first ??= key
  }
  if (first === undefined) return reject('no signature is from a trusted key')
  return { key: first, valid: true }
}

/**
 * Checks a catalog file against trusted keys (a map from key id to raw public key): the file is read whole first (any error of the
 * container or the catalog wins), then {@link checkSignatures}. Gives the key that verified; throws {@link FormatError} `E_SIGNATURE`
 * per the rules of `catalog.md`. It does not look at the origin: a reader skips `local` catalogs before calling it.
 */
export async function verifyCatalog(catalogFile: Uint8Array, trusted: Record<string, Uint8Array>): Promise<{ key: string; valid: true }> {
  const { seg, header, id } = await readSegment(catalogFile, { known: CATALOG_TABLES, expectedClass: 'catalog' })
  catalogView(seg) // an invalid body is E_BODY before any signature is looked at
  return checkSignatures(header, hexToBytes(id), trusted)
}

