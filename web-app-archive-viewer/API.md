# API Documentation

## Table of Contents

1. [ArchiveViewerApp](#archiveviewerapp)
2. [StreamProcessor](#streamprocessor)
3. [ArchiveReader](#archivereader)
4. [ArchiveWriter](#archivewriter)
5. [UIManager](#uimanager)
6. [OpenCloud Context](#opencloud-context)

---

## ArchiveViewerApp

Main application class that coordinates all components.

### Constructor

```javascript
new ArchiveViewerApp()
```

### Methods

#### `init(context)`

Initialize the application with OpenCloud context.

**Parameters:**
- `context` (Object): OpenCloud context object

**Returns:** Promise<void>

**Example:**
```javascript
const app = new ArchiveViewerApp();
await app.init(openCloudContext);
```

#### `loadArchiveMetadata()`

Load archive metadata using streaming without extracting entire archive.

**Returns:** Promise<void>

**Throws:** Error if archive cannot be loaded

#### `viewFile(entryPath)`

View file contents from archive without extracting entire archive.

**Parameters:**
- `entryPath` (string): Path to file within archive

**Returns:** Promise<void>

**Example:**
```javascript
await app.viewFile('documents/readme.txt');
```

#### `editFile(entryPath, newContent)`

Edit file contents and update archive.

**Parameters:**
- `entryPath` (string): Path to file within archive
- `newContent` (string): New file content

**Returns:** Promise<void>

#### `downloadFile(entryPath)`

Download single file from archive.

**Parameters:**
- `entryPath` (string): Path to file within archive

**Returns:** Promise<void>

#### `downloadSelectedFiles()`

Batch download selected files as ZIP.

**Returns:** Promise<void>

**Throws:** Error if no files selected

#### `createArchive(files, format)`

Create new archive from uploaded files.

**Parameters:**
- `files` (FileList|Array<File>): Files to include in archive
- `format` (string): Archive format ('zip', 'tar', 'tar.gz')

**Returns:** Promise<void>

**Example:**
```javascript
await app.createArchive(fileList, 'zip');
```

#### `shareFiles(entries)`

Share archive or specific files via OpenCloud sharing.

**Parameters:**
- `entries` (Array<string>): Array of entry paths to share (empty for entire archive)

**Returns:** Promise<void>

#### `toggleFileSelection(entryPath)`

Toggle file selection state.

**Parameters:**
- `entryPath` (string): Path to file within archive

**Returns:** void

#### `clearSelection()`

Clear all file selections.

**Returns:** void

#### `detectArchiveType(filename)`

Detect archive type from filename.

**Parameters:**
- `filename` (string): Archive filename

**Returns:** string - Archive type ('zip', 'tar', 'tar.gz', etc.)

**Throws:** Error if format unsupported

#### `isTextFile(filename)`

Check if file is text-based.

**Parameters:**
- `filename` (string): File name

**Returns:** boolean

#### `formatFileSize(bytes)`

Format file size for display.

**Parameters:**
- `bytes` (number): Size in bytes

**Returns:** string - Formatted size (e.g., "1.5 MB")

---

## StreamProcessor

Handles streaming extraction for large archives with memory efficiency.

### Constructor

```javascript
new StreamProcessor()
```

### Properties

- `CHUNK_SIZE` (number): Size of chunks for streaming (default: 2MB)
- `MAX_MEMORY_USAGE` (number): Maximum memory buffer (default: 100MB)

### Methods

#### `extractMetadata(fileUrl, archiveType, fileSize, context)`

Extract archive metadata using streaming.

**Parameters:**
- `fileUrl` (string): URL to archive file
- `archiveType` (string): Type of archive
- `fileSize` (number): Size of archive in bytes
- `context` (Object): OpenCloud context

**Returns:** Promise<Object>
```javascript
{
  entries: Array<{
    path: string,
    name: string,
    compressedSize: number,
    uncompressedSize: number,
    isDirectory: boolean
  }>,
  totalFiles: number,
  totalDirs: number,
  uncompressedSize: number
}
```

#### `extractSingleFile(fileUrl, archiveType, entryPath, context)`

Extract single file from archive using streaming.

**Parameters:**
- `fileUrl` (string): URL to archive file
- `archiveType` (string): Type of archive
- `entryPath` (string): Path to file within archive
- `context` (Object): OpenCloud context

**Returns:** Promise<Uint8Array> - File contents

#### `extractZipMetadata(fileUrl, fileSize, context)`

Extract ZIP metadata using central directory.

**Parameters:**
- `fileUrl` (string): URL to ZIP file
- `fileSize` (number): Size of ZIP in bytes
- `context` (Object): OpenCloud context

**Returns:** Promise<Object> - Metadata object

#### `extractTarMetadata(fileUrl, archiveType, fileSize, context)`

Extract TAR metadata using streaming.

**Parameters:**
- `fileUrl` (string): URL to TAR file
- `archiveType` (string): TAR variant ('tar', 'tar.gz', etc.)
- `fileSize` (number): Size of TAR in bytes
- `context` (Object): OpenCloud context

**Returns:** Promise<Object> - Metadata object

#### `fetchRange(fileUrl, start, end, context)`

Fetch byte range from file URL.

**Parameters:**
- `fileUrl` (string): URL to file
- `start` (number): Start byte offset
- `end` (number): End byte offset
- `context` (Object): OpenCloud context

**Returns:** Promise<Uint8Array> - Requested bytes

---

## ArchiveReader

Handles reading archive contents with pagination support.

### Constructor

```javascript
new ArchiveReader()
```

### Properties

- `supportedFormats` (Array<string>): List of supported formats

### Methods

#### `isSupported(format)`

Check if format is supported.

**Parameters:**
- `format` (string): Archive format

**Returns:** boolean

#### `readEntries(fileData, format, offset, limit)`

Read archive entries with pagination.

**Parameters:**
- `fileData` (Uint8Array): Archive data
- `format` (string): Archive format
- `offset` (number): Starting entry index (default: 0)
- `limit` (number): Maximum entries to return (default: 1000)

**Returns:** Promise<Object>
```javascript
{
  entries: Array<Object>,
  hasMore: boolean
}
```

---

## ArchiveWriter

Handles creating and modifying archives.

### Constructor

```javascript
new ArchiveWriter()
```

### Properties

- `CHUNK_SIZE` (number): Size of chunks for processing (default: 2MB)

### Methods

#### `createArchiveFromFiles(files, format)`

Create new archive from files.

**Parameters:**
- `files` (Array<File>): Files to include
- `format` (string): Archive format ('zip', 'tar', 'tar.gz')

**Returns:** Promise<Uint8Array> - Archive data

**Example:**
```javascript
const writer = new ArchiveWriter();
const zipData = await writer.createArchiveFromFiles(files, 'zip');
```

#### `createZip(files)`

Create ZIP archive.

**Parameters:**
- `files` (Array<File>): Files to include

**Returns:** Promise<Uint8Array> - ZIP data

#### `createTar(files)`

Create TAR archive.

**Parameters:**
- `files` (Array<File>): Files to include

**Returns:** Promise<Uint8Array> - TAR data

#### `createTarGz(files)`

Create TAR.GZ archive.

**Parameters:**
- `files` (Array<File>): Files to include

**Returns:** Promise<Uint8Array> - TAR.GZ data

#### `createArchiveFromEntries(fileUrl, sourceType, entryPaths, targetType, context)`

Create archive from specific entries of another archive.

**Parameters:**
- `fileUrl` (string): URL to source archive
- `sourceType` (string): Source archive type
- `entryPaths` (Array<string>): Paths of entries to include
- `targetType` (string): Target archive type
- `context` (Object): OpenCloud context

**Returns:** Promise<Uint8Array> - New archive data

---

## UIManager

Handles all UI rendering and user interactions.

### Constructor

```javascript
new UIManager(app)
```

**Parameters:**
- `app` (ArchiveViewerApp): Application instance

### Properties

- `container` (HTMLElement): Main container element
- `currentView` (string): Current view mode ('list', 'viewer', 'editor')
- `sortBy` (string): Current sort field
- `sortOrder` (string): Current sort order ('asc', 'desc')
- `currentPath` (string): Current directory path

### Methods

#### `init()`

Initialize UI and render.

**Returns:** Promise<void>

#### `displayArchiveContents(archive)`

Display archive contents in file list.

**Parameters:**
- `archive` (Object): Archive object with entries

**Returns:** void

#### `showFileViewer(path, content, type)`

Show file viewer for text or binary content.

**Parameters:**
- `path` (string): File path
- `content` (string|Uint8Array): File content
- `type` (string): Content type ('text' or 'binary')

**Returns:** void

#### `showFileEditor(path)`

Show file editor for text files.

**Parameters:**
- `path` (string): File path

**Returns:** Promise<void>

#### `showCreateArchiveDialog()`

Show dialog for creating new archive.

**Returns:** void

#### `showShareDialog(shareLink)`

Show dialog with share link.

**Parameters:**
- `shareLink` (string): Share URL

**Returns:** void

#### `updateSelectionCount(count)`

Update selection counter display.

**Parameters:**
- `count` (number): Number of selected files

**Returns:** void

#### `updateStatus(message)`

Update status bar message.

**Parameters:**
- `message` (string): Status message

**Returns:** void

#### `showLoading(message)`

Show loading overlay.

**Parameters:**
- `message` (string): Loading message (default: 'Loading...')

**Returns:** void

#### `hideLoading()`

Hide loading overlay.

**Returns:** void

#### `showError(message)`

Show error notification.

**Parameters:**
- `message` (string): Error message

**Returns:** void

#### `showSuccess(message)`

Show success notification.

**Parameters:**
- `message` (string): Success message

**Returns:** void

---

## OpenCloud Context

Interface that OpenCloud provides to the application.

### Properties

- `fileId` (string): Current file ID
- `fileName` (string): Current file name
- `fileUrl` (string): URL to access file

### Methods

#### `getFileInfo(fileId)`

Get file information.

**Parameters:**
- `fileId` (string): File ID

**Returns:** Promise<Object>
```javascript
{
  id: string,
  name: string,
  size: number,
  mimeType: string,
  modified: Date
}
```

#### `getAuthToken()`

Get authentication token for API requests.

**Returns:** string - Auth token

#### `saveFile(fileId, data)`

Save file data.

**Parameters:**
- `fileId` (string): File ID
- `data` (Uint8Array|ArrayBuffer): File data

**Returns:** Promise<boolean>

#### `uploadFile(name, data)`

Upload new file.

**Parameters:**
- `name` (string): File name
- `data` (Uint8Array|ArrayBuffer): File data

**Returns:** Promise<string> - New file ID

#### `createShare(fileId)`

Create share link for file.

**Parameters:**
- `fileId` (string): File ID

**Returns:** Promise<string> - Share URL

---

## Error Handling

All async methods may throw errors. Recommended error handling:

```javascript
try {
  await app.viewFile('document.txt');
} catch (error) {
  console.error('Failed to view file:', error);
  app.uiManager.showError(error.message);
}
```

### Common Error Types

- `Error('Unsupported archive format')` - Archive type not supported
- `Error('File not found: path')` - Entry doesn't exist in archive
- `Error('Failed to fetch range')` - Network error during streaming
- `Error('Not a valid ZIP archive')` - Corrupted or invalid archive
- `Error('Memory error')` - Out of memory (rare with streaming)

---

## Events

The application doesn't currently emit custom events, but this may be added in future versions.

---

## TypeScript Definitions

TypeScript definitions are planned for v1.1. For now, use JSDoc comments for IDE autocomplete.

---

## Performance Tips

1. **Large Archives**: Use streaming methods (extractMetadata, extractSingleFile)
2. **Many Files**: Enable pagination and virtual scrolling
3. **Memory Usage**: Monitor with browser dev tools
4. **Network**: Use appropriate CHUNK_SIZE for connection speed

---

## Browser API Usage

The app uses these browser APIs:

- Fetch API (with Range headers)
- File API
- ArrayBuffer/TypedArrays
- TextEncoder/TextDecoder
- Blob API
- URL.createObjectURL
- FileReader

All are supported in modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+).
