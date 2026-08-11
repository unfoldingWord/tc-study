/**
 * Poll whether the language's `_tc-helps` collection is fully cached.
 */

import { useEffect, useState } from 'react'

type CompletenessCheckerLike = {
  checkResource: (resourceKey: string) => Promise<{ isComplete: boolean }>
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

      const collectionName = `${currentLanguageCode}_tc-helps`
      const collection = packages.find((pkg) => pkg.name === collectionName)
      if (!collection || !collection.resources || collection.resources.length === 0) {
        setIsCollectionFullyCached(false)
        return
      }

      let allCached = true
      for (const resource of collection.resources) {
        const resourceKey = `${resource.owner}/${resource.language}/${resource.resourceId}`
        const status = await completenessChecker.checkResource(resourceKey)
        if (!status.isComplete) {
          allCached = false
          break
        }
      }

      setIsCollectionFullyCached(allCached)
    }

    void checkCollectionCompleteness()
    const interval = setInterval(() => {
      void checkCollectionCompleteness()
    }, 5000)

    return () => clearInterval(interval)
  }, [currentLanguageCode, packages, completenessChecker])

  return isCollectionFullyCached
}
