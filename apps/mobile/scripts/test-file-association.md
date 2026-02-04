# Testing File Association for .obs Files

## Prerequisites
1. Build and install the app on your Android device/emulator
2. Have a test .obs file ready

## Testing Steps

### Method 1: File Manager Test
1. Use a file manager app (like Files by Google)
2. Navigate to your .obs file
3. Tap on the file
4. Android should show "Open with" options including your OBS app

### Method 2: ADB Test (Development)
If you're testing in development, you can use ADB to simulate opening a file:

```bash
# First, push a test file to the device
adb push test-collection.obs /sdcard/Download/

# Then try to open it with an intent
adb shell am start -W -a android.intent.action.VIEW -d "file:///sdcard/Download/test-collection.obs" -t "application/octet-stream" com.unfoldingword.obsapp
```

### Method 3: Share Intent Test
1. From another app (email, messaging, cloud storage)
2. Share a .obs file
3. Your OBS app should appear in the share sheet

## Troubleshooting

### If Android says "Can't open file":

1. **Check file extension**: Make sure the file actually ends with `.obs`
2. **Rebuild the app**: File associations only work after a full rebuild
3. **Clear app data**: Sometimes Android caches old associations
4. **Check file permissions**: Make sure the file is readable

### Common Issues:

1. **Development vs Production**: File associations work differently in development
2. **Android Version**: Different Android versions handle file associations differently
3. **File Source**: Files from email/download may have different MIME types

### Debug the Intent:
Add this to your app to debug what intent is being received:

```javascript
// In _layout.tsx, add this logging
useEffect(() => {
  const getInitialIntent = async () => {
    const url = await Linking.getInitialURL();
    

    // Also log any incoming URLs
    const subscription = Linking.addEventListener('url', (event) => {
      
    });

    return () => subscription?.remove();
  };

  getInitialIntent();
}, []);
```

## Manual Testing Commands

If the automatic association doesn't work, you can test the deep link directly:

```bash
# Test with custom scheme
adb shell am start -W -a android.intent.action.VIEW -d "obs-app://import?file=/path/to/file.obs" com.unfoldingword.obsapp

# Test with file URI
adb shell am start -W -a android.intent.action.VIEW -d "file:///sdcard/Download/test.obs" com.unfoldingword.obsapp
```

## Next Steps

If file association still doesn't work:
1. Check Android logs: `adb logcat | grep -i obs`
2. Verify the app is properly built with the new configuration
3. Test on a physical device (emulator sometimes behaves differently)
4. Try creating a test .obs file with proper MIME type headers
