# Installation Guide — Verify, Troubleshoot, Update, Uninstall (part 2 of 2)

> **Original uploaded doc — not verified against the code.** For the actual current state see [project status](../../overview/project-status.md) and the index in `CLAUDE.md`.

Parts: [1. Build, deploy, configure](build-deploy-configure.md) · **2. Verify, troubleshoot, update, uninstall**

## Verification

### Test Installation

1. Check if app appears in OpenCloud apps list
2. Open a ZIP file and verify it loads
3. Test file viewing and downloading
4. Verify archive creation works
5. Test sharing functionality

### Test Commands

```bash
# Lint code
npm run lint

# Run tests (if available)
npm test

# Check bundle size
npm run build && ls -lh dist/
```

### Browser Console Tests

Open browser console and run:

```javascript
// Check if app loaded
console.log(ArchiveViewer);

// Check dependencies
console.log(typeof fflate !== 'undefined');
```

## Troubleshooting

### Build Errors

**Error: Cannot find module**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Webpack build fails**
```bash
# Check Node version
node --version  # Should be 14.x or higher

# Clear webpack cache
rm -rf node_modules/.cache
npm run build
```

### Runtime Errors

**"Failed to load archive"**
- Check file permissions
- Verify file URL is accessible
- Check browser console for CORS errors

**"Memory error" on large files**
- Increase chunk size in StreamProcessor
- Check browser memory limits
- Try with smaller archive first

**Archive format not supported**
- Verify MIME type in appinfo/info.json
- Check format detection in detectArchiveType()
- Install required decompression library

### Performance Issues

**Slow loading on large archives**
- Check network speed (use browser dev tools)
- Verify streaming is working (check Network tab)
- Reduce CHUNK_SIZE if needed

**High memory usage**
- Check MAX_MEMORY_BUFFER setting
- Verify range requests are working
- Monitor browser memory in dev tools

## Updating

### Update Dependencies

```bash
# Check for updates
npm outdated

# Update specific package
npm update fflate

# Update all packages
npm update

# Rebuild
npm run build
```

### Update to Latest Version

```bash
# Pull latest code
git pull origin main

# Install any new dependencies
npm install

# Rebuild
npm run build

# Redeploy (see deployment methods above)
```

## Uninstallation

### From OpenCloud

```bash
# Using CLI
opencloud-cli app:disable archive-viewer
opencloud-cli app:uninstall archive-viewer

# Or manually
rm -rf /var/www/opencloud/apps/archive-viewer
```

### Clean Local Build

```bash
# Remove build artifacts
rm -rf dist/ node_modules/

# Remove configuration
rm -rf .env
```

## Additional Resources

- [README.md](../../../README.md) - Full documentation
- [OpenCloud Docs](https://docs.opencloud.eu)
- [GitHub Issues](https://github.com/opencloud-eu/web-extensions/issues)
- [npm packages](https://www.npmjs.com/package/@opencloud/web-app-archive-viewer)

## Support

For installation help:
1. Check [GitHub Issues](https://github.com/opencloud-eu/web-extensions/issues)
2. Visit [OpenCloud Forum](https://forum.opencloud.eu)
3. Contact support at support@opencloud.eu
