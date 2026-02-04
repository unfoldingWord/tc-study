# Testing Guide: Door43 API Integration

## Automated Tests ✅

Run automated integration tests:
```bash
bun run test:door43
```

**Status:** ✅ All 10 tests passing

## Manual UI Testing

Follow these steps to verify the Door43 API integration in the mobile app UI:

### 1. Resource Discovery

**Test Package Search:**
1. Open the app on your device/emulator
2. Navigate to the package selection screen
3. Search for packages (e.g., "english", "bible")
4. **Expected:** Packages should load from Door43 API using `ResourceDiscoveryService`
5. **Verify:** Check console logs for Door43ApiClient usage

**What's being tested:**
- `ResourceDiscoveryService.getAvailableLanguages()` → uses `client.getLanguages()`
- `ResourceDiscoveryService.searchResources()` → uses `client.searchCatalog()`

### 2. Package Installation

**Test Installing a Translation Questions Package:**
1. Search for "translation questions"
2. Select "English Translation Questions (TQ)"
3. Click "Install" or "Download"
4. **Expected:** Package downloads and installs successfully
5. **Verify:** Check that content is fetched using Door43ApiClient

**What's being tested:**
- `Door43QuestionsAdapter.getResourceMetadata()` → uses `client.findRepository()`
- `Door43QuestionsAdapter.getBookContent()` → uses `client.fetchTextContent()`

### 3. Scripture Content

**Test Loading Scripture:**
1. Install "English ULT" (Literal Text)
2. Open a book (e.g., Genesis)
3. **Expected:** USFM content loads and displays correctly
4. **Verify:** Content is fetched via Door43ApiClient

**What's being tested:**
- `Door43ScriptureAdapter.findRepository()` → uses `client.findRepository()`
- `Door43ScriptureAdapter.getBookContent()` → uses `client.fetchTextContent()`

### 4. Translation Notes

**Test Loading Notes:**
1. Install "English Translation Notes (TN)"
2. Load notes for a specific verse
3. **Expected:** Notes display correctly
4. **Verify:** TSV content is fetched correctly

**What's being tested:**
- `Door43NotesAdapter.getResourceMetadata()` → uses `client.findRepository()`
- `Door43NotesAdapter.getBookContent()` → uses `client.fetchTextContent()`

### 5. Translation Academy

**Test Loading Academy Articles:**
1. Navigate to Translation Academy section
2. Open an article (e.g., "Translate Unknown")
3. **Expected:** Markdown content displays
4. **Verify:** Content fetched via API client

**What's being tested:**
- `Door43AcademyAdapter.getResourceMetadata()` → uses `client.findRepository()`
- Article content fetch → uses `client.fetchTextContent()`

### 6. Translation Words

**Test Loading Translation Words:**
1. Install "English Translation Words (TW)"
2. Look up a word (e.g., "God", "Faith")
3. **Expected:** Word definitions display correctly
4. **Verify:** Content is fetched via API client

**What's being tested:**
- `Door43TranslationWordsAdapter.getResourceMetadata()` → uses `client.findRepository()`
- Word content fetch → uses `client.fetchTextContent()`

### 7. Error Handling

**Test Network Errors:**
1. Disable internet connection
2. Try to search for packages
3. **Expected:** Graceful error message displays
4. **Verify:** Error handling works correctly

**Test Invalid Resources:**
1. Manually trigger loading of a non-existent resource
2. **Expected:** Error is caught and displayed to user
3. **Verify:** App doesn't crash

## Verification Checklist

- [ ] Automated tests pass (10/10) ✅
- [ ] Package search works
- [ ] Translation Questions loads
- [ ] Scripture (ULT) loads
- [ ] Translation Notes loads
- [ ] Translation Academy articles load
- [ ] Translation Words loads
- [ ] Error handling works
- [ ] No direct fetch() calls to Door43 (all go through API client)
- [ ] Console shows Door43ApiClient usage

## Debug Console Logs

When testing, watch for these console logs:

```
✅ Found X languages
✅ Found Y resources
✅ Fetched Z characters
```

These indicate successful Door43ApiClient usage.

## Performance Testing

**Expected Performance:**
- Language list: < 2 seconds
- Resource search: < 3 seconds
- Content fetch (TSV): < 2 seconds
- Content fetch (USFM): < 3 seconds
- Repository lookup: < 1 second

If performance is slower, check network conditions or API timeouts.

## Troubleshooting

**Issue:** "Cannot find module '@bt-synergy/door43-api'"
- **Fix:** Run `bun install` from the root directory

**Issue:** "Network request failed"
- **Fix:** Check internet connection and Door43 API status

**Issue:** "Missing required parameters"
- **Fix:** Check that adapter is passing correct parameters to API client

**Issue:** App crashes when loading resources
- **Fix:** Check console for specific error and verify adapter migration

## Next Steps

After manual testing:
1. Document any issues found
2. Create bug reports for failures
3. Add more edge case tests if needed
4. Monitor performance in production

---

**Last Updated:** December 2024
**Status:** ✅ Ready for testing

