/** What the device's catalog holds, by language: what Data › Resources lists after a pack is opened. */

export type DeviceResource = { key: string; id: string; title: string; version: string }
export type DeviceLanguage = { language: string; resources: DeviceResource[] }

type CatalogRowLike = { resourceKey?: unknown; language?: unknown; resourceId?: unknown; title?: unknown; version?: unknown }

export function deviceResourcesByLanguage(rows: readonly unknown[]): DeviceLanguage[] {
  const byLanguage = new Map<string, DeviceResource[]>()
  for (const raw of rows) {
    const row = (raw && typeof raw === 'object' ? raw : {}) as CatalogRowLike
    if (typeof row.resourceKey !== 'string') continue
    const [, keyLanguage, keyId] = row.resourceKey.split('/')
    const language = typeof row.language === 'string' ? row.language : (keyLanguage ?? '')
    const id = (typeof row.resourceId === 'string' ? row.resourceId : (keyId ?? row.resourceKey)).toUpperCase()
    const list = byLanguage.get(language) ?? []
    list.push({
      key: row.resourceKey,
      id,
      title: typeof row.title === 'string' && row.title ? row.title : id,
      version: typeof row.version === 'string' ? row.version : '',
    })
    byLanguage.set(language, list)
  }
  return [...byLanguage.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([language, resources]) => ({ language, resources: resources.sort((a, b) => a.id.localeCompare(b.id)) }))
}
