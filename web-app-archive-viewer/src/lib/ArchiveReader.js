/**
 * ArchiveReader - Handles reading archive contents
 */

export class ArchiveReader {
  constructor() {
    this.supportedFormats = ['zip', 'tar', 'tar.gz', 'gz', 'bz2', 'xz', '7z', 'rar'];
  }

  /**
   * Check if format is supported
   */
  isSupported(format) {
    return this.supportedFormats.includes(format);
  }

  /**
   * Read archive entries with pagination support
   */
  async readEntries(fileData, format, offset = 0, limit = 1000) {
    switch (format) {
      case 'zip':
        return await this.readZipEntries(fileData, offset, limit);
      case 'tar':
      case 'tar.gz':
      case 'tar.bz2':
      case 'tar.xz':
        return await this.readTarEntries(fileData, format, offset, limit);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Read ZIP entries using fflate
   */
  async readZipEntries(fileData, offset, limit) {
    const { unzip } = await import('fflate');
    
    return new Promise((resolve, reject) => {
      unzip(fileData, { filter: (file) => true }, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        const entries = Object.entries(result)
          .slice(offset, offset + limit)
          .map(([path, data]) => ({
            path,
            name: path.split('/').pop(),
            size: data.length,
            isDirectory: path.endsWith('/')
          }));

        resolve({
          entries,
          hasMore: Object.keys(result).length > offset + limit
        });
      });
    });
  }

  /**
   * Read TAR entries
   */
  async readTarEntries(fileData, format, offset, limit) {
    // Decompress if needed
    let tarData = fileData;
    if (format !== 'tar') {
      const { ungzip } = await import('fflate');
      tarData = ungzip(fileData);
    }

    const entries = [];
    let currentOffset = 0;
    let entryCount = 0;

    while (currentOffset < tarData.length && entries.length < limit) {
      // Skip to desired offset
      if (entryCount < offset) {
        entryCount++;
        currentOffset += 512; // Skip header
        const size = this.readTarSize(tarData, currentOffset - 512);
        currentOffset += Math.ceil(size / 512) * 512;
        continue;
      }

      const header = tarData.slice(currentOffset, currentOffset + 512);
      
      // Check for end of archive
      if (this.isZeroBlock(header)) break;

      const entry = this.parseTarHeader(header);
      if (entry) {
        entries.push(entry);
      }

      currentOffset += 512 + Math.ceil(entry.size / 512) * 512;
      entryCount++;
    }

    return {
      entries,
      hasMore: currentOffset < tarData.length
    };
  }

  /**
   * Read TAR file size from header
   */
  readTarSize(data, offset) {
    const sizeBytes = data.slice(offset + 124, offset + 136);
    const sizeStr = String.fromCharCode(...sizeBytes).trim();
    return parseInt(sizeStr, 8) || 0;
  }

  /**
   * Parse TAR header
   */
  parseTarHeader(header) {
    const name = String.fromCharCode(...header.slice(0, 100)).split('\0')[0];
    if (!name) return null;

    const size = this.readTarSize(header, 0);
    const typeFlag = String.fromCharCode(header[156]);

    return {
      path: name,
      name: name.split('/').pop(),
      size,
      isDirectory: typeFlag === '5' || name.endsWith('/')
    };
  }

  /**
   * Check if block is all zeros
   */
  isZeroBlock(data) {
    return data.every(byte => byte === 0);
  }
}
