/**
 * Web Worker Quick Check Script
 * 
 * Copy and paste this entire script into your browser console (F12)
 * to quickly verify if the Web Worker is working correctly.
 * 
 * Usage:
 * 1. Open your app in browser
 * 2. Press F12 to open DevTools
 * 3. Go to Console tab
 * 4. Copy this entire file
 * 5. Paste into console and press Enter
 * 6. Follow the output
 */

(async function workerQuickCheck() {
  console.log('%c🧪 Web Worker Quick Check', 'font-size: 20px; font-weight: bold; color: #2563eb;')
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #2563eb;')
  console.log('')

  let passedTests = 0
  let failedTests = 0
  const startTime = Date.now()

  // Helper functions
  const pass = (message) => {
    console.log('%c✅ PASS', 'color: #16a34a; font-weight: bold;', message)
    passedTests++
  }

  const fail = (message, details) => {
    console.log('%c❌ FAIL', 'color: #dc2626; font-weight: bold;', message)
    if (details) console.log('  →', details)
    failedTests++
  }

  const info = (message) => {
    console.log('%cℹ️  INFO', 'color: #0284c7; font-weight: bold;', message)
  }

  const warn = (message) => {
    console.log('%c⚠️  WARN', 'color: #ea580c; font-weight: bold;', message)
  }

  console.log('%c1. Checking Browser Support', 'font-weight: bold; color: #475569;')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Test 1: Worker API
  if (typeof Worker !== 'undefined') {
    pass('Worker API is available')
  } else {
    fail('Worker API is NOT available', 'Browser does not support Web Workers')
    return
  }

  // Test 2: IndexedDB API
  if (typeof indexedDB !== 'undefined') {
    pass('IndexedDB API is available')
  } else {
    fail('IndexedDB API is NOT available', 'Caching will not work')
  }

  // Test 3: Fetch API
  if (typeof fetch !== 'undefined') {
    pass('Fetch API is available')
  } else {
    fail('Fetch API is NOT available', 'Downloads will not work')
  }

  console.log('')
  console.log('%c2. Checking Application State', 'font-weight: bold; color: #475569;')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Test 4: Catalog Manager
  const catalogManager = window.__catalogManager__
  if (catalogManager) {
    pass('Catalog Manager is initialized')
    
    try {
      const resources = await catalogManager.getAllResources()
      if (resources && resources.length > 0) {
        pass(`Found ${resources.length} resource(s) in catalog`)
        info(`Resources: ${resources.map(r => r.resourceKey).join(', ')}`)
      } else {
        warn('Catalog is empty - add resources first to test downloads')
      }
    } catch (error) {
      fail('Could not get resources from catalog', error.message)
    }
  } else {
    fail('Catalog Manager is NOT initialized', 'Check if CatalogProvider is mounted')
  }

  console.log('')
  console.log('%c3. Checking Worker Files', 'font-weight: bold; color: #475569;')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Test 5: Check if worker file exists (by trying to fetch it)
  try {
    // This won't actually work for module workers, but we can check the structure
    info('Worker file should be at: src/workers/backgroundDownload.worker.ts')
    info('Check Network tab to see if worker loaded')
  } catch (error) {
    warn('Could not verify worker file existence')
  }

  console.log('')
  console.log('%c4. Checking IndexedDB Cache', 'font-weight: bold; color: #475569;')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Test 6: Check IndexedDB
  try {
    const dbRequest = indexedDB.open('tc-study-cache', 1)
    
    await new Promise((resolve, reject) => {
      dbRequest.onsuccess = (event) => {
        const db = event.target.result
        pass('IndexedDB database exists')
        
        try {
          const transaction = db.transaction(['cache-entries'], 'readonly')
          const store = transaction.objectStore('cache-entries')
          const countRequest = store.count()
          
          countRequest.onsuccess = () => {
            const count = countRequest.result
            if (count > 0) {
              pass(`Found ${count} cached entries`)
              info('Resources have been downloaded and cached')
            } else {
              info('Cache is empty (no downloads yet)')
            }
            db.close()
            resolve()
          }
          
          countRequest.onerror = () => {
            warn('Could not count cache entries')
            db.close()
            resolve()
          }
        } catch (error) {
          warn('Could not access cache store:', error.message)
          db.close()
          resolve()
        }
      }
      
      dbRequest.onerror = () => {
        fail('Could not open IndexedDB database')
        reject()
      }
    })
  } catch (error) {
    fail('IndexedDB check failed', error.message)
  }

  console.log('')
  console.log('%c5. Console Log Analysis', 'font-weight: bold; color: #475569;')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  info('Look for these messages in console:')
  console.log('  • %c[useBackgroundDownload] Worker initialized', 'color: #0284c7;')
  console.log('  • %c[Worker] Background Download Worker loaded and ready', 'color: #0284c7;')
  console.log('  • %c[Worker] Starting downloads...', 'color: #0284c7;')
  console.log('  • %c📦 Using ZIP method...', 'color: #16a34a;')
  console.log('  • %c✅ Downloaded...', 'color: #16a34a;')
  console.log('')

  console.log('%c6. DevTools Checks', 'font-weight: bold; color: #475569;')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  info('Manual checks to perform:')
  console.log('  1. Open Sources tab → Threads panel')
  console.log('     → Should see "backgroundDownload.worker.ts" thread')
  console.log('')
  console.log('  2. Open Application tab → IndexedDB → tc-study-cache')
  console.log('     → Should see cache entries after download')
  console.log('')
  console.log('  3. Open Network tab → Watch for requests during download')
  console.log('     → Should see requests to git.door43.org')
  console.log('')
  console.log('  4. Try interacting with UI during download')
  console.log('     → UI should remain responsive (not frozen)')
  console.log('')

  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #2563eb;')
  console.log('')

  const duration = Date.now() - startTime
  console.log('%cTest Summary:', 'font-weight: bold; font-size: 16px;')
  console.log(`  %c✅ Passed: ${passedTests}`, 'color: #16a34a; font-weight: bold;')
  console.log(`  %c❌ Failed: ${failedTests}`, 'color: #dc2626; font-weight: bold;')
  console.log(`  %c⏱️  Duration: ${duration}ms`, 'color: #6b7280;')
  console.log('')

  if (failedTests === 0) {
    console.log('%c🎉 All checks passed!', 'font-size: 18px; font-weight: bold; color: #16a34a;')
    console.log('%cWorker should be functioning correctly.', 'color: #16a34a;')
    console.log('')
    console.log('%cNext steps:', 'font-weight: bold;')
    console.log('  1. Use <AutoBackgroundDownloader /> component')
    console.log('  2. Or manually trigger: useBackgroundDownload().startDownload([...])')
    console.log('  3. Watch console for [Worker] messages')
  } else {
    console.log('%c⚠️  Some checks failed', 'font-size: 18px; font-weight: bold; color: #ea580c;')
    console.log('%cSee TESTING_WEB_WORKER.md for troubleshooting', 'color: #ea580c;')
  }

  console.log('')
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #2563eb;')
  console.log('')

  // Return summary object
  return {
    passed: passedTests,
    failed: failedTests,
    duration,
    success: failedTests === 0,
    timestamp: new Date().toISOString()
  }
})()
