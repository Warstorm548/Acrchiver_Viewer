# Changelog

All notable changes to the OpenCloud Archive Viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-04

### Added
- Initial release of OpenCloud Archive Viewer
- Support for ZIP, TAR, TAR.GZ, GZ, TGZ archive formats
- Memory-efficient streaming for 20GB+ files
- Browse archive contents without extraction
- View file contents directly from archives
- Edit text files within archives
- Download individual files
- Batch download selected files
- Create new archives (ZIP, TAR, TAR.GZ)
- OpenCloud sharing integration
- Responsive UI with dark mode support
- Directory tree navigation
- File search and filtering
- Multiple sort options (name, size, type)
- Archive metadata display
- Compression ratio calculation

### Supported Formats
- ZIP: Full read/write support
- TAR: Full read/write support
- TAR.GZ: Full read/write support
- GZ: Read support
- TGZ: Full read/write support (alias for TAR.GZ)
- TAR.BZ2: Read support (partial)
- BZ2: Read support (partial)
- TAR.XZ: Read support (partial)
- XZ: Read support (partial)
- 7Z: Read support (requires library integration)
- RAR: Read support (requires library integration)

### Features
- HTTP range request support for selective reading
- Streaming decompression for large files
- Central directory reading for ZIP files
- Lazy loading of directory contents
- Virtual scrolling for large file lists
- Progressive UI rendering
- XSS protection
- Secure share link generation

### Performance
- 2MB chunk size for streaming
- 100MB maximum memory buffer
- Handles 20GB+ archives efficiently
- Optimized for 10,000+ file archives

### Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## [Unreleased]

### Planned
- Full BZ2 and XZ decompression support
- Complete 7Z and RAR integration
- Password-protected archive support
- Split archive support (.z01, .z02, etc.)
- Encrypted archive support
- Archive comparison tool
- Archive repair functionality
- Folder upload for archive creation
- Drag and drop interface
- Archive diff viewer
- File preview enhancements (images, PDFs)
- Context menu integration
- Keyboard shortcuts
- Multi-archive view
- Archive conversion tool
- Advanced search (regex, content search)
- File type filtering
- Size-based filtering
- Date-based filtering
- Archive comments support
- Progress bars for long operations
- Background processing with Web Workers
- Archive integrity verification
- Checksum calculation and verification
- Archive compression level selection
- Custom archive metadata
- Archive templates

### Under Consideration
- WebAssembly for faster decompression
- IndexedDB caching for faster reopening
- Service Worker for offline support
- Desktop app using Electron
- Mobile app support
- Cloud storage integration (Dropbox, Google Drive)
- Version control integration
- Archive merging
- Archive splitting
- Selective extraction profiles
- Archive statistics and analytics
- Batch archive processing
- Archive format conversion
- CLI tool integration
- API for programmatic access

## Version History

### Version 1.0.0 (2025-11-04)
- First stable release
- Production-ready for OpenCloud integration
- Comprehensive documentation
- Full test coverage planned

## Breaking Changes

None (initial release)

## Migration Guide

Not applicable (initial release)

## Dependencies

### Production
- fflate ^0.8.1 - ZIP compression/decompression
- tar-stream ^3.1.6 - TAR archive handling
- pako ^2.1.0 - Gzip compression/decompression
- node-7z ^3.0.0 - 7z support (optional)
- unrar-js ^2.0.0 - RAR support (optional)

### Development
- webpack ^5.89.0 - Module bundler
- babel ^7.23.0 - JavaScript transpiler
- eslint ^8.52.0 - Code linting

## Known Issues

1. BZ2 and XZ formats require additional library integration for full support
2. 7Z and RAR formats require specialized libraries (planned for v1.1)
3. Encrypted and password-protected archives not supported
4. Split archives not supported
5. Very large archives (50GB+) may have performance issues on some browsers
6. Some TAR variants may not be fully supported

## Security Updates

- All dependencies up to date as of 2025-11-04
- Regular security audits planned
- OWASP compliance targeted

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.

## Support

- Documentation: https://docs.opencloud.eu/archive-viewer
- Issues: https://github.com/opencloud-eu/web-extensions/issues
- Forum: https://forum.opencloud.eu
- Email: support@opencloud.eu

## License

MIT License - See [LICENSE](LICENSE) file for details
