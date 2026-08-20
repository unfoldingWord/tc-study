/**
 * Auto Download Incomplete Resources Hook
 * 
 * Automatically checks for incomplete resources and triggers background downloads.
 * Runs on language selection or catalog changes.
 */

import { useEffect, useRef, useState } from 'react'
import type {
  CompletenessReport,
  ResourceCompletenessChecker,
} from '../lib/services/ResourceCompletenessChecker'

export interface UseAutoDownloadIncompleteOptions {
  /** Language code to check (if null, checks all) */
  languageCode?: string | null
  
  /** Callback when downloads should start */
  onStartDownload?: (resourceKeys: string[]) => void
  
  /** Completeness checker instance */
  completenessChecker: ResourceCompletenessChecker
  
  /** Enable debug logging */
  debug?: boolean
  
  /** Minimum completion percentage before triggering (0-100) */
  minCompletionThreshold?: number
  
  /** Delay before checking (ms) - allows catalog to settle */
  checkDelay?: number
}

export interface UseAutoDownloadIncompleteReturn {
  /** Completeness report */
  report: CompletenessReport | null
  
  /** Is checking */
  isChecking: boolean
  
  /** Check error */
  error: string | null
  
  /** Manually trigger check */
  checkNow: () => Promise<void>
}

export function useAutoDownloadIncomplete(
  options: UseAutoDownloadIncompleteOptions
): UseAutoDownloadIncompleteReturn {
  const {
    languageCode,
    onStartDownload,
    completenessChecker,
    debug = false,
    minCompletionThreshold = 100,
    checkDelay = 2000, // 2 seconds to let catalog settle
  } = options
  
  const [report, setReport] = useState<CompletenessReport | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasCheckedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  
  const checkAndStart = async () => {
    if (!completenessChecker) {
      console.warn('[BG-DL] 🔄 Auto No completeness checker provided')
      return
    }
    
    setIsChecking(true)
    setError(null)
    
    try {

      
      // Check completeness
      const checkReport = languageCode
        ? await completenessChecker.checkLanguage(languageCode)
        : await completenessChecker.checkAll()
      
      setReport(checkReport)
      

      
      // If completion is below threshold, trigger downloads
      if (
        checkReport.completionPercentage < minCompletionThreshold &&
        checkReport.incompleteKeys.length > 0 &&
        onStartDownload
      ) {
        onStartDownload(checkReport.incompleteKeys)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[BG-DL] 🔄 Auto Error checking completeness:', err)
      setError(errorMessage)
    } finally {
      setIsChecking(false)
    }
  }
  
  // Auto-check when language changes
  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    // Reset checked flag when language changes
    hasCheckedRef.current = false
    
    // Only check if we have a language
    if (languageCode && !hasCheckedRef.current) {

      
      // Delay check to let catalog populate
      timeoutRef.current = setTimeout(() => {
        hasCheckedRef.current = true
        checkAndStart()
      }, checkDelay)
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [languageCode, checkDelay, debug])
  
  // Manual check function
  const checkNow = async () => {
    hasCheckedRef.current = true
    await checkAndStart()
  }
  
  return {
    report,
    isChecking,
    error,
    checkNow,
  }
}
