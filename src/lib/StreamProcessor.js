/**
 * StreamProcessor - Handles streaming extraction for large archives
 * Memory efficient processing for 20GB+ files
 */

export class StreamProcessor {
  constructor() {
    this.CHUNK_SIZE = 1024 * 1024 * 2; // 2MB chunks for streaming
    this.MAX_MEMORY_USAGE = 1024 * 1024 * 100; // 100MB max memory buffer
  }

  /**
   * Extract metadata from archive using streaming without loading entire file
   */
  async extractMetadata(fileUrl, archiveType, fileSize, context) {
    switch (archiveType) {
      case 'zip':
        return await this.extractZipMetadata(fileUrl, fileSize, context);
      case 'tar':
      case 'tar.gz':
      case 'tar.bz2':
      case 'tar.xz':
        return await this.extractTarMetadata(fileUrl, archiveType, fileSize, context);
      case 'gz':
      case 'bz2':
      case 'xz':
        return await this.extractCompressedMetadata(fileUrl, archiveType, fileSize, context);
      case '7z':
        return await this.extract7zMetadata(fileUrl, fileSize, context);
      case 'rar':
        return await this.extractRarMetadata(fileUrl, fileSize, context);
      default:
        throw new Error(`Unsupported archive type: ${archiveType}`);
    }
  }

  /**
   * Extract ZIP metadata using central directory (at end of file)
   */
  async extractZipMetadata(fileUrl, fileSize, context) {
    // Read last 64KB to find End of Central Directory Record
    const endChunkSize = Math.min(65536, fileSize);
    const endChunk = await this.fetchRange(fileUrl, fileSize - endChunkSize, fileSize, context);
    
    // Find EOCD signature (0x06054b50)
    const eocdOffset = this.findEOCD(endChunk);
    if (eocdOffset === -1) {
      throw new Error('Not a valid ZIP archive');
    }

    const dataView = new DataView(endChunk.buffer, eocdOffset);
    const centralDirSize = dataView.getUint32(12, true);
    const centralDirOffset = dataView.getUint32(16, true);
    const totalEntries = dataView.getUint16(10, true);

    // Fetch central directory
    const centralDir = await this.fetchRange(
      fileUrl,
      centralDirOffset,
      centralDirOffset + centralDirSize,
      context
    );

    // Parse central directory entries
    const entries = this.parseZipCentralDirectory(centralDir, totalEntries);
    
    return {
      entries,
      totalFiles: entries.filter(e => !e.isDirectory).length,
      totalDirs: entries.filter(e => e.isDirectory).length,
      uncompressedSize: entries.reduce((sum, e) => sum + e.uncompressedSize, 0)
    };
  }

  /**
   * Find End of Central Directory in ZIP
   */
  findEOCD(data) {
    const signature = 0x06054b50;
    for (let i = data.length - 22; i >= 0; i--) {
      const view = new DataView(data.buffer, i);
      if (view.getUint32(0, true) === signature) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Parse ZIP central directory entries
   */
  parseZipCentralDirectory(data, totalEntries) {
    const entries = [];
    let offset = 0;
    const dataView = new DataView(data.buffer);

    for (let i = 0; i < totalEntries; i++) {
      if (dataView.getUint32(offset, true) !== 0x02014b50) {
        break;
      }

      const fileNameLength = dataView.getUint16(offset + 28, true);
      const extraFieldLength = dataView.getUint16(offset + 30, true);
      const commentLength = dataView.getUint16(offset + 32, true);
      const compressedSize = dataView.getUint32(offset + 20, true);
      const uncompressedSize = dataView.getUint32(offset + 24, true);
      const localHeaderOffset = dataView.getUint32(offset + 42, true);

      const fileNameBytes = new Uint8Array(data.buffer, offset + 46, fileNameLength);
      const fileName = new TextDecoder().decode(fileNameBytes);
      
      const isDirectory = fileName.endsWith('/');

      entries.push({
        path: fileName,
        name: fileName.split('/').filter(Boolean).pop() || fileName,
        compressedSize,
        uncompressedSize,
        isDirectory,
        offset: localHeaderOffset
      });

      offset += 46 + fileNameLength + extraFieldLength + commentLength;
    }

    return entries;
  }

  /**
   * Extract TAR metadata using streaming
   */
  async extractTarMetadata(fileUrl, archiveType, fileSize, context) {
    const entries = [];
    let offset = 0;
    let totalUncompressed = 0;

    // Determine if we need decompression
    const needsDecompression = archiveType !== 'tar';
    
    while (offset < fileSize) {
      // Fetch header (512 bytes)
      const headerSize = 512;
      let headerData;
      
      if (needsDecompression) {
        // For compressed TAR, we need to decompress chunks
        const chunk = await this.fetchRange(fileUrl, offset, Math.min(offset + this.CHUNK_SIZE, fileSize), context);
        const decompressed = await this.decompress(chunk, archiveType);
        headerData = decompressed.slice(0, headerSize);
      } else {
        headerData = await this.fetchRange(fileUrl, offset, offset + headerSize, context);
      }

      // Check if we've reached the end (two consecutive zero blocks)
      if (this.isZeroBlock(headerData)) {
        break;
      }

      // Parse TAR header
      const entry = this.parseTarHeader(headerData);
      if (!entry) break;

      entries.push(entry);
      totalUncompressed += entry.uncompressedSize;

      // Move to next header (512-byte aligned)
      const fileBlocks = Math.ceil(entry.uncompressedSize / 512);
      offset += headerSize + (fileBlocks * 512);

      // Safety check to prevent infinite loops
      if (entries.length > 1000000) {
        console.warn('Too many entries, stopping metadata extraction');
        break;
      }
    }

    return {
      entries,
      totalFiles: entries.filter(e => !e.isDirectory).length,
      totalDirs: entries.filter(e => e.isDirectory).length,
      uncompressedSize: totalUncompressed
    };
  }

  /**
   * Parse TAR header (POSIX ustar format)
   */
  parseTarHeader(header) {
    if (header.length < 512) return null;

    // Check for valid header magic
    const magic = String.fromCharCode(...header.slice(257, 263));
    if (!magic.startsWith('ustar')) {
      return null;
    }

    const nameBytes = header.slice(0, 100);
    const name = this.readNullTerminatedString(nameBytes);
    
    if (!name) return null;

    const sizeBytes = header.slice(124, 136);
    const sizeStr = this.readNullTerminatedString(sizeBytes);
    const size = parseInt(sizeStr, 8) || 0;

    const typeFlag = String.fromCharCode(header[156]);
    const isDirectory = typeFlag === '5' || name.endsWith('/');

    return {
      path: name,
      name: name.split('/').filter(Boolean).pop() || name,
      compressedSize: size,
      uncompressedSize: size,
      isDirectory
    };
  }

  /**
   * Read null-terminated string from byte array
   */
  readNullTerminatedString(bytes) {
    let end = 0;
    while (end < bytes.length && bytes[end] !== 0) {
      end++;
    }
    return new TextDecoder().decode(bytes.slice(0, end));
  }

  /**
   * Check if TAR block is all zeros
   */
  isZeroBlock(data) {
    return data.every(byte => byte === 0);
  }

  /**
   * Extract single file from archive using streaming
   */
  async extractSingleFile(fileUrl, archiveType, entryPath, context) {
    switch (archiveType) {
      case 'zip':
        return await this.extractZipFile(fileUrl, entryPath, context);
      case 'tar':
      case 'tar.gz':
      case 'tar.bz2':
      case 'tar.xz':
        return await this.extractTarFile(fileUrl, archiveType, entryPath, context);
      case 'gz':
      case 'bz2':
      case 'xz':
        return await this.extractCompressedFile(fileUrl, archiveType, context);
      case '7z':
        return await this.extract7zFile(fileUrl, entryPath, context);
      case 'rar':
        return await this.extractRarFile(fileUrl, entryPath, context);
      default:
        throw new Error(`Unsupported archive type: ${archiveType}`);
    }
  }

  /**
   * Extract single file from ZIP
   */
  async extractZipFile(fileUrl, entryPath, context) {
    // First get metadata to find file offset
    const metadata = await this.extractZipMetadata(fileUrl, 0, context);
    const entry = metadata.entries.find(e => e.path === entryPath);
    
    if (!entry) {
      throw new Error(`File not found: ${entryPath}`);
    }

    // Fetch local file header
    const localHeaderSize = 30;
    const localHeader = await this.fetchRange(
      fileUrl,
      entry.offset,
      entry.offset + localHeaderSize,
      context
    );

    const dataView = new DataView(localHeader.buffer);
    const fileNameLength = dataView.getUint16(26, true);
    const extraFieldLength = dataView.getUint16(28, true);

    // Calculate data offset
    const dataOffset = entry.offset + localHeaderSize + fileNameLength + extraFieldLength;

    // Fetch compressed data
    const compressedData = await this.fetchRange(
      fileUrl,
      dataOffset,
      dataOffset + entry.compressedSize,
      context
    );

    // Decompress using fflate
    const compressionMethod = dataView.getUint16(8, true);
    
    if (compressionMethod === 0) {
      // Stored (no compression)
      return compressedData;
    } else if (compressionMethod === 8) {
      // Deflate compression
      const { inflate } = await import('fflate');
      return inflate(compressedData);
    } else {
      throw new Error(`Unsupported compression method: ${compressionMethod}`);
    }
  }

  /**
   * Extract single file from TAR
   */
  async extractTarFile(fileUrl, archiveType, entryPath, context) {
    // For TAR files, we need to scan through to find the file
    const metadata = await this.extractTarMetadata(fileUrl, archiveType, 0, context);
    const entry = metadata.entries.find(e => e.path === entryPath);
    
    if (!entry) {
      throw new Error(`File not found: ${entryPath}`);
    }

    // This is a simplified implementation
    // In production, you'd need to track offsets during metadata extraction
    throw new Error('TAR single file extraction requires full implementation');
  }

  /**
   * Extract metadata for single compressed files (GZ, BZ2, XZ)
   */
  async extractCompressedMetadata(fileUrl, archiveType, fileSize, context) {
    // These are single-file compressions
    const fileName = fileUrl.split('/').pop().replace(/\.(gz|bz2|xz)$/, '');
    
    return {
      entries: [{
        path: fileName,
        name: fileName,
        compressedSize: fileSize,
        uncompressedSize: 0, // Unknown until decompressed
        isDirectory: false
      }],
      totalFiles: 1,
      totalDirs: 0,
      uncompressedSize: 0
    };
  }

  /**
   * Extract 7z metadata (requires 7z library)
   */
  async extract7zMetadata(fileUrl, fileSize, context) {
    // 7z format is complex and requires specialized library
    // This is a placeholder for the implementation
    throw new Error('7z support requires additional implementation');
  }

  /**
   * Extract RAR metadata (requires unrar library)
   */
  async extractRarMetadata(fileUrl, fileSize, context) {
    // RAR format requires specialized library
    // This is a placeholder for the implementation
    throw new Error('RAR support requires additional implementation');
  }

  /**
   * Fetch byte range from file URL
   */
  async fetchRange(fileUrl, start, end, context) {
    const response = await fetch(fileUrl, {
      headers: {
        'Range': `bytes=${start}-${end - 1}`,
        'Authorization': context.getAuthToken()
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch range: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Decompress data based on archive type
   */
  async decompress(data, archiveType) {
    const { ungzip, unzlib } = await import('fflate');
    const pako = await import('pako');

    switch (archiveType) {
      case 'tar.gz':
      case 'gz':
        return ungzip(data);
      case 'tar.bz2':
      case 'bz2':
        // BZ2 decompression requires specialized library
        throw new Error('BZ2 decompression not yet implemented');
      case 'tar.xz':
      case 'xz':
        // XZ decompression requires specialized library
        throw new Error('XZ decompression not yet implemented');
      default:
        return data;
    }
  }

  /**
   * Extract compressed file
   */
  async extractCompressedFile(fileUrl, archiveType, context) {
    // Fetch entire compressed file in chunks
    const chunks = [];
    let offset = 0;
    const fileSize = await this.getFileSize(fileUrl, context);

    while (offset < fileSize) {
      const chunkEnd = Math.min(offset + this.CHUNK_SIZE, fileSize);
      const chunk = await this.fetchRange(fileUrl, offset, chunkEnd, context);
      chunks.push(chunk);
      offset = chunkEnd;
    }

    // Concatenate chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const compressedData = new Uint8Array(totalLength);
    let position = 0;
    for (const chunk of chunks) {
      compressedData.set(chunk, position);
      position += chunk.length;
    }

    // Decompress
    return await this.decompress(compressedData, archiveType);
  }

  /**
   * Get file size using HEAD request
   */
  async getFileSize(fileUrl, context) {
    const response = await fetch(fileUrl, {
      method: 'HEAD',
      headers: {
        'Authorization': context.getAuthToken()
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get file size: ${response.statusText}`);
    }

    const contentLength = response.headers.get('Content-Length');
    return parseInt(contentLength, 10);
  }

  /**
   * Extract 7z file (placeholder)
   */
  async extract7zFile(fileUrl, entryPath, context) {
    throw new Error('7z extraction requires additional implementation');
  }

  /**
   * Extract RAR file (placeholder)
   */
  async extractRarFile(fileUrl, entryPath, context) {
    throw new Error('RAR extraction requires additional implementation');
  }
}
