# API Documentation — ArchiveViewerApp (part 1 of 3)

> **Original uploaded doc — not verified against the code.** For the actual current state see [project status](../../overview/project-status.md) and the index in `CLAUDE.md`.

Parts: **1. ArchiveViewerApp** · [2. StreamProcessor, ArchiveReader, ArchiveWriter](stream-reader-writer.md) · [3. UIManager, context, misc](ui-manager-and-context.md)

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

