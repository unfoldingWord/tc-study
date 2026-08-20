# Admin Panel - Development Tool

## Overview

The Admin Panel is a development-only tool that provides comprehensive visibility into the resource management system. It shows resource metadata, dependencies, loading status, and cache completeness for debugging and monitoring.

## Features

### 📊 Real-time Statistics
- **Total Resources**: Count of all resources in the catalog
- **Complete**: Number of fully downloaded/cached resources
- **Incomplete**: Number of resources missing or partially cached
- **Errors**: Number of resources with download/cache errors

### 🔍 Search & Filter
- **Search**: Filter resources by resource key or title
- **Status Filter**: Filter by completion status (all/complete/incomplete/error)
- **Refresh**: Reload all resource data on demand

### 📦 Resource Information
Each resource displays:
- **Resource Key**: Unique identifier (e.g., `unfoldingWord/en/tn`)
- **Status Badge**: Visual indicator of cache status
  - 🟢 **Complete**: Fully downloaded and cached
  - 🟡 **Partial**: Partially downloaded
  - 🔴 **Error**: Download or cache error
  - ⚪ **Missing**: Not yet downloaded
- **Priority**: Download priority number (lower = higher priority)
- **Dependencies**: Number of dependent resources

### 📝 Expanded Details
Click any resource to see:

#### Metadata
- Resource key
- Type (scripture, tn, tw, twl, ta)
- Title
- Language
- Ingredients count (books/entries)

#### Cache Status
- Status (complete/partial/missing/error)
- Last downloaded timestamp
- Cache size in MB
- Error message (if any)

#### Dependencies
- List of all dependent resources
- Resource keys with visual indicators

## Access

### Development Mode Only
The Admin Panel is **only visible in development mode** (`npm run dev`). It will not appear in production builds.

### Opening the Panel
1. Look for the purple "Admin Panel" button in the bottom-right corner
2. Click it to open the full panel
3. Click the X icon or outside the panel to close

### Keyboard Shortcut (Future)
Consider adding: `Ctrl+Shift+A` or `Cmd+Shift+A` to toggle the panel

## Use Cases

### 1. Debugging Resource Issues
- Check if a resource is fully cached
- Identify partial or failed downloads
- See error messages for failed resources

### 2. Monitoring Dependencies
- Verify dependencies are resolved correctly
- Check dependency order
- Identify missing dependencies

### 3. Testing Download System
- Monitor download progress
- Verify priority ordering
- Check completeness after downloads

### 4. Development Workflow
- Quickly see what resources are available
- Check resource metadata without console logs
- Verify catalog integrity

## Implementation Details

### Components
- **AdminPanel**: Main panel component with full UI
- **ResourceCard**: Individual resource card with expand/collapse

### Data Sources
- **CatalogManager**: Resource metadata
- **ResourceCompletenessChecker**: Cache status
- **DependencyResolver**: Dependency information
- **ResourceTypeRegistry**: Priority and type information

### Performance
- Data is loaded **on-demand** when panel is opened
- Efficient filtering using JavaScript array methods
- Refresh button to reload data without closing panel

## Architecture

```
┌─────────────────────────────────────────────────┐
│              AdminPanel Component               │
│  ┌───────────────────────────────────────────┐ │
│  │ Stats Bar (Total/Complete/Incomplete/Err) │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │ Filters (Search + Status Filter + Refresh)│ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │           Resource List                   │ │
│  │  ┌─────────────────────────────────────┐ │ │
│  │  │  ResourceCard (Collapsed)           │ │ │
│  │  │  - Key + Status + Priority + Deps   │ │ │
│  │  └─────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────┐ │ │
│  │  │  ResourceCard (Expanded)            │ │ │
│  │  │  - Metadata Section                 │ │ │
│  │  │  - Cache Status Section             │ │ │
│  │  │  - Dependencies Section             │ │ │
│  │  └─────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
  CatalogManager  CompletenessChecker  DependencyResolver
```

## Example Workflow

### Scenario: Check why Translation Notes isn't showing data

1. **Open Admin Panel**
   - Click purple button in bottom-right

2. **Search for Resource**
   - Type "en/tn" in search box
   - Find `unfoldingWord/en/tn`

3. **Check Status**
   - Look at status badge
   - If "Partial" or "Missing", resource needs downloading

4. **Expand Details**
   - Click resource to expand
   - Check cache status for error messages
   - Verify dependencies are complete

5. **Check Dependencies**
   - Expand dependencies section
   - Verify UGNT and UHB are complete
   - If not, those need downloading first

6. **Take Action**
   - Go to Library page to download missing resources
   - Or use Data Management to clear and re-download

## Future Enhancements

### Planned Features
- [ ] Trigger downloads directly from panel
- [ ] Clear cache for individual resources
- [ ] Export resource data as JSON
- [ ] Visualize dependency graph
- [ ] Show resource size statistics
- [ ] Add keyboard shortcuts
- [ ] Show download history/logs
- [ ] Compare expected vs actual ingredients
- [ ] Resource health scores

### Performance Improvements
- [ ] Virtualize long resource lists
- [ ] Cache panel data between opens
- [ ] Real-time updates via events
- [ ] Lazy load dependency resolution

## Tips

### Finding Specific Resources
Use the search box to quickly find resources:
- Search by language: "en", "es", "fr"
- Search by type: "tn", "tw", "scripture"
- Search by owner: "unfoldingWord", "Door43"

### Monitoring Downloads
1. Start a download in Library page
2. Open Admin Panel
3. Set filter to "Incomplete"
4. Click Refresh periodically to see progress

### Debugging Dependency Issues
1. Search for the dependent resource (e.g., TN)
2. Expand it to see dependencies
3. Check if dependencies are complete
4. If not, those need downloading first

## Troubleshooting

### Panel Won't Open
- Verify you're running in dev mode (`npm run dev`)
- Check console for errors
- Try refreshing the page

### Data Not Loading
- Click the Refresh button
- Check console for errors
- Verify catalog is initialized

### Resources Not Showing
- Clear search query
- Set filter to "All Status"
- Check if catalog has any resources

## Security

The Admin Panel:
- ✅ Only appears in development mode
- ✅ Does not expose sensitive data
- ✅ Cannot modify production data
- ✅ Is excluded from production builds
- ✅ Has no external network access

## Related Documentation

- [Dependency Resolution System](./DEPENDENCY-RESOLUTION.md)
- [Resource Loading](./RESOURCE-LOADING.md)
- [Cache Management](./CACHE-MANAGEMENT.md)
