# API Documentation — StreamProcessor, ArchiveReader, ArchiveWriter (part 2 of 3)

> **Original uploaded doc — not verified against the code.** For the actual current state see [project status](../../overview/project-status.md) and the index in `CLAUDE.md`.

Parts: [1. ArchiveViewerApp](archive-viewer-app.md) · **2. StreamProcessor, ArchiveReader, ArchiveWriter** · [3. UIManager, context, misc](ui-manager-and-context.md)

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
