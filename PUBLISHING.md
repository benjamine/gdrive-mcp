# Publishing to npm

## Prerequisites

1. Make sure you're logged into npm:
   ```bash
   npm login
   ```

2. Verify you're logged in:
   ```bash
   npm whoami
   ```

## Publishing Steps

1. **Update version** (if needed):
   ```bash
   # For patch releases (1.0.0 -> 1.0.1)
   npm version patch
   
   # For minor releases (1.0.0 -> 1.1.0)
   npm version minor
   
   # For major releases (1.0.0 -> 2.0.0)
   npm version major
   ```

2. **Verify package contents**:
   ```bash
   npm pack --dry-run
   ```

3. **Run checks**:
   ```bash
   bun run check
   ```

4. **Publish**:
   ```bash
   npm publish
   ```

## After Publishing

1. **Verify on npm**:
   - Visit: https://www.npmjs.com/package/gdrive-mcp
   - Check that all files are included
   - Test installation: `bunx gdrive-mcp-auth --help`

2. **Create Git tag**:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

3. **Update GitHub Release**:
   - Go to https://github.com/benjamine/gdrive-mcp/releases
   - Create a new release with the tag
   - Add release notes

## Testing After Publication

```bash
# Test auth setup (bunx downloads and runs automatically)
bunx --bun gdrive-mcp-auth YOUR_CLIENT_ID YOUR_CLIENT_SECRET

# Test server
bunx --bun gdrive-mcp

# Or test with global install
bun add -g gdrive-mcp
gdrive-mcp-auth YOUR_CLIENT_ID YOUR_CLIENT_SECRET
gdrive-mcp
```

## Troubleshooting

### "You do not have permission to publish"
- Make sure the package name isn't taken
- Verify you're logged into the correct npm account

### "Package name too similar to existing package"
- You may need to use a scoped package: `@benjamine/gdrive-mcp`

### Binaries not executable
- Make sure both bin files have shebangs: `#!/usr/bin/env bun`
- Check package.json bin configuration
