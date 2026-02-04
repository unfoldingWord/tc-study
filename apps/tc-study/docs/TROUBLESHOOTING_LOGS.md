# Troubleshooting: Not Seeing Console Logs

## 🔍 Quick Checklist

### 1. ✅ Is the App Running?

**Check if development server is running:**
```bash
# In your terminal, you should see something like:
# ✔ Built in XXms
# or
# webpack compiled successfully
```

**If NOT running, start it:**
```bash
# From the bt-synergy root
npm start

# OR if using nx
nx serve tc-study
```

**Expected output:**
```
> nx run tc-study:serve

 NX  Web Development Server is listening at http://localhost:3000/
```

### 2. 🔄 Refresh the Page

After starting the app, **hard refresh** the browser:
- **Windows/Linux**: `Ctrl + Shift + R` or `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`

This ensures you're loading the latest code.

### 3. 🔍 Open Browser Console

Make sure console is open:
- Press `F12`
- Or right-click → "Inspect" → "Console" tab

### 4. 🎯 Set Console Filter

In the console filter box, type:
```
[BG-DL]
```

### 5. 📍 Navigate to the Read Page

```
http://localhost:3000/read
```

Or click the "Read" link in your app.

### 6. 🌐 Select a Language

**This is the trigger!** Background downloads only start when you select a language.

1. Look for the language dropdown
2. Click and select any language (e.g., "English")
3. **Wait 3-5 seconds**

### 7. 👀 Expected Console Output

You should now see:
```
[BG-DL] 🔄 Auto Language changed to en, scheduling check in 3000ms...
[BG-DL] 📦 Cache Checking all resources...
[BG-DL] 📦 Cache Found 6 resources in catalog
[BG-DL] 🔄 Auto 6 incomplete resources found, starting downloads...
[BG-DL] 🔌 Hook Starting downloads: [...]
[BG-DL] ⚙️ Worker Background Download Worker loaded and ready
```

---

## 🐛 Still Not Seeing Logs?

### Issue 1: No `[BG-DL]` Logs at All

**Possible causes:**

#### A. TypeScript Not Compiled

**Solution:**
```bash
# Stop the dev server (Ctrl+C)
# Rebuild
npm run build

# Or for nx
nx build tc-study

# Then restart
npm start
```

#### B. Changes Not Hot-Reloaded

**Solution:**
```bash
# Stop the dev server (Ctrl+C)
# Start again
npm start
```

#### C. Wrong Port/URL

**Check:**
- Are you on `localhost:3000/read`?
- Or is your app on a different port (4200, 3000, etc.)?

**Find the correct port:**
```bash
# Look for this in your terminal:
# "Web Development Server is listening at http://localhost:XXXX/"
```

#### D. Cache/Build Issues

**Nuclear option - clear everything:**
```bash
# Stop dev server
# Clear build cache
rm -rf dist
rm -rf node_modules/.cache

# Restart
npm start
```

### Issue 2: Other Logs But No `[BG-DL]` Logs

**This means the feature isn't triggering.**

**Debug steps:**

#### Step 1: Check if useAutoDownloadIncomplete is running

Add this temporarily to `SimplifiedReadView.tsx`:
```typescript
// Add right after the useAutoDownloadIncomplete hook
useEffect(() => {
  console.log('[DEBUG] useAutoDownloadIncomplete is mounted')
}, [])
```

If you don't see `[DEBUG] useAutoDownloadIncomplete is mounted`, the hook isn't being called.

#### Step 2: Check if language is being set

Add this temporarily:
```typescript
useEffect(() => {
  console.log('[DEBUG] initialLanguage:', initialLanguage)
}, [initialLanguage])
```

If `initialLanguage` is null or undefined, the auto-download won't trigger.

#### Step 3: Check if completenessChecker exists

Add this:
```typescript
useEffect(() => {
  console.log('[DEBUG] completenessChecker:', completenessChecker ? 'EXISTS' : 'NULL')
}, [completenessChecker])
```

If it's NULL, the context isn't providing it correctly.

### Issue 3: Some `[BG-DL]` Logs But Not All

**Example: See Hook/Worker but not Cache/Auto logs**

This means parts are working but not all.

**Check each component:**

1. **Cache logs missing?**
   - CompletenessChecker might not be instantiated
   - Check `CatalogContext.tsx` is providing it

2. **Auto logs missing?**
   - useAutoDownloadIncomplete hook might not be running
   - Check it's imported and called in SimplifiedReadView

3. **Worker logs missing?**
   - Worker might not be starting
   - Check for worker errors (different from [BG-DL] logs)

4. **Hook logs missing?**
   - useBackgroundDownload might not be running
   - Check it's imported and called

---

## 🔧 Manual Testing

### Test 1: Check if Files Exist

```bash
# From bt-synergy root
ls apps/tc-study/src/lib/services/ResourceCompletenessChecker.ts
ls apps/tc-study/src/hooks/useAutoDownloadIncomplete.ts
ls apps/tc-study/src/workers/backgroundDownload.worker.ts
```

All should exist.

### Test 2: Check for Syntax Errors

```bash
# Run linter
npm run lint

# Or with nx
nx lint tc-study
```

Fix any errors shown.

### Test 3: Force TypeScript Compile

```bash
# Compile TypeScript
npm run build

# Check for errors in output
```

### Test 4: Check Console for ANY Errors

In browser console, look for **red error messages**. Common ones:

- `Module not found` - Import path is wrong
- `Cannot read property of undefined` - Object doesn't exist
- `Worker error: window is not defined` - Worker importing React (already fixed)

### Test 5: Test Individual Components

**Test CompletenessChecker directly:**

Open browser console, run:
```javascript
// Get the catalog manager
const catalogManager = window.__catalogManager__

// Should exist
console.log('CatalogManager:', catalogManager ? 'EXISTS' : 'NULL')
```

---

## 📋 Verification Checklist

Go through this list:

- [ ] Dev server is running (`npm start` or `nx serve tc-study`)
- [ ] No build errors in terminal
- [ ] Browser is at correct URL (`http://localhost:XXXX/read`)
- [ ] Page is refreshed after code changes (Ctrl+Shift+R)
- [ ] Browser console is open (F12)
- [ ] Console filter is set to `[BG-DL]`
- [ ] Language is selected from dropdown
- [ ] Waited at least 5 seconds after selecting language
- [ ] No red errors in console
- [ ] No TypeScript compilation errors

---

## 🆘 Last Resort

If nothing works:

### 1. Verify Changes Were Applied

Check the actual file contents:

```bash
# Check if prefix exists in files
grep -r "\[BG-DL\]" apps/tc-study/src/lib/services/
grep -r "\[BG-DL\]" apps/tc-study/src/hooks/
grep -r "\[BG-DL\]" apps/tc-study/src/workers/
```

Should show multiple matches.

### 2. Manual Console.log Test

Add this to `SimplifiedReadView.tsx` at the TOP of the component:

```typescript
export function SimplifiedReadView({ initialLanguage }: SimplifiedReadViewProps) {
  console.log('[TEST] SimplifiedReadView mounted')
  
  // ... rest of component
```

If you don't see `[TEST] SimplifiedReadView mounted`, the component isn't rendering.

### 3. Check Network Tab

1. Open DevTools → Network tab
2. Refresh page
3. Look for:
   - `backgroundDownload.worker.ts` or similar worker file
   - Should have status 200

If worker file shows 404, the worker isn't being built correctly.

---

## ✅ Success Criteria

You'll know it's working when you see ALL of these in order:

```
[BG-DL] 🔄 Auto Language changed to en, scheduling check in 3000ms...
[BG-DL] 📦 Cache Checking all resources...
[BG-DL] 📦 Cache Found X resources in catalog
[BG-DL] 📦 Cache Check complete in XXXms
[BG-DL] 🔄 Auto X incomplete resources found, starting downloads...
[BG-DL] 🔌 Hook Starting downloads: [...]
[BG-DL] 🔌 Hook Worker initialized
[BG-DL] ⚙️ Worker Background Download Worker loaded and ready
[BG-DL] ⚙️ Worker Initializing services...
[BG-DL] ⚙️ Worker Initialization complete
```

---

## 💬 Need More Help?

If you're still stuck, provide:

1. **Terminal output** when running `npm start`
2. **Full browser console output** (all messages, not just filtered)
3. **Any red error messages**
4. **Which step in this guide you're at**

Good luck! 🍀
