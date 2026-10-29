import { Library } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCatalogManager } from '../../contexts/CatalogContext'
import { deviceResourcesByLanguage, type DeviceLanguage } from './deviceResourceList'

const LABEL = 'On this device'

/** The resources the device's catalog holds, by language; read again whenever `refreshKey` changes. */
export function DeviceResources({ refreshKey }: { refreshKey: unknown }) {
  const catalogManager = useCatalogManager()
  const [languages, setLanguages] = useState<DeviceLanguage[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const keys = await catalogManager.getAllResourceKeys().catch(() => [] as string[])
      const rows = await Promise.all(keys.map((key) => catalogManager.getResourceMetadata(key).catch(() => null)))
      if (alive) setLanguages(deviceResourcesByLanguage(rows))
    })()
    return () => {
      alive = false
    }
  }, [catalogManager, refreshKey])

  if (!languages?.length) return null
  return (
    <section className="space-y-2" aria-label={LABEL} data-testid="device-resources">
      <Library className="w-4 h-4 text-fg-muted" aria-hidden />
      <ul className="space-y-2">
        {languages.map(({ language, resources }) => (
          <li key={language} className="flex flex-wrap items-center gap-1" data-testid="device-language" data-language={language}>
            <span className="text-sm font-medium text-fg mr-1">{language}</span>
            {resources.map((r) => (
              <span
                key={r.key}
                title={`${r.title} ${r.version}`.trim()}
                className="px-2 py-0.5 rounded-full border border-border text-fg-muted text-xs font-medium"
                data-testid="device-resource"
              >
                {r.id}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
