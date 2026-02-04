# Debugging TOC Generator CLI

## Using Debug Mode

### Option 1: Enable Debug Logging

Run with `--debug` flag to see detailed logging:

```bash
bun dist/cli.js generate-tw --debug --owner es-419_gl --language es-419 --resource-id tw
```

This will show:
- API endpoints being called
- HTTP response status codes
- Branch creation steps
- Error details

### Option 2: Use Bun Inspector (Breakpoints)

1. **Start with inspector**:
   ```bash
   bun --inspect dist/cli.js generate-tw --owner es-419_gl --language es-419 --resource-id tw
   ```

2. **Connect debugger**:
   - Open Chrome/Edge and go to `chrome://inspect` or `edge://inspect`
   - Click "Open dedicated DevTools for Node"
   - Set breakpoints in the code
   - The execution will pause at breakpoints

3. **Or use VS Code**:
   - Create `.vscode/launch.json`:
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "name": "Debug TOC Generator",
         "type": "node",
         "request": "launch",
         "runtimeExecutable": "bun",
         "runtimeArgs": ["--inspect", "dist/cli.js"],
         "args": ["generate-tw", "--owner", "es-419_gl", "--language", "es-419", "--resource-id", "tw", "--debug"],
         "cwd": "${workspaceFolder}/packages/toc-generator-cli",
         "console": "integratedTerminal"
       }
     ]
   }
   ```
   - Press F5 to start debugging
   - Set breakpoints in `src/toc-generator.ts` or `src/cli.ts`

### Option 3: Environment Variable

Set `DEBUG=1` to enable debug logging:

```bash
DEBUG=1 bun dist/cli.js generate-tw --owner es-419_gl --language es-419 --resource-id tw
```

## Key Debug Points

Set breakpoints at:
- `packages/toc-generator-cli/src/toc-generator.ts:74` - Before branch creation
- `packages/door43-api/src/Door43ApiClient.ts:1352` - Start of createBranch
- `packages/door43-api/src/Door43ApiClient.ts:1379` - When fetching reference
- `packages/door43-api/src/Door43ApiClient.ts:1420` - When creating branch

## Common Issues

1. **"Failed to create branch"** - Check:
   - Authentication token is valid
   - Repository exists
   - Reference (branch/tag) exists
   - User has write permissions

2. **"Reference not found"** - The `fromRef` (release tag or master) doesn't exist
   - Try specifying `--ref` with a known branch/tag
   - Check if repository uses `main` instead of `master`
