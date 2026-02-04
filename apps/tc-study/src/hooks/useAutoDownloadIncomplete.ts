/**
 * Auto Download Incomplete Resources Hook
 * 
 * Automatically checks for incomplete resources and triggers background downloads.
 * Runs on language selection or catalog changes.
 */

import { useEffect, useRef, useState } from 'react'
import type { CompletenessReport } from '../lib/services/ResourceCompletenessChecker'

export interface UseAutoDownloadIncompleteOptions {
  /** Language code to check (if null, checks all) */
  languageCode?: string | null
  
  /** Callback when downloads should start */
  onStartDownload?: (resourceKeys: string[]) => void
  
  /** Completeness checker instance */
  completenessChecker: any // ResourceCompletenessChecker
  
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
  const timeoutRef = useRef<NodeJS.Timeout>()
  
  const checkAndStart = async () => {
    if (!completenessChecker) {
      console.warn('[BG-DL] 🔄 Auto No completeness checker provided')
      return
    }
    
    setIsChecking(true)
    setError(null)
    
    try {
      if (debug) {
        console.log('[BG-DL] 🔄 Auto Checking completeness...')
      }
      
      // Check completeness
      const checkReport = languageCode
        ? await completenessChecker.checkLanguage(languageCode)
        : await completenessChecker.checkAll()
      
      setReport(checkReport)
      
      if (debug) {
        console.log('[BG-DL] 🔄 Auto Completeness report:', {
          total: checkReport.totalResources,
          complete: checkReport.completeResources,
          incomplete: checkReport.incompleteResources,
          percentage: checkReport.completionPercentage,
        })
      }
      
      // If completion is below threshold, trigger downloads
      if (checkReport.completionPercentage < minCompletionThreshold) {
        if (checkReport.incompleteKeys.length > 0) {
          if (debug) {
            console.log(
              `[BG-DL] 🔄 Auto ${checkReport.incompleteKeys.length} incomplete resources found, starting downloads...`
            )
          }
          
          // Trigger download callback
          if (onStartDownload) {
            onStartDownload(checkReport.incompleteKeys)
          }
        } else {
          if (debug) {
            console.log('[BG-DL] 🔄 Auto No incomplete resources to download')
          }
        }
      } else {
        if (debug) {
          console.log(
            `[BG-DL] 🔄 Auto Completion at ${checkReport.completionPercentage}%, no downloads needed`
          )
        }
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
      if (debug) {
        console.log(
          `[BG-DL] 🔄 Auto Language changed to ${languageCode}, scheduling check in ${checkDelay}ms...`
        )
      }
      
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
