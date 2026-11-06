import type { PartsProgress } from '../../features/packs/parts/partsMode'

/** What the download control says while languages come as parts from the packs server (T-049). */
export function partsProgressView(progress: Readonly<Record<string, PartsProgress>>): { label: string; percent: number } | null {
  const entries = Object.entries(progress)
  if (entries.length === 0) return null
  const done = entries.reduce((n, [, p]) => n + p.done, 0)
  const total = entries.reduce((n, [, p]) => n + p.total, 0)
  return {
    label: `Downloading parts: ${entries.map(([language, p]) => `${language} ${p.unit} ${p.done}/${p.total}`).join(' · ')}`,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  }
}
