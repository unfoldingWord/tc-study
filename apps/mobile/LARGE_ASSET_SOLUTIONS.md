# Large Asset Download Issue - Solutions

## Problem
The 55MB ZIP archive fails to download from Metro dev server with error:
```
Unable to download asset from url: http://192.168.3.199:8081/assets/...
```

This is a **known limitation** of Metro bundler in development mode - it times out when serving large files.

## Solutions (Choose One)

### Solution 1: Build in Release Mode (RECOMMENDED)
The asset will be bundled directly into the APK, bypassing the Metro dev server entirely.

```bash
cd bt-synergy

# For Android
npx expo run:android --variant release

# For iOS
npx expo run:ios --configuration Release
```

**Pros:**
- ✅ Most reliable solution
- ✅ Tests production build
- ✅ No timeout issues
- ✅ Asset is bundled in APK/IPA

**Cons:**
- ⏱️ Slower build process
- 🔄 Need to rebuild after changes

### Solution 2: Pre-copy Asset to Device
Copy the ZIP file directly to the device/emulator, bypassing Metro entirely.

#### For Android Emulator:
```bash
# Push file to device
adb push assets/unfoldingword_en_resources_archive.zip /sdcard/Download/

# Then modify DatabaseManager to check for file in Downloads first
```

#### Modify DatabaseManager.ts:
```typescript
// Around line 360, before Asset.fromModule
const downloadPath = `${Paths.cache}/unfoldingword_en_resources_archive.zip`;
const downloadFile = new File(downloadPath);

if (downloadFile.exists) {
  console.log('📥 Using pre-copied asset from device');
  // Use downloadFile instead of asset
} else {
  // Fallback to Asset.fromModule
  const asset = Asset.fromModule(require('../assets/unfoldingword_en_resources_archive.zip'));
  // ... existing code
}
```

**Pros:**
- ✅ Fast during development
- ✅ No Metro timeout

**Cons:**
- ⚠️ Manual step required
- ⚠️ Need to update file when changed

### Solution 3: Increase Metro Timeout (May Not Work)
Try increasing Metro's asset server timeout.

#### Create/Update metro.config.js:
```javascript
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .gz and .zip files as assets
config.resolver.assetExts.push('gz', 'zip');

// Ensure these files are treated as assets, not source files
config.resolver.sourceExts = config.resolver.sourceExts.filter(
  (ext) => ext !== 'gz' && ext !== 'zip'
);

// Increase server timeout for large assets
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, metroServer) => {
    return (req, res, next) => {
      // Increase timeout for asset requests
      if (req.url.includes('/assets/')) {
        res.setTimeout(300000); // 5 minutes
        req.setTimeout(300000);
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
```

Then restart Metro:
```bash
npm start -- --reset-cache
```

**Pros:**
- ✅ Works in development mode
- ✅ No code changes needed

**Cons:**
- ⚠️ May still timeout on slower networks
- ⚠️ Not guaranteed to work

### Solution 4: Use EAS Build (Production-Ready)
Build with EAS for production deployment.

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure
eas build:configure

# Build for Android
eas build --platform android --profile preview

# Build for iOS
eas build --platform ios --profile preview
```

**Pros:**
- ✅ Production-ready builds
- ✅ No Metro limitations
- ✅ Cloud building

**Cons:**
- ⏱️ Slower iteration
- 💰 May require paid plan for more builds

### Solution 5: Split into Smaller Chunks
Split the 55MB archive into smaller chunks (e.g., 10MB each).

```typescript
// In archive-exporter, split into chunks
const chunks = [
  'unfoldingword_en_resources_part1.zip', // 10MB
  'unfoldingword_en_resources_part2.zip', // 10MB
  // ... etc
];

// In DatabaseManager, download and merge chunks
```

**Pros:**
- ✅ Works in development mode
- ✅ Bypasses size limits

**Cons:**
- ⚠️ Complex implementation
- ⚠️ Need to merge at runtime

## Recommended Approach

### For Development & Testing
**Use Solution 1: Release Build**
```bash
npx expo run:android --variant release
```

This is the most reliable way to test with the actual bundled asset.

### For Quick Iteration
**Use Solution 2: Pre-copy Asset**
1. Copy ZIP to device once:
   ```bash
   adb push assets/unfoldingword_en_resources_archive.zip /sdcard/Download/
   ```

2. Modify DatabaseManager to check Downloads folder first

3. Develop with normal `npm start`

### For Production
**Use Solution 4: EAS Build**
- Production builds handle large assets correctly
- No Metro dev server involved
- Assets bundled into final APK/IPA

## Why This Happens

1. **Metro Dev Server**: Designed for rapid development, not large file serving
2. **Network Timeout**: Default HTTP timeouts are too short for 55MB files
3. **Development vs Production**: In production builds, assets are bundled directly
4. **Size Limitation**: Metro struggles with files > 10-20MB in development mode

## What Works in Production

✅ In production builds (release APK/IPA):
- Asset is bundled directly into the app
- No Metro dev server involved
- No download/timeout issues
- Works perfectly!

## Testing the Fix

After implementing Solution 1 (Release Build):

```bash
# Build release
npx expo run:android --variant release

# Watch console for:
# ✅ "Archive downloaded"
# ✅ "Extracting ZIP archive"
# ✅ "Resources extracted successfully"
```

## Additional Notes

- The 55MB size is **fine for production** - it's bundled in the APK
- This is **only a development issue** with Metro dev server
- Once built, the app works perfectly with the large asset
- Consider this a Metro limitation, not an app problem

## References

- [Expo Asset Documentation](https://docs.expo.dev/versions/latest/sdk/asset/)
- [Metro Bundler Configuration](https://facebook.github.io/metro/docs/configuration)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)




