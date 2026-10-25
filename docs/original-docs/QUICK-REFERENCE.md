# 🚀 Quick Reference Card

> **Original uploaded doc — not verified against the code.** For the actual current state see [project status](../overview/project-status.md) and the index in `CLAUDE.md`.

## Installation (3 Commands)
```bash
npm install      # Install dependencies
npm run build    # Build for production
# Deploy to /var/www/opencloud/apps/archive-viewer/
```

## File Structure
```
src/
├── index.js              # Main app
├── lib/
│   ├── StreamProcessor.js # Streaming I/O
│   ├── ArchiveReader.js   # Read archives
│   ├── ArchiveWriter.js   # Create archives
│   └── UIManager.js       # UI
└── styles/main.css        # Styling
```

## Supported Formats
✅ ZIP, TAR, TAR.GZ, GZ, TGZ
⚠️ BZ2, XZ, 7Z, RAR (partial)

## Key Features
- View without extraction
- 20GB+ file support
- Batch download
- Archive creation
- OpenCloud sharing
- Search & filter
- Dark mode

## Memory Efficiency
- 2MB chunks
- 100MB buffer
- HTTP range requests
- Streaming decompression

## Browser Support
Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## Important Files
- **README.md** - Full docs
- **INSTALL.md** - Setup guide
- **API.md** - Developer reference
- **WEB-APP-ARCHIVE-VIEWER-COMPLETE.md** - Overview

## NPM Commands
```bash
npm run dev     # Dev server (port 9000)
npm run build   # Production build
npm run watch   # Auto-rebuild
npm run lint    # Check code
```

## OpenCloud Integration
```javascript
const context = {
  fileId, fileName, fileUrl,
  getFileInfo(), getAuthToken(),
  saveFile(), uploadFile(), createShare()
};
```

## Common Operations
```javascript
// View file
await app.viewFile('path/to/file.txt');

// Download file
await app.downloadFile('path/to/file.txt');

// Create archive
await app.createArchive(files, 'zip');

// Share
await app.shareFiles(['file1', 'file2']);
```

## Performance
- 20GB ZIP: 2-5s metadata load
- 10K files: 1-3s initial load
- Memory: <100MB
- File view: <1s

## Security
✅ XSS protection
✅ Permission checks
✅ Secure sharing
✅ CSRF protection

## Limitations
❌ Encrypted archives
❌ Password protection
❌ Split archives

## Status: Production Ready ✅
Version 1.0.0 | MIT License | OpenCloud.eu
