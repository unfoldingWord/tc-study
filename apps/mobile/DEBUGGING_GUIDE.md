# Debugging Guide for Asset Loading Issues

## Setup Debugging in VS Code/Cursor

### 1. Install React Native Tools Extension
If not already installed:
- Open Extensions (Ctrl+Shift+X)
- Search for "React Native Tools" by Microsoft
- Install it

### 2. Start Debugging Session

**Option A: With Debugger Attached**
1. Start Metro bundler: `npx expo start`
2. In VS Code/Cursor, press `F5` or go to Run > Start Debugging
3. Select "Attach to Hermes" configuration
4. Launch your app on Android device/emulator

**Option B: Launch and Debug**
1. Press `F5` and select "Debug Android (Expo)"
2. This will start Metro and attach the debugger

### 3. Set Breakpoints
Open `db/DatabaseManager.ts` and click in the gutter to set breakpoints at:
- Line 381: `const assetModule = Asset.fromModule(...)`
- Line 393: `const asset = await assetModule.downloadAsync()`
- Line 414: `catch (assetError: any)`

### 4. Inspect Variables
When execution pauses at a breakpoint:
- Hover over variables to see their values
- Check the Call Stack panel (left side) for the full stack trace
- Use the Debug Console to evaluate expressions

## Getting Detailed Error Information

The improved error handling will now log:
- **Error name**: Type of error (e.g., TypeError, NetworkError)
- **Error message**: Human-readable description
- **Error stack**: Full stack trace
- **Error code**: If available (e.g., TIMEOUT, ENOENT)

## Common Errors and Solutions

### Error: Timeout
```
name: 'Error'
message: 'Timeout downloading asset'
code: 'TIMEOUT'
```
**Solution**: Asset is too large for Metro dev server
- Use: `adb push assets/bundled/resources.zip` to cache
- Or build release APK: `npm run android:build`

### Error: Asset not found (404)
```
name: 'Error'
message: 'Asset not found'
code: 'ENOENT'
```
**Solution**: Check that:
- File exists at `assets/bundled/resources.zip`
- Metro config includes `.zip` extension (already done)
- expo-asset plugin is configured (already done)

### Error: Out of memory
```
name: 'Error'
message: 'Out of memory'
```
**Solution**: Large asset extraction issue
- Asset will work in production build
- For dev: use pre-pushed file method

## Using ADB Logcat for Native Logs

For more detailed native Android logs:
```bash
# Filter for React Native and your app
adb logcat -s ReactNativeJS:V DatabaseManager:V

# Or see all logs
adb logcat | grep -i "resource\|asset\|download"
```

## Chrome DevTools (Alternative)

1. Start Metro: `npx expo start`
2. Press `j` in Metro terminal to open debugger
3. Open Chrome DevTools (F12)
4. Go to Sources tab
5. Find `DatabaseManager.ts` and set breakpoints
6. Reload app (press `r` in Metro terminal)

## Network Inspector

To see asset download requests:
1. Shake device to open React Native debug menu
2. Select "Debug" or "Show Inspector"
3. Go to Network tab
4. Look for requests to `resources.zip`
5. Check status code, size, and timing

## Verifying Asset in Built APK

After building, verify asset is included:
```bash
# Build APK
npm run android:build

# Check if asset is in APK
unzip -l android/app/build/outputs/apk/debug/app-debug.apk | grep resources.zip

# Install and test
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Expected Behavior

### Development (Metro)
- Asset.fromModule() creates asset reference
- downloadAsync() fetches from Metro server  
- For 55MB file: May take 10-60 seconds or timeout
- **Workaround**: Pre-push file to device cache

### Production (Built APK)
- Asset is bundled in APK during build
- Asset.fromModule() loads from APK directly
- downloadAsync() is nearly instant (no network)
- **Should work perfectly** regardless of size


