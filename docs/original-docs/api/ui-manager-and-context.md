# API Documentation — UIManager, OpenCloud Context, misc (part 3 of 3)

> **Original uploaded doc — not verified against the code.** For the actual current state see [project status](../../overview/project-status.md) and the index in `CLAUDE.md`.

Parts: [1. ArchiveViewerApp](archive-viewer-app.md) · [2. StreamProcessor, ArchiveReader, ArchiveWriter](stream-reader-writer.md) · **3. UIManager, context, misc**

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
