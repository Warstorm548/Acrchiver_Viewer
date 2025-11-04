# OpenCloud Archive Viewer

A comprehensive web-based archive viewer for OpenCloud.eu that supports multiple archive formats without Python dependencies.

## Features

- **Multi-Format Support**: ZIP, TAR, TAR.GZ, GZ, TGZ, BZ2, XZ, 7Z, and RAR archives
- **Memory Efficient**: Handles 20GB+ archives using streaming and range requests
- **View Without Extracting**: Browse archive contents without full extraction
- **File Operations**:
  - View file contents (text and binary preview)
  - Edit text files directly in archive
  - Download individual files
  - Batch download selected files
- **Archive Creation**: Create new archives from uploaded files
- **OpenCloud Integration**: 
  - Seamless sharing via OpenCloud links
  - Integration with OpenCloud storage
  - Authentication and permissions
- **User Interface**:
  - Directory tree navigation
  - File search and filtering
  - Multiple sort options
  - Responsive design
  - Dark mode support

## Architecture

### Core Components

1. **index.js**: Main application entry point
   - Initializes the app
   - Handles OpenCloud context
   - Coordinates between components

2. **StreamProcessor.js**: Memory-efficient file processing
   - Streams large archives without loading entirely into memory
   - Uses HTTP range requests for selective reading
   - Extracts metadata without full decompression
   - Handles 20GB+ files efficiently

3. **ArchiveReader.js**: Archive format parsing
   - Reads ZIP, TAR, and compressed formats
   - Pagination support for large archives
   - Format detection

4. **ArchiveWriter.js**: Archive creation and modification
   - Creates ZIP, TAR, TAR.GZ archives
   - Modifies existing archives
   - Batch operations

5. **UIManager.js**: User interface management
   - Renders file browser
   - Handles user interactions
   - Manages dialogs and notifications

### Memory Efficiency

The app is designed to handle very large archives efficiently:

- **Streaming**: Files are processed in 2MB chunks
- **Range Requests**: Only required portions of archives are downloaded
- **Lazy Loading**: Directory contents loaded on-demand
- **Central Directory Reading**: ZIP files read from end, avoiding full scan
- **Progressive Rendering**: UI updates incrementally for large file lists

### Supported Formats

| Format | Read | Write | View Files | Extract | Notes |
|--------|------|-------|------------|---------|-------|
| ZIP | ✓ | ✓ | ✓ | ✓ | Full support using fflate |
| TAR | ✓ | ✓ | ✓ | ✓ | POSIX ustar format |
| TAR.GZ | ✓ | ✓ | ✓ | ✓ | Gzip compression |
| GZ | ✓ | ✓ | ✓ | ✓ | Single file compression |
| TGZ | ✓ | ✓ | ✓ | ✓ | Alias for TAR.GZ |
| TAR.BZ2 | ✓ | - | ✓ | ✓ | Requires BZ2 library |
| BZ2 | ✓ | - | ✓ | ✓ | Requires BZ2 library |
| TAR.XZ | ✓ | - | ✓ | ✓ | Requires XZ library |
| XZ | ✓ | - | ✓ | ✓ | Requires XZ library |
| 7Z | ✓* | - | ✓* | ✓* | Requires 7z library |
| RAR | ✓* | - | ✓* | ✓* | Requires unrar library |

*Note: 7Z and RAR support require additional library integration

## Installation

### For OpenCloud Development

1. Clone this repository:
```bash
git clone https://github.com/opencloud-eu/web-extensions.git
cd web-extensions/packages/web-app-archive-viewer
```

2. Install dependencies:
```bash
npm install
```

3. Build the app:
```bash
npm run build
```

4. Deploy to OpenCloud:
```bash
# Copy dist/ contents to your OpenCloud apps directory
cp -r dist/* /path/to/opencloud/apps/archive-viewer/
```

### For Development

```bash
npm run dev
```

This starts a webpack dev server at http://localhost:9000

## Usage

### Opening Archives

1. Navigate to a supported archive file in OpenCloud
2. Click to open with Archive Viewer
3. Browse contents without extraction

### Viewing Files

- Click on a file to view its contents
- Text files display with syntax highlighting
- Binary files show metadata only

### Editing Files

1. Click Edit button on text files
2. Make changes in the editor
3. Click Save to update the archive

### Downloading Files

**Single File:**
- Click download button next to file

**Multiple Files:**
1. Select files using checkboxes
2. Click "Download Selected"
3. Files are packaged into a ZIP

### Creating Archives

1. Click "Create Archive" button
2. Select format (ZIP, TAR, TAR.GZ)
3. Choose files to include
4. Archive is created and uploaded to OpenCloud

### Sharing

1. Select files or share entire archive
2. Click "Share" button
3. Copy generated link
4. Link respects OpenCloud permissions

## OpenCloud Integration

### Context API

The app integrates with OpenCloud's context API:

```javascript
// Example context usage
const context = {
  fileId: "123",
  fileName: "archive.zip",
  fileUrl: "https://cloud.example.com/files/archive.zip",
  
  // Methods
  getFileInfo(fileId) { },
  getAuthToken() { },
  saveFile(fileId, data) { },
  uploadFile(name, data) { },
  createShare(fileId) { }
};
```

### Permissions

- Read: View archive contents and download files
- Write: Edit files and modify archives
- Share: Create share links for archives

## Configuration

### appinfo/info.json

Configure the app's metadata, supported MIME types, and capabilities:

```json
{
  "id": "archive-viewer",
  "name": "Archive Viewer",
  "types": ["filesystem"],
  "mimes": [
    "application/zip",
    "application/x-tar",
    "application/gzip",
    ...
  ]
}
```

### package.json

Dependencies and build configuration.

## Performance Considerations

### Large Files (20GB+)

- Uses streaming with 2MB chunks
- Maximum 100MB memory buffer
- HTTP range requests for selective reading
- Progress indicators for long operations

### Many Files (10,000+)

- Virtual scrolling for file lists
- Lazy loading of directory contents
- Pagination support
- Efficient DOM updates

### Compression

- Streaming decompression where possible
- Worker threads for CPU-intensive operations (future enhancement)
- Adaptive chunk sizes based on file size

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires:
- ES6+ support
- Fetch API
- ArrayBuffer/TypedArrays
- Web Workers (optional, for performance)

## Security

- All file operations respect OpenCloud permissions
- No server-side code execution
- XSS protection via HTML escaping
- CSRF tokens for API requests
- Secure share link generation

## Limitations

1. **7Z and RAR**: Require additional libraries for full support
2. **BZ2 and XZ**: Require specialized decompression libraries
3. **Encrypted Archives**: Not supported
4. **Split Archives**: Not supported (.z01, .z02, etc.)
5. **Password Protection**: Not supported

## Development

### Project Structure

```
web-app-archive-viewer/
├── src/
│   ├── index.js              # Main entry point
│   ├── lib/
│   │   ├── ArchiveReader.js  # Read archives
│   │   ├── ArchiveWriter.js  # Create archives
│   │   ├── StreamProcessor.js # Streaming I/O
│   │   └── UIManager.js      # UI handling
│   └── styles/
│       └── main.css          # Stylesheets
├── appinfo/
│   └── info.json             # App metadata
├── dist/                     # Built files
├── package.json
├── webpack.config.js
└── README.md
```

### Adding Format Support

To add support for a new archive format:

1. Add format detection to `detectArchiveType()`
2. Implement metadata extraction in `StreamProcessor`
3. Implement file extraction
4. Add MIME type to `appinfo/info.json`
5. Update documentation

### Testing

```bash
# Run linter
npm run lint

# Build for production
npm run build

# Watch mode for development
npm run watch
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Credits

Built for OpenCloud.eu using:
- fflate (ZIP compression)
- tar-stream (TAR archives)
- pako (gzip compression)

## Support

- Documentation: https://docs.opencloud.eu
- Issues: https://github.com/opencloud-eu/web-extensions/issues
- Forum: https://forum.opencloud.eu
