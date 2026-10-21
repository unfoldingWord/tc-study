/**
 * Poll whether the language's `_tc-helps` collection is fully cached.
 * failFast + skip while extract is writing so this never fights worker setMany.
 */

import { useEffect, useState } from 'react'
import { yieldBetweenCompletenessBooks } from '../../lib/services/ResourceCompletenessChecker'
import { backgroundDownloadSession } from '../download/backgroundDownloadSession'
import { shouldWalkUiIdbDuringExtract } from './catalogBackgroundDownloadPolicy'

type CompletenessCheckerLike = {
  checkResource: (
    resourceKey: string,
    options?: { failFast?: boolean }
  ) => Promise<{ isComplete: boolean }>
}

type PackageLike = {
  name: string
  resources?: Array<{ owner: string; language: string; resourceId: string }>
}

/**
 * Returns whether `${languageCode}_tc-helps` is fully cached offline.
 * Polls every 5s while a language is active.
 */
export function useReadCollectionCompleteness(
  currentLanguageCode: string | null,
  packages: PackageLike[],
  completenessChecker: CompletenessCheckerLike
): boolean {
  const [isCollectionFullyCached, setIsCollectionFullyCached] = useState(false)

  useEffect(() => {
    const checkCollectionCompleteness = async () => {
      if (!currentLanguageCode) {
        setIsCollectionFullyCached(false)
        return
      }
      if (!shouldWalkUiIdbDuringExtract(backgroundDownloadSession.isBusy())) {
        return
      }

      const collectionName = `${currentLanguageCode}_tc-helps`
      const collection = packages.find((pkg) => pkg.name === collectionName)
      if (!collection || !collection.resources || collection.resources.length === 0) {
        setIsCollectionFullyCached(false)
        return
      }

      let allCached = true
      for (let i = 0; i < collection.resources.length; i++) {
        const resource = collection.resources[i]
        const resourceKey = `${resource.owner}/${resource.language}/${resource.resourceId}`
        const status = await completenessChecker.checkResource(resourceKey, { failFast: true })
        if (!status.isComplete) {
          allCached = false
          break
        }
        if (i + 1 < collection.resources.length) {
          await yieldBetweenCompletenessBooks()
        }
      }

      setIsCollectionFullyCached(allCached)
    }

    void checkCollectionCompleteness()
    const interval = setInterval(() => {
      void checkCollectionCompleteness()
    }, 5000)
    const unsub = backgroundDownloadSession.subscribe((s) => {
      if (!s.isDownloading) void checkCollectionCompleteness()
    })

    return () => {
      clearInterval(interval)
      unsub()
    }
  }, [currentLanguageCode, packages, completenessChecker])

  return isCollectionFullyCached
}
