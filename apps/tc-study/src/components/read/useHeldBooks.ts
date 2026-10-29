import { useEffect, useState } from 'react'
import { useCatalogManager } from '../../contexts/CatalogContext'

/**
 * The books each queued resource already holds: its catalog row's `downloadedIngredients`, written when a book pack
 * is opened. Read while the details are open, again when the queue changes.
 */
export function useHeldBooks(queue: readonly string[], open: boolean): Record<string, string[]> {
  const catalogManager = useCatalogManager()
  const [held, setHeld] = useState<Record<string, string[]>>({})
  const queueKey = queue.join('|')

  useEffect(() => {
    if (!open || queue.length === 0) return
    let alive = true
    void Promise.all(
      queue.map(async (key) => {
        const row = await catalogManager.getResourceMetadata(key).catch(() => null)
        return [key, row?.contentMetadata?.downloadedIngredients ?? []] as const
      })
    ).then((entries) => {
      if (alive) setHeld(Object.fromEntries(entries.filter(([, books]) => books.length > 0)))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the queue's contents, not its identity
  }, [open, queueKey, catalogManager])

  return held
}
