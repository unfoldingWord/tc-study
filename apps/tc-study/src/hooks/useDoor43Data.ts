/**
 * Shared hook for fetching data from Door43 API
 * Eliminates code duplication across wizard steps
 */

import { useState, useEffect } from 'react'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { useResourceTypeRegistry } from '../contexts'

interface UseDoor43DataOptions<T, F extends object = Record<string, never>> {
  /**
   * Function to fetch data from Door43 API
   */
  fetchFn: (
    client: ReturnType<typeof getDoor43ApiClient>,
    filters: F
  ) => Promise<T[]>
  
  /**
   * Additional filters to pass to the API
   */
  additionalFilters?: F
  
  /**
   * Dependencies to trigger refetch
   */
  dependencies?: readonly unknown[]
  
  /**
   * Whether to automatically load on mount
   */
  autoLoad?: boolean
  
  /**
   * Callback for logging
   */
  onSuccess?: (data: T[], count: number) => void
}

export function useDoor43Data<T, F extends object = Record<string, never>>({
  fetchFn,
  additionalFilters = {} as F,
  dependencies = [],
  autoLoad = true,
  onSuccess,
}: UseDoor43DataOptions<T, F>) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  
  const resourceTypeRegistry = useResourceTypeRegistry()

  const loadData = async (isRetry = false) => {
    setLoading(true)
    if (!isRetry) {
      setError(null)
      setRetryCount(0)
    }
    
    try {
      const apiFilters = resourceTypeRegistry.getAPIFilters()
      const filters = {
        subjects: apiFilters.subjects,
        stage: apiFilters.stage,
        topic: apiFilters.topic,
        ...additionalFilters,
      }
      
      const door43Client = getDoor43ApiClient()
      const result = await fetchFn(door43Client, filters)
      
      setData(result)
      setError(null) // Clear error on success
      
      if (onSuccess) {
        onSuccess(result, result.length)
      }
    } catch (err) {
      console.error('❌ Failed to load Door43 data:', err)
      setError(err as Error)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  const retry = () => {
    setRetryCount(prev => prev + 1)
    loadData(true)
  }

  useEffect(() => {
    if (autoLoad) {
      loadData()
    }
  }, dependencies)

  return {
    data,
    loading,
    error,
    retryCount,
    reload: loadData,
    retry,
  }
}

