/** The spec's Titus sample (es-419) opened with `openFromSegments`, for the fragment, card and assistant tests. Tests only. */
import { openFromSegments, type PackReader, verifyCatalogFile } from '@bt-synergy/language-pack-client'
import { buildSample } from '../../language-pack-client/test/sample'

const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

/** The sample's reader; `without` names units whose segments the store lacks: listed in the catalogs, not readable. */
export async function sampleReader(without: string[] = []): Promise<PackReader> {
  const s = await buildSample()
  const catalogs = [await verifyCatalogFile(s.langCatalog, {}, { from: 'store' }), await verifyCatalogFile(s.commonCatalog, {}, { from: 'store' })]
  const gone = new Set<string>()
  for (const c of catalogs) for (const u of c.catalog.units) if (without.includes(u.id)) for (const i of u.segments) gone.add(hex(c.catalog.segments[i]!.id))
  return openFromSegments({ lang: 'es-419', catalogs, get: async (id) => (gone.has(id) ? undefined : s.segments.get(id)) })
}

export const LINK = /^(ref:[a-z0-9]{3} [^\s:]+:\S+|concepto:\S+|articulo:\S+#\S+|pieza:\S+|obs:\d{2}(:\d{2})?)$/
