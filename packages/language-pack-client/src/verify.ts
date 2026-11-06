/**
 * Verifying a catalog file as `catalog.md` ("When a reader checks, and when it rejects") says. The signature rules are those of
 * `sign.ts` in `language-pack-v3` (`checkSignatures`); this file only decides when to apply them, and keeps the revision rule.
 */
import {
  CATALOG_TABLES,
  type CatalogModel,
  catalogView,
  checkSignatures,
  type Ed25519Verify,
  FormatError,
  readSegment,
} from '@bt-synergy/language-pack-v3'
import { ClientError } from './errors'
import { ed25519Verify } from './ed25519'

export type TrustPolicy = { trustedKeys?: Record<string, Uint8Array> }

export type VerifiedCatalog = {
  id: string
  bytes: Uint8Array
  catalog: CatalogModel
  /** `about.catalog` */
  name: string
  publisher: string
  revision: number
  origin: 'published' | 'local'
  signedBy?: string
}

/** The part of an installed catalog that `checkRevision` reads. Task 4 replaces this with the real type. */
export type InstalledCatalog = { publisher: string; name: string; revision: number; id: string }

export async function verifyCatalogFile(
  bytes: Uint8Array,
  policy: TrustPolicy,
  o: { from: 'network' | 'transfer' | 'store' | 'bridge'; expectedId?: string; verify?: Ed25519Verify },
): Promise<VerifiedCatalog> {
  const { seg, id, header } = await readSegment(bytes, {
    known: CATALOG_TABLES,
    expectedClass: 'catalog',
    ...(o.expectedId !== undefined ? { expectedId: o.expectedId } : {}),
  })
  const catalog = catalogView(seg)
  const { about } = catalog
  const keys = policy.trustedKeys
  let signedBy: string | undefined
  if (keys !== undefined && Object.keys(keys).length > 0) {
    if (about.origin === 'published') {
      const idBytes = Uint8Array.from(id.match(/../g)!, (pair) => parseInt(pair, 16))
      signedBy = (await checkSignatures(header, idBytes, keys, o.verify ?? (await ed25519Verify()))).key
    } else if (o.from === 'transfer' || o.from === 'network') {
      throw new FormatError('E_SIGNATURE', 'a local catalog does not come from a transfer file or a server')
    }
  }
  return {
    id,
    bytes,
    catalog,
    name: about.catalog,
    publisher: about.publisher,
    revision: about.revision,
    origin: about.origin,
    ...(signedBy !== undefined ? { signedBy } : {}),
  }
}

/** Whether `incoming` may replace `installed`: a lower revision is E_DOWNGRADE unless confirmed; a fork (same revision, other id) always. */
export function checkRevision(
  installed: InstalledCatalog | undefined,
  incoming: VerifiedCatalog,
  confirmDowngrade = false,
): 'same' | 'newer' | 'first' {
  if (installed === undefined || installed.publisher !== incoming.publisher || installed.name !== incoming.name) return 'first'
  if (installed.id === incoming.id) return 'same'
  if (incoming.revision === installed.revision) {
    throw new ClientError('E_DOWNGRADE', `two different catalogs share the revision ${incoming.revision}`)
  }
  if (incoming.revision < installed.revision) {
    if (!confirmDowngrade) throw new ClientError('E_DOWNGRADE', `revision ${incoming.revision} is older than ${installed.revision}`)
    return 'newer'
  }
  return 'newer'
}
