# TC-Study Studio - Implementation Progress

## ✅ What's Been Accomplished

### 1. Spike App (apps/linked-panels-spike)
- ✅ **Working bidirectional communication** at http://localhost:3458/
- ✅ Text ↔ Dictionary messaging proven
- ✅ Complete documentation of patterns
- ✅ Proof-of-concept successful

### 2. Renamed: Study → Studio
- ✅ Route: `/study` → `/studio`
- ✅ Page: `Study.tsx` → `Studio.tsx`
- ✅ Component: `LinkedPanelsStudy` → `LinkedPanelsStudio`
- ✅ Folder: `components/study/` → `components/studio/`
- ✅ Navigation: "Study" → "Studio" with 🎬 icon

### 3. Layered Architecture (Like Mobile App)
- ✅ **AppContext** - Resource management, anchor resource
- ✅ **NavigationContext** - BCV navigation, history, available books
- ✅ **Resource Layer** - Exposes TOC, reacts to navigation
- ✅ **UI Layer** - NavigationBar, BCVNavigator, linked-panels

### 4. Navigation System
- ✅ **NavigationBar** - History buttons, current reference, mode selector
- ✅ **Dual Navigation Modes**:
  - **Anchor-based** - Full BCV navigation with scripture resource
  - **Passage Set** - Navigate curated passages without anchor
- ✅ **Conditional Navigation** - Active when anchor OR passage set exists
- ✅ **Disabled State** - Clear messaging when neither available
- ✅ **BCVNavigator** - Two-step modal:
  1. Select book from available books
  2. Select verses in grid (can span chapters!)
- ✅ **Navigation History** - Back/forward working
- ✅ **Verse Ranges** - Cross-chapter selection supported
- ✅ **Passage Set Navigation** - Next/Previous through curated list
- ✅ **Mode Indicators** - Blue for BCV, Purple for Passage Sets

### 5. Scripture Resource (Based on Mobile App)
- ✅ **USFM Parsing** - Chapters, verses, tokens
- ✅ **TOC Extraction** - Books, chapters, verses per chapter
- ✅ **Content Loading** - Reacts to currentReference changes
- ✅ **Tokenization** - Each word clickable with unique ID
- ✅ **Inter-Panel Communication** - Sends token-click events
- ✅ **Sample Data** - Titus 1:1-5, Genesis 1:1-3, Matthew 1:1-2

### 6. Resource Management UI
- ✅ **AnchorSelector** - Dropdown to choose primary scripture
- ✅ **PanelResourceManager** - Add/remove resources per panel
- ✅ **ResourceSelector** - Search local/online (skeleton created)
- ✅ **"Manage Resources" Button** - Toggle resource management UI

### 7. Inter-Panel Communication
- ✅ **Plugins** - 6 message types with validators
- ✅ **Token Clicking** - Scripture → Notes filtering
- ✅ **Message Flow** - Proven working in console logs
- ✅ **Local State Pattern** - Immediate visual feedback

---

## 🎯 Current Status

**URL**: http://localhost:3001/studio
**Status**: ✅ WORKING

**What Works:**
- ✅ **Dual Navigation Modes**:
  - Scripture anchor → Full BCV navigation
  - Passage set → Navigate curated passages (no anchor needed!)
- ✅ Graceful empty state with clear messaging
- ✅ Navigation with BCV Navigator (when anchor exists)
- ✅ Demo passage set button ("Parables of Jesus")
- ✅ Scripture viewer with real USFM parsing
- ✅ Token clicking → Notes filtering
- ✅ Anchor resource selection
- ✅ Resource management UI (skeleton)

**What's Hardcoded:**
- ❌ Initial 4 resources in LinkedPanelsStudio
- ❌ Sample USFM data (3 books)
- ❌ Sample notes data
- ✅ Demo passage set (for testing)

---

## 📝 Next Steps

### Immediate: Make Resources Dynamic

1. **Remove Hardcoded Resources**
   - Clear initial resources from LinkedPanelsStudio
   - Start with empty panels or prompt user

2. **Adapt ResourceSelector**
   - Reuse existing ResourceSelector from package-creator
   - Connect to Door43 API
   - Search local catalog → online fallback
   - Add selected resources to panels

3. **Studio Layout Persistence**
   - Save panel configuration (like resource package)
   - Store: which resources in which panels
   - Store: anchor resource selection
   - Load on app start

4. **Resource Loading**
   - When resource added, fetch USFM from catalog/Door43
   - Parse and display
   - Expose TOC if scripture
   - Update navigation if anchor

### Future: Catalog Integration

5. **Connect to @bt-synergy/resource-catalog**
   - Three-tier lookup (memory → IndexedDB → online)
   - Cache downloaded resources
   - Offline-first approach

6. **Resource Packages**
   - Load pre-configured resource sets
   - Quick start with common combinations
   - Share layouts between users

---

## 🏗️ Architecture Summary

```
Studio Layout (Extended Resource Package)
  ├── Panel 1 Resources []
  ├── Panel 2 Resources []
  ├── Anchor Resource ID
  └── Navigation State

Resource Addition Flow:
  1. User clicks "Add Resource" in panel
  2. ResourceSelector opens (from package-creator)
  3. User searches/browses (local catalog → Door43)
  4. User selects resource
  5. Resource added to AppContext
  6. Resource added to panel config
  7. linked-panels updates
  8. Resource component renders
  9. If scripture & no anchor → set as anchor
  10. TOC exposed → navigation updated
```

---

## 📚 Key Patterns Established

### 1. Resource → Navigation Communication
```typescript
// In ScriptureViewer (anchor resource)
const toc = extractTOC(usfm)
app.setAnchorResource(resourceId, toc)
// → NavigationContext receives available books
```

### 2. Navigation → Resource Communication
```typescript
// In any resource
const currentRef = useCurrentReference()
useEffect(() => {
  // Load content for currentRef.book
}, [currentRef.book])
```

### 3. Inter-Panel Communication (linked-panels)
```typescript
// Send
api.messaging.sendToAll(tokenClickMessage)

// Receive
useEvents('resource-id', ['token-click'], (event) => {
  // React to event
})
```

### 4. Immediate UI Feedback
```typescript
// Update local state first
setLocalHighlights([tokenId])
// Then broadcast
api.messaging.sendToAll(message)
// Combine for rendering
const highlights = localHighlights.length > 0 
  ? localHighlights 
  : broadcastHighlights
```

---

## 🎯 Files to Update Next

1. **LinkedPanelsStudio.tsx**
   - Remove hardcoded resources
   - Make panelConfig dynamic
   - React to resource additions/removals

2. **ResourceSelector.tsx** (studio version)
   - Adapt from package-creator version
   - Add "Add to Panel 1/2" buttons
   - Connect to catalog system

3. **AppContext.tsx**
   - Add resource loading method
   - Cache loaded resources
   - Persist studio layout

4. **ScriptureViewer.tsx**
   - Connect to real catalog for USFM
   - Remove hardcoded sample data
   - Load from cache/Door43

---

## ✨ Success So Far

The foundation is solid! We have:
- ✅ Proper layered architecture (App, Navigation, Resource)
- ✅ Working inter-panel communication
- ✅ Scripture resource following mobile app pattern
- ✅ BCV Navigator with verse grid
- ✅ Resource management UI framework
- ✅ Anchor resource pattern
- ✅ All context layers communicating properly

**Next**: Make it fully dynamic by removing hardcoded resources and connecting to the real catalog system!
