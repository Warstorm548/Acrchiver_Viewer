# Installation Guide

## Prerequisites

- Node.js 14.x or higher
- npm 6.x or higher
- OpenCloud instance (for deployment)

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/opencloud-eu/web-extensions.git
cd web-extensions/packages/web-app-archive-viewer
```

### 2. Install Dependencies

```bash
npm install
```

This will install:
- fflate (ZIP handling)
- tar-stream (TAR handling)
- pako (gzip compression)
- Webpack and build tools

### 3. Build the Application

#### Development Build
```bash
npm run dev
```
Starts development server at http://localhost:9000

#### Production Build
```bash
npm run build
```
Creates optimized bundle in `dist/` directory

#### Watch Mode
```bash
npm run watch
```
Automatically rebuilds on file changes

## Deployment to OpenCloud

### Method 1: Manual Deployment

1. Build the application:
```bash
npm run build
```

2. Create app directory in OpenCloud:
```bash
# On your OpenCloud server
mkdir -p /var/www/opencloud/apps/archive-viewer
```

3. Copy files:
```bash
# From your build machine
scp -r dist/* user@opencloud-server:/var/www/opencloud/apps/archive-viewer/
scp -r appinfo user@opencloud-server:/var/www/opencloud/apps/archive-viewer/
```

4. Set permissions:
```bash
# On OpenCloud server
chown -R www-data:www-data /var/www/opencloud/apps/archive-viewer
chmod -R 755 /var/www/opencloud/apps/archive-viewer
```

5. Enable the app in OpenCloud admin panel

### Method 2: Using OpenCloud CLI

```bash
# Build and package
npm run build
tar -czf archive-viewer.tar.gz dist/ appinfo/ package.json

# Deploy using OpenCloud CLI
opencloud-cli app:install archive-viewer.tar.gz
opencloud-cli app:enable archive-viewer
```

### Method 3: Using Docker

1. Create Dockerfile:
```dockerfile
FROM node:14-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

2. Build and run:
```bash
docker build -t opencloud-archive-viewer .
docker run -p 8080:80 opencloud-archive-viewer
```

## Configuration

### OpenCloud Integration

Edit `appinfo/info.json` to configure:

```json
{
  "id": "archive-viewer",
  "name": "Archive Viewer",
  "types": ["filesystem"],
  "mimes": [
    "application/zip",
    "application/x-tar",
    "application/gzip",
    "application/x-gzip",
    "application/x-bzip2",
    "application/x-xz",
    "application/x-7z-compressed",
    "application/vnd.rar"
  ]
}
```

### Environment Variables

Create `.env` file (optional):

```env
# API Configuration
API_BASE_URL=https://your-opencloud-instance.com
API_VERSION=v1

# Feature Flags
ENABLE_7Z_SUPPORT=false
ENABLE_RAR_SUPPORT=false
MAX_FILE_SIZE=21474836480  # 20GB in bytes

# Performance
CHUNK_SIZE=2097152  # 2MB
MAX_MEMORY_BUFFER=104857600  # 100MB
```

### Webpack Configuration

Modify `webpack.config.js` for custom build settings:

```javascript
module.exports = {
  // Change output path
  output: {
    path: path.resolve(__dirname, 'custom-dist'),
    filename: 'custom-app.js'
  },
  
  // Add custom loaders
  module: {
    rules: [
      // ... existing rules
    ]
  },
  
  // Optimize bundle size
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all'
    }
  }
};
```

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

- [README.md](README.md) - Full documentation
- [OpenCloud Docs](https://docs.opencloud.eu)
- [GitHub Issues](https://github.com/opencloud-eu/web-extensions/issues)
- [npm packages](https://www.npmjs.com/package/@opencloud/web-app-archive-viewer)

## Support

For installation help:
1. Check [GitHub Issues](https://github.com/opencloud-eu/web-extensions/issues)
2. Visit [OpenCloud Forum](https://forum.opencloud.eu)
3. Contact support at support@opencloud.eu
